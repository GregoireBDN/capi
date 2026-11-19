#!/usr/bin/env bash
# Deploy a Finances release on the server (see docs/runbooks/deploy.md).
#
#   deploy.sh vX.Y.Z [compose-file]
#
# Runs as the `deploy` user in FINANCES_DIR (default /srv/finances), next to
# docker-compose.prod.yml and .env. Steps: install the release's compose file
# (when given), set FINANCES_VERSION in .env, pull the images, run the
# migrations then the seed from the new API image, `up -d`, and poll the health
# endpoint through `web`. If any step fails after .env was changed, the previous
# version (and compose file) is restored and brought back up, and the script
# exits non-zero. Concurrent runs are refused (flock).
#
# The remote MCP adapter (`finances-mcp`, #328) is part of the release only
# when the compose file has it and its profile is on (COMPOSE_PROFILES in
# .env): it is then pulled and health-checked too, and a rollback to a version
# without it removes its container (`--remove-orphans`).
#
# The output is also appended to FINANCES_DIR/deploy.log, and SIGHUP is ignored,
# so a dropped SSH connection (cancelled CI job) doesn't stop a deploy halfway.
set -euo pipefail

FINANCES_DIR=${FINANCES_DIR:-/srv/finances}
HEALTH_RETRIES=${HEALTH_RETRIES:-36}
HEALTH_INTERVAL=${HEALTH_INTERVAL:-5}
HEALTH_URL=http://localhost:3000/api/health
MCP_SERVICE=finances-mcp
# Served by the adapter from its configuration: no API call, one log line.
MCP_HEALTH_URL=http://localhost:4100/.well-known/oauth-protected-resource

COMPOSE_FILE=docker-compose.prod.yml
ENV_FILE=.env
LOCK_FILE=.deploy.lock
LOG_FILE=deploy.log

log() { printf '[deploy %s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

usage() {
  echo "usage: $0 vX.Y.Z [compose-file]" >&2
  exit 2
}

version=${1:-}
new_compose=${2:-}
[[ $version =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || usage
if [[ -n $new_compose ]]; then
  [[ -f $new_compose ]] || { echo "compose file not found: $new_compose" >&2; exit 2; }
  new_compose=$(realpath "$new_compose")
fi

cd "$FINANCES_DIR"
[[ -f $ENV_FILE ]] || { echo "$FINANCES_DIR/$ENV_FILE is missing" >&2; exit 1; }

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "another deploy is already running" >&2; exit 1; }

trap '' HUP
# -p: keep writing to the log file if the SSH side of the pipe goes away.
exec > >(tee -p -a "$LOG_FILE") 2>&1
tee_pid=$!
trap 'exec >&- 2>&-; wait "$tee_pid" 2>/dev/null || true' EXIT

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# read_env NAME — the last NAME= line of .env, unquoted.
read_env() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d "\"' \r"
}

read_version() { read_env FINANCES_VERSION; }

# Whether the current compose file and .env run the MCP adapter.
mcp_enabled() {
  local services
  services=$(compose config --services) || return 1
  grep -qx "$MCP_SERVICE" <<<"$services"
}

# Rewrite .env with FINANCES_VERSION=$1, keeping every other line. The file is
# replaced atomically and stays private (umask 077).
set_version() {
  local tmp
  tmp=$(umask 077 && mktemp "$ENV_FILE.XXXXXX")
  grep -v '^FINANCES_VERSION=' "$ENV_FILE" >"$tmp" || true
  printf 'FINANCES_VERSION=%s\n' "$1" >>"$tmp"
  mv -f "$tmp" "$ENV_FILE"
}

healthy() {
  timeout 15 docker compose -f "$COMPOSE_FILE" exec -T web node -e \
    "fetch('$HEALTH_URL').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1 || return 1
  if [[ $with_mcp == true ]]; then
    timeout 15 docker compose -f "$COMPOSE_FILE" exec -T "$MCP_SERVICE" node -e \
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
compose_backup=
changed=false
started=false
with_mcp=false

# Put back the previous compose file and version. When containers were
# (re)started, bring the previous version back up too. Always exits 1.
rollback() {
  log "FAILED: $1"
  if [[ $changed == true ]]; then
    if [[ -n $compose_backup ]]; then
      mv -f "$compose_backup" "$COMPOSE_FILE"
    fi
    if [[ -n $previous ]]; then
      set_version "$previous"
      log "restored FINANCES_VERSION=$previous"
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

log "deploying $version (current: ${previous:-none})"

changed=true
if [[ -n $new_compose ]]; then
  if [[ -f $COMPOSE_FILE ]]; then
    compose_backup=$COMPOSE_FILE.prev
    cp -p "$COMPOSE_FILE" "$compose_backup"
  fi
  cp "$new_compose" "$COMPOSE_FILE.tmp"
  mv -f "$COMPOSE_FILE.tmp" "$COMPOSE_FILE"
fi
set_version "$version"

compose config --quiet || rollback "invalid compose configuration"

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

log "running migrations"
compose run --rm -T api node dist/database/migrate.js || rollback "migrations"

log "seeding reference data"
compose run --rm -T api node dist/database/seed.js || rollback "seed"

log "starting $version"
started=true
compose up -d --remove-orphans || rollback "docker compose up"

if [[ $with_mcp == true ]]; then
  log "waiting for $HEALTH_URL and $MCP_HEALTH_URL"
else
  log "waiting for $HEALTH_URL"
fi
wait_healthy || rollback "health check"

if [[ -n $compose_backup ]]; then
  rm -f "$compose_backup"
fi
log "deployed $version (previous: ${previous:-none})"
