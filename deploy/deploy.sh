#!/usr/bin/env bash
# Deploy a Capi release on the server (see docs/runbooks/deploy.md).
#
#   deploy.sh vX.Y.Z [compose-file]
#   deploy.sh --staging sha-<commit> [compose-file]
#
# Runs as the `deploy` user in CAPI_DIR (FINANCES_DIR before #464; default
# /srv/capi), next to docker-compose.prod.yml and .env. Steps: install the
# release's compose file (when given), set CAPI_VERSION in .env, pull the images, run the
# migrations then the seed from the new API image, `up -d`, and poll the health
# endpoint through `web`. If any step fails after .env was changed, the previous
# version (and compose file) is restored and brought back up, and the script
# exits non-zero. Concurrent runs are refused (flock).
#
# The app was named « Finances » until #464 (docs/runbooks/rename.md): a
# release before it names the version FINANCES_VERSION and the adapter's
# service `finances-mcp`. So that a rollback to one of them works, .env gets
# both CAPI_VERSION and FINANCES_VERSION, with the same value, and the adapter
# is found under either name.
#
# The compose project is the one the compose files name (`name:`, the
# staging override's for staging), passed with `-p`. When a release changes it
# (#464's step B: `finances` → `capi`, `finances-staging` → `capi-staging`, or
# back on a rollback), the database volume keeps its name (DB_VOLUME in .env)
# and two Postgres must never run on it: the script checks that the volume
# exists, stops the project it replaces (`down`, never `-v`) just before the
# migrations, and on a failure stops the new project before starting the
# previous one again.
#
# The remote MCP adapter (`capi-mcp`, #328) is part of the release only
# when the compose file has it and its profile is on (COMPOSE_PROFILES in
# .env): it is then pulled and health-checked too, and a rollback to a version
# without it removes its container (`--remove-orphans`).
#
# --staging (#421, docs/runbooks/staging.md) deploys a commit of main to the
# staging project instead: the directory defaults to /srv/capi-staging, the
# version is an image tag sha-<commit>, the compose project must end in
# `-staging` (and must not in production), and it runs docker-compose.prod.yml with the
# docker-compose.staging.yml override (installed from the compose file's
# directory along with it). After the seed it wipes the database and fills it
# with the demo data (seed-demo.js --reset), so staging never holds anything
# else. It refuses to run the MCP adapter, and refuses a configuration that
# would answer on one of `web`'s production aliases on the `proxy` network.
#
# The output is also appended to deploy.log in that directory, and SIGHUP is ignored,
# so a dropped SSH connection (cancelled CI job) doesn't stop a deploy halfway.
set -euo pipefail

mode=production
if [[ ${1:-} == --staging ]]; then
  mode=staging
  shift
fi

if [[ $mode == staging ]]; then
  DEPLOY_DIR=${CAPI_DIR:-${FINANCES_DIR:-/srv/capi-staging}}
  VERSION_PATTERN='^sha-[0-9a-f]{7,40}$'
  COMPOSE_FILES=(docker-compose.prod.yml docker-compose.staging.yml)
else
  DEPLOY_DIR=${CAPI_DIR:-${FINANCES_DIR:-/srv/capi}}
  VERSION_PATTERN='^v[0-9]+\.[0-9]+\.[0-9]+$'
  COMPOSE_FILES=(docker-compose.prod.yml)
fi
HEALTH_RETRIES=${HEALTH_RETRIES:-36}
HEALTH_INTERVAL=${HEALTH_INTERVAL:-5}
HEALTH_URL=http://localhost:3000/api/health
# The adapter's service: capi-mcp, or finances-mcp in a compose file before
# #464. Set by mcp_enabled from the compose file in place.
MCP_SERVICE=capi-mcp
MCP_SERVICES=(capi-mcp finances-mcp)
# Served by the adapter from its configuration: no API call, one log line.
MCP_HEALTH_URL=http://localhost:4100/.well-known/oauth-protected-resource

# web's aliases on the shared `proxy` network, Caddy's production upstream
# (finances-web before #464).
PRODUCTION_WEB_ALIASES=(capi-web finances-web)
ENV_FILE=.env
LOCK_FILE=.deploy.lock
LOG_FILE=deploy.log

log() { printf '[deploy %s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

usage() {
  echo "usage: $0 vX.Y.Z [compose-file]" >&2
  echo "       $0 --staging sha-<commit> [compose-file]" >&2
  exit 2
}

version=${1:-}
new_compose=${2:-}
[[ $version =~ $VERSION_PATTERN ]] || usage
# Sources of the compose files to install, in the order of COMPOSE_FILES: the
# given file, then (staging) the override next to it.
sources=()
if [[ -n $new_compose ]]; then
  [[ -f $new_compose ]] || { echo "compose file not found: $new_compose" >&2; exit 2; }
  new_compose=$(realpath "$new_compose")
  sources=("$new_compose")
  if [[ $mode == staging ]]; then
    override=$(dirname "$new_compose")/${COMPOSE_FILES[1]}
    [[ -f $override ]] || { echo "compose file not found: $override" >&2; exit 2; }
    sources+=("$override")
  fi
fi

cd "$DEPLOY_DIR"
[[ -f $ENV_FILE ]] || { echo "$DEPLOY_DIR/$ENV_FILE is missing" >&2; exit 1; }

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "another deploy is already running" >&2; exit 1; }

trap '' HUP
# -p: keep writing to the log file if the SSH side of the pipe goes away.
exec > >(tee -p -a "$LOG_FILE") 2>&1
tee_pid=$!
trap 'exec >&- 2>&-; wait "$tee_pid" 2>/dev/null || true' EXIT

file_args=()
for file in "${COMPOSE_FILES[@]}"; do file_args+=(-f "$file"); done
compose_args=("${file_args[@]}")
compose() { docker compose "${compose_args[@]}" "$@"; }

# The project the installed compose files name (`name:`), empty when they are
# missing or invalid.
compose_project() {
  local name
  name=$(docker compose "${file_args[@]}" config 2>/dev/null | sed -n 's/^name: *//p' | head -n 1) || true
  printf '%s\n' "${name//[\"\']/}"
}

# use_project NAME — run every later compose command in that project.
use_project() {
  PROJECT=$1
  compose_args=()
  if [[ -n $PROJECT ]]; then compose_args+=(-p "$PROJECT"); fi
  compose_args+=("${file_args[@]}")
}

# read_env NAME — the last NAME= line of .env, unquoted.
read_env() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d "\"' \r"
}

# The running version. FINANCES_VERSION first: this script writes both names
# with the same value, and a deploy.sh from before #464 (a rollback by tag)
# only rewrites FINANCES_VERSION, leaving CAPI_VERSION behind.
read_version() {
  local version
  version=$(read_env FINANCES_VERSION)
  [[ -n $version ]] || version=$(read_env CAPI_VERSION)
  printf '%s\n' "$version"
}

# Whether the current compose file and .env run the MCP adapter; sets
# MCP_SERVICE to its name in that compose file.
mcp_enabled() {
  local services name
  services=$(compose config --services) || return 1
  for name in "${MCP_SERVICES[@]}"; do
    if grep -qx "$name" <<<"$services"; then
      MCP_SERVICE=$name
      return 0
    fi
  done
  return 1
}

# Rewrite .env with CAPI_VERSION=$1 and FINANCES_VERSION=$1 (read by compose
# files before #464), keeping every other line. The file is replaced
# atomically and stays private (umask 077).
set_version() {
  local tmp
  tmp=$(umask 077 && mktemp "$ENV_FILE.XXXXXX")
  grep -v -e '^CAPI_VERSION=' -e '^FINANCES_VERSION=' "$ENV_FILE" >"$tmp" || true
  printf 'CAPI_VERSION=%s\nFINANCES_VERSION=%s\n' "$1" "$1" >>"$tmp"
  mv -f "$tmp" "$ENV_FILE"
}

healthy() {
  timeout 15 docker compose "${compose_args[@]}" exec -T web node -e \
    "fetch('$HEALTH_URL').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1 || return 1
  if [[ $with_mcp == true ]]; then
    timeout 15 docker compose "${compose_args[@]}" exec -T "$MCP_SERVICE" node -e \
      "fetch('$MCP_HEALTH_URL').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1 || return 1
  fi
}

wait_healthy() {
  local i
  for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    if healthy; then
      log "healthy after $i check(s)"
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
  done
  log "still unhealthy after $HEALTH_RETRIES checks"
  return 1
}

previous=$(read_version)
previous_project=$(compose_project)
use_project "$previous_project"
compose_backups=()
changed=false
started=false
with_mcp=false
# The project changes with this release (and the one it replaces was stopped).
moving=false
moved=false

# Put back the previous compose file and version. When containers were
# (re)started, bring the previous version back up too. Always exits 1.
rollback() {
  log "FAILED: $1"
  if [[ $changed == true ]]; then
    local backup
    if [[ $moved == true ]]; then
      # Migrations or `up` started the new project's database: stop it (with
      # the new compose files, before they are put back) before the previous
      # project starts again on the same volume. Never -v.
      log "stopping $PROJECT before $previous_project starts again"
      if ! compose down --remove-orphans; then
        log "could not stop $PROJECT: manual action needed (never two databases on one volume)"
        log "deploy of $version failed (running: none)"
        exit 1
      fi
    fi
    for backup in "${compose_backups[@]}"; do
      mv -f "$backup" "${backup%.prev}"
    done
    if [[ -n $previous_project ]]; then use_project "$previous_project"; fi
    if [[ -n $previous ]]; then
      set_version "$previous"
      log "restored CAPI_VERSION=$previous"
    fi
    # The previous compose file may not have the adapter.
    with_mcp=false
    if mcp_enabled 2>/dev/null; then with_mcp=true; fi
  fi
  if [[ $started == true ]]; then
    if [[ -z $previous ]]; then
      log "no previous version to roll back to; leaving the stack as is"
    elif compose up -d --remove-orphans && wait_healthy; then
      log "rolled back to $previous"
    else
      log "rollback to $previous is unhealthy too: manual action needed"
    fi
  fi
  log "deploy of $version failed (running: ${previous:-none})"
  exit 1
}

log "deploying $version${previous_project:+ to $previous_project} (current: ${previous:-none})"

changed=true
for i in "${!sources[@]}"; do
  target=${COMPOSE_FILES[$i]}
  if [[ -f $target ]]; then
    cp -p "$target" "$target.prev"
    compose_backups+=("$target.prev")
  fi
  cp "${sources[$i]}" "$target.tmp"
  mv -f "$target.tmp" "$target"
done
set_version "$version"

docker compose "${file_args[@]}" config --quiet || rollback "invalid compose configuration"
project=$(compose_project)
[[ -n $project ]] || rollback "the compose files name no project"
if [[ $mode == staging && $project != *-staging ]]; then
  rollback "staging runs only in a project named *-staging, not $project"
elif [[ $mode == production && $project == *-staging ]]; then
  rollback "production never runs in a staging project ($project)"
fi
if [[ -n $previous_project && $project != "$previous_project" ]]; then
  moving=true
  # The new project must open the database the old one used, never a new
  # empty volume: DB_VOLUME (.env) names it and it must already exist.
  db_volume=$(read_env DB_VOLUME)
  [[ -n $db_volume ]] || rollback "the project changes ($previous_project → $project): set DB_VOLUME in .env to the volume in use"
  docker volume inspect "$db_volume" >/dev/null 2>&1 ||
    rollback "the project changes ($previous_project → $project) but the volume $db_volume does not exist"
  log "moving from project $previous_project to $project (volume $db_volume kept)"
fi
use_project "$project"

if [[ $mode == staging ]]; then
  # The override replaces web's alias (`!override`): a Compose that merged the
  # two lists instead would put staging behind Caddy's production upstream.
  config=$(compose config) || rollback "invalid compose configuration"
  for alias in "${PRODUCTION_WEB_ALIASES[@]}"; do
    if grep -Eq "^[[:space:]]*- ${alias}\$" <<<"$config"; then
      rollback "the staging configuration keeps web's production alias ($alias)"
    fi
  done
  if mcp_enabled; then
    rollback "the remote MCP adapter never runs on staging: empty COMPOSE_PROFILES in .env"
  fi
fi

images=(api web)
if mcp_enabled; then
  # The adapter refuses to start with the switch off: say so now rather than
  # after a restart loop and a failed health check.
  [[ $(read_env REMOTE_MCP_ENABLED) == true ]] ||
    rollback "the remote-mcp profile is on (COMPOSE_PROFILES) but REMOTE_MCP_ENABLED is not true"
  with_mcp=true
  images+=("$MCP_SERVICE")
  log "remote MCP adapter on"
fi

log "pulling images"
compose pull "${images[@]}" || rollback "docker compose pull"

if [[ $moving == true ]]; then
  # Before anything starts the new project's database: never two Postgres on
  # one volume. `down` keeps the volumes (never -v).
  log "stopping $previous_project"
  started=true
  docker compose -p "$previous_project" down || rollback "docker compose -p $previous_project down"
  moved=true
fi

log "running migrations"
compose run --rm -T api node dist/database/migrate.js || rollback "migrations"

log "seeding reference data"
compose run --rm -T api node dist/database/seed.js || rollback "seed"

if [[ $mode == staging ]]; then
  # One transaction: a failure leaves the previous data in place.
  log "resetting the demo data"
  compose run --rm -T api node dist/database/seed-demo.js --reset || rollback "demo data"
fi

log "starting $version"
started=true
compose up -d --remove-orphans || rollback "docker compose up"

if [[ $with_mcp == true ]]; then
  log "waiting for $HEALTH_URL and $MCP_HEALTH_URL"
else
  log "waiting for $HEALTH_URL"
fi
wait_healthy || rollback "health check"

for backup in "${compose_backups[@]}"; do
  rm -f "$backup"
done
log "deployed $version${PROJECT:+ to $PROJECT} (previous: ${previous:-none})"
