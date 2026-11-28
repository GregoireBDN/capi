#!/usr/bin/env bash
# Tests deploy.sh against a fake `docker` on PATH: no Docker or server needed.
# Needs Linux userland (flock, GNU tee/timeout), e.g. CI or
#   docker run --rm -v "$PWD":/w -w /w ubuntu:24.04 bash deploy/test-deploy.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
srv=$work/srv
state=$work/state
mkdir -p "$work/bin"

# Fake docker: records each `docker compose` call with the version the
# installed compose file reads from .env at that moment (CAPI_VERSION, or
# FINANCES_VERSION for a compose file marked `legacy`, from before #464), and
# fails the steps listed (per version) in FAKE_*. The MCP adapter (#328) is in
# the stack when the installed compose file mentions `capi-mcp` (or
# `finances-mcp`) and .env sets COMPOSE_PROFILES=remote-mcp, like the real
# profile; `config --services` and `config` are not recorded (`config`
# prints `name:` then the installed compose files). The project is the last
# `name:` line of the installed files (default `finances`, or
# `finances-staging` next to the staging override), or the one given with
# `-p`, which is written to $FAKE_STATE/project.
#
# Databases (#464's step B): $FAKE_STATE/db lists the projects whose Postgres
# runs on the shared volume. `run` and `up` start the project's, `down` stops
# it (and the stack, when it is the running one); starting one while another
# project's runs is recorded as CONFLICT and fails. `docker volume inspect`
# succeeds for the volumes listed in $FAKE_STATE/volumes.
cat >"$work/bin/docker" <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail
if [[ $1 == volume && $2 == inspect ]]; then
  grep -qx -- "$3" "$FAKE_STATE/volumes" 2>/dev/null
  exit
fi
[[ $1 == compose ]] || { echo "fake docker: unexpected $*" >&2; exit 99; }
shift
args=()
project=
while (($#)); do
  case $1 in
    -f) shift 2 ;;
    -p) project=$2; shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
files() { cat docker-compose.prod.yml 2>/dev/null || true; [[ ! -f docker-compose.staging.yml ]] || cat docker-compose.staging.yml; }
if [[ -z $project ]]; then
  project=$(files | sed -n 's/^name: //p' | tail -n 1)
  if [[ -z $project ]]; then
    if [[ -f docker-compose.staging.yml ]]; then project=finances-staging; else project=finances; fi
  fi
elif [[ ${args[0]:-} != down ]]; then
  echo "$project" >"$FAKE_STATE/project"
fi
# start_db — this project's Postgres starts; refused while another one runs.
start_db() {
  local other
  other=$(grep -vx -- "$project" "$FAKE_STATE/db" 2>/dev/null || true)
  if [[ -n $other ]]; then
    echo "CONFLICT $project+$other" >>"$FAKE_STATE/calls"
    exit 98
  fi
  echo "$project" >"$FAKE_STATE/db"
}
var=CAPI_VERSION
grep -q legacy docker-compose.prod.yml && var=FINANCES_VERSION
v=$(sed -n "s/^$var=//p" .env | tail -n 1)
rc=0
listed() { [[ " ${!1:-} " == *" $v "* ]] && rc=1; return 0; }
services() {
  echo db api web
  if grep -qx 'COMPOSE_PROFILES=remote-mcp' .env; then
    grep -o -m 1 -E '(capi|finances)-mcp' docker-compose.prod.yml || true
  fi
}
shopt -s extglob
[[ ${args[0]:-} != run ]] || echo "${args[3]}" >>"$FAKE_STATE/run_services"
case "${args[*]}" in
  "config --services") services | tr ' ' '\n'; exit 0 ;;
  config)
    [[ -f docker-compose.prod.yml ]] || { echo "no configuration file provided" >&2; exit 1; }
    echo "name: $project"; files; exit 0 ;;
  "config --quiet") step=config ;;
  down | "down --remove-orphans")
    step="down $project"
    if [[ $(cat "$FAKE_STATE/running_project" 2>/dev/null) == "$project" ]]; then
      rm -f "$FAKE_STATE/running" "$FAKE_STATE/mcp" "$FAKE_STATE/running_project"
    fi
    if [[ -f $FAKE_STATE/db ]]; then
      grep -vx -- "$project" "$FAKE_STATE/db" >"$FAKE_STATE/db.tmp" || true
      mv "$FAKE_STATE/db.tmp" "$FAKE_STATE/db"
    fi ;;
  "pull api web") step=pull; listed FAKE_PULL_FAIL ;;
  "pull api web capi-mcp" | "pull api web finances-mcp") step=pull+mcp; listed FAKE_PULL_FAIL ;;
  "run --rm -T "@(api|migrate)" node dist/database/migrate.js") start_db; step=migrate; listed FAKE_MIGRATE_FAIL ;;
  "run --rm -T "@(api|migrate)" node dist/database/seed.js") start_db; step=seed ;;
  "run --rm -T "@(api|migrate)" node dist/database/seed-demo.js --if-empty") start_db; step=demo; listed FAKE_DEMO_FAIL ;;
  "run --rm -T "@(api|migrate)" node dist/database/seed-demo.js --reset") start_db; step=demo-reset; listed FAKE_DEMO_FAIL ;;
  "up -d --remove-orphans")
    start_db
    step=up
    echo "$v" >"$FAKE_STATE/running"
    echo "$project" >"$FAKE_STATE/running_project"
    mcp=$(services | grep -E -- '-mcp$' || true)
    if [[ -n $mcp ]]; then echo "$v $mcp" >"$FAKE_STATE/mcp"; else rm -f "$FAKE_STATE/mcp"; fi ;;
  "exec -T web node -e "*)
    step=health
    running=$(cat "$FAKE_STATE/running" 2>/dev/null || echo none)
    echo "health @$running" >>"$FAKE_STATE/calls"
    [[ " ${FAKE_UNHEALTHY:-} " == *" $running "* ]] && exit 1
    exit 0 ;;
  "exec -T capi-mcp node -e "* | "exec -T finances-mcp node -e "*)
    # Fails unless the adapter runs, under the service name asked for.
    read -r mcp service < <(cat "$FAKE_STATE/mcp" 2>/dev/null || echo none)
    echo "health-mcp @$mcp" >>"$FAKE_STATE/calls"
    [[ $mcp == none || $service != "${args[2]}" || " ${FAKE_MCP_UNHEALTHY:-} " == *" $mcp "* ]] && exit 1
    exit 0 ;;
  *) echo "fake docker: unexpected compose ${args[*]}" >&2; exit 99 ;;
esac
echo "$step @$v" >>"$FAKE_STATE/calls"
exit "$rc"
SHIM
chmod +x "$work/bin/docker"

export PATH="$work/bin:$PATH" CAPI_DIR=$srv FAKE_STATE=$state
export HEALTH_RETRIES=3 HEALTH_INTERVAL=0

failures=0
current=

# setup <running version or ""> [.env lines...] — fresh /srv/capi with
# .env and compose file. OLD_MCP / NEW_MCP=1: that compose file has the MCP
# adapter (and the old one runs it when its profile is on). OLD_LEGACY=1: the
# running compose file is from before #464 (FINANCES_VERSION, finances-mcp),
# and so is .env. ENV_VERSION_LINES: replaces the version lines of .env.
# OLD_NAME / NEW_NAME: a `name:` line in that compose file (#464's step B);
# VOLUMES: the volumes that exist.
setup() {
  local running=$1
  shift
  rm -rf "$srv" "$state"
  mkdir -p "$srv" "$state"
  : >"$state/calls"
  {
    echo "POSTGRES_USER=app"
    if [[ -n ${ENV_VERSION_LINES:-} ]]; then
      printf '%s\n' "$ENV_VERSION_LINES"
    elif [[ -n $running && -n ${OLD_LEGACY:-} ]]; then
      echo "FINANCES_VERSION=$running"
    elif [[ -n $running ]]; then
      echo "CAPI_VERSION=$running"
      echo "FINANCES_VERSION=$running"
    fi
    echo "JWT_SECRET=not-a-secret"
    for line in "$@"; do echo "$line"; done
  } >"$srv/.env"
  chmod 600 "$srv/.env"
  local old_mcp=capi-mcp
  [[ -z ${OLD_LEGACY:-} ]] || old_mcp="finances-mcp"
  echo "# compose old${OLD_LEGACY:+ legacy}${OLD_MCP:+ $old_mcp}" >"$srv/docker-compose.prod.yml"
  [[ -z ${OLD_NAME:-} ]] || echo "name: $OLD_NAME" >>"$srv/docker-compose.prod.yml"
  echo "# compose new${NEW_MCP:+ capi-mcp}" >"$work/new-compose.yml"
  if [[ -n ${NEW_MIGRATE:-} ]]; then
    printf '  migrate:\n    # APP_DB_PASSWORD\n' >>"$work/new-compose.yml"
  fi
  [[ -z ${NEW_NAME:-} ]] || echo "name: $NEW_NAME" >>"$work/new-compose.yml"
  printf '%s\n' "${VOLUMES:-}" >"$state/volumes"
  if [[ -n $running ]]; then
    echo "$running" >"$state/running"
    echo "${OLD_NAME:-finances}" >"$state/running_project"
    echo "${OLD_NAME:-finances}" >"$state/db"
    if [[ -n ${OLD_MCP:-} ]] && grep -qx 'COMPOSE_PROFILES=remote-mcp' "$srv/.env"; then
      echo "$running $old_mcp" >"$state/mcp"
    fi
  fi
  return 0
}

# deploy <args...> — runs deploy.sh, stores its exit code in $rc.
deploy() {
  rc=0
  bash "$here/deploy.sh" "$@" >"$work/out" 2>&1 || rc=$?
}

fail() {
  echo "  FAIL: $*"
  echo "  --- output ---"
  sed 's/^/  | /' "$work/out"
  echo "  --- calls ---"
  sed 's/^/  | /' "$state/calls"
  failures=$((failures + 1))
}

check() { # check <description> <command...>
  local what=$1
  shift
  "$@" || fail "$current: $what"
}

# The version in .env: CAPI_VERSION and FINANCES_VERSION must agree.
env_version() {
  local capi finances
  capi=$(sed -n 's/^CAPI_VERSION=//p' "$srv/.env")
  finances=$(sed -n 's/^FINANCES_VERSION=//p' "$srv/.env")
  if [[ $capi == "$finances" ]]; then echo "$capi"; else echo "CAPI_VERSION=$capi FINANCES_VERSION=$finances"; fi
}
running() { cat "$state/running" 2>/dev/null || echo none; }
running_mcp() { read -r v _ < <(cat "$state/mcp" 2>/dev/null || echo none); echo "$v"; }
running_mcp_service() { read -r _ service < <(cat "$state/mcp" 2>/dev/null || echo none); echo "${service:-none}"; }
project() { cat "$state/project" 2>/dev/null || echo none; }
calls() { tr '\n' ' ' <"$state/calls" | sed 's/ $//'; }
run_services() { sort -u "$state/run_services" 2>/dev/null | tr '\n' ' ' | sed 's/ $//'; }
eq() { [[ $1 == "$2" ]] || { echo "  expected [$2], got [$1]"; return 1; }; }
has() { grep -qF -- "$2" "$1"; }

test_case() {
  current=$1
  echo "- $1"
}

test_case "deploys a new version and installs its compose file"
setup v1.0.0
deploy v1.1.0 "$work/new-compose.yml"
check "exit 0" eq "$rc" 0
check "steps" eq "$(calls)" "config @v1.1.0 pull @v1.1.0 migrate @v1.1.0 seed @v1.1.0 up @v1.1.0 health @v1.1.0"
check ".env version" eq "$(env_version)" v1.1.0
check "running" eq "$(running)" v1.1.0
check "compose installed" eq "$(cat "$srv/docker-compose.prod.yml")" "# compose new"
check "no compose backup left" test ! -e "$srv/docker-compose.prod.yml.prev"
check "other .env lines kept" eq "$(grep -c -e '^POSTGRES_USER=app$' -e '^JWT_SECRET=not-a-secret$' "$srv/.env")" 2
check ".env stays private" eq "$(stat -c %a "$srv/.env")" 600
check "deploy.log written" has "$srv/deploy.log" "deployed v1.1.0 to finances (previous: v1.0.0)"
check "project from the compose file" eq "$(project)" finances

test_case "rolls back when the health check fails"
setup v1.0.0
FAKE_UNHEALTHY=v1.1.0 deploy v1.1.0 "$work/new-compose.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @v1.1.0 pull @v1.1.0 migrate @v1.1.0 seed @v1.1.0 up @v1.1.0 health @v1.1.0 health @v1.1.0 health @v1.1.0 up @v1.0.0 health @v1.0.0"
check ".env version restored" eq "$(env_version)" v1.0.0
check "previous version running" eq "$(running)" v1.0.0
check "compose restored" eq "$(cat "$srv/docker-compose.prod.yml")" "# compose old"
check "reports rollback" has "$work/out" "rolled back to v1.0.0"

test_case "reports when the rollback is unhealthy too"
setup v1.0.0
FAKE_UNHEALTHY="v1.0.0 v1.1.0" deploy v1.1.0
check "exit 1" eq "$rc" 1
check ".env version restored" eq "$(env_version)" v1.0.0
check "asks for manual action" has "$work/out" "manual action needed"

test_case "keeps the running version when migrations fail"
setup v1.0.0
FAKE_MIGRATE_FAIL=v1.1.0 deploy v1.1.0 "$work/new-compose.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @v1.1.0 pull @v1.1.0 migrate @v1.1.0"
check ".env version restored" eq "$(env_version)" v1.0.0
check "running untouched" eq "$(running)" v1.0.0
check "compose restored" eq "$(cat "$srv/docker-compose.prod.yml")" "# compose old"

test_case "keeps the running version when the images can't be pulled"
setup v1.0.0
FAKE_PULL_FAIL=v1.1.0 deploy v1.1.0
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @v1.1.0 pull @v1.1.0"
check ".env version restored" eq "$(env_version)" v1.0.0
check "running untouched" eq "$(running)" v1.0.0

test_case "first deploy adds CAPI_VERSION and FINANCES_VERSION to .env"
setup ""
deploy v1.0.0
check "exit 0" eq "$rc" 0
check ".env version" eq "$(env_version)" v1.0.0
check "running" eq "$(running)" v1.0.0

test_case "redeploys a previous version (rollback by tag)"
setup v1.1.0
deploy v1.0.0
check "exit 0" eq "$rc" 0
check ".env version" eq "$(env_version)" v1.0.0
check "running" eq "$(running)" v1.0.0

test_case "first deploy after #464: reads FINANCES_VERSION, writes both names"
OLD_LEGACY=1 setup v1.0.0
deploy v1.1.0 "$work/new-compose.yml"
check "exit 0" eq "$rc" 0
check "steps" eq "$(calls)" "config @v1.1.0 pull @v1.1.0 migrate @v1.1.0 seed @v1.1.0 up @v1.1.0 health @v1.1.0"
check ".env version" eq "$(env_version)" v1.1.0
check "one line each" eq "$(grep -c -e '^CAPI_VERSION=' -e '^FINANCES_VERSION=' "$srv/.env")" 2
check "previous version read" has "$srv/deploy.log" "deployed v1.1.0 to finances (previous: v1.0.0)"

test_case "rolls back to a compose file from before #464"
OLD_LEGACY=1 setup v1.0.0
FAKE_UNHEALTHY=v1.1.0 deploy v1.1.0 "$work/new-compose.yml"
check "exit 1" eq "$rc" 1
check "previous version running" eq "$(running)" v1.0.0
check ".env version restored" eq "$(env_version)" v1.0.0
check "compose restored" eq "$(cat "$srv/docker-compose.prod.yml")" "# compose old legacy"
check "reports rollback" has "$work/out" "rolled back to v1.0.0"

test_case "after a rollback by an older deploy.sh, FINANCES_VERSION is the running version"
ENV_VERSION_LINES=$'CAPI_VERSION=v1.1.0\nFINANCES_VERSION=v1.0.0' setup v1.0.0
deploy v1.2.0
check "exit 0" eq "$rc" 0
check ".env version" eq "$(env_version)" v1.2.0
check "previous version read" has "$srv/deploy.log" "deployed v1.2.0 to finances (previous: v1.0.0)"

# --- Project rename (#464's step B) -----------------------------------------

db_running() { cat "$state/db" 2>/dev/null | tr '\n' ' ' | sed 's/ $//'; }
running_project() { cat "$state/running_project" 2>/dev/null || echo none; }
MOVE_ENV=(DB_VOLUME=finances_db_data)

test_case "moves from project finances to capi: stops finances before the migrations"
NEW_NAME=capi VOLUMES=finances_db_data setup v1.0.0 "${MOVE_ENV[@]}"
deploy v1.1.0 "$work/new-compose.yml"
check "exit 0" eq "$rc" 0
check "steps" eq "$(calls)" "config @v1.1.0 pull @v1.1.0 down finances @v1.1.0 migrate @v1.1.0 seed @v1.1.0 up @v1.1.0 health @v1.1.0"
check "runs as capi" eq "$(running_project)" capi
check "one database" eq "$(db_running)" capi
check "running" eq "$(running)" v1.1.0
check "says so" has "$work/out" "moving from project finances to capi (volume finances_db_data kept)"
check "deploy.log written" has "$srv/deploy.log" "deployed v1.1.0 to capi (previous: v1.0.0)"

test_case "refuses to move without DB_VOLUME, before stopping anything"
NEW_NAME=capi VOLUMES=finances_db_data setup v1.0.0
deploy v1.1.0 "$work/new-compose.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @v1.1.0"
check "explains why" has "$work/out" "set DB_VOLUME in .env"
check "finances untouched" eq "$(running_project) $(running)" "finances v1.0.0"
check "compose restored" eq "$(cat "$srv/docker-compose.prod.yml")" "# compose old"
check ".env version restored" eq "$(env_version)" v1.0.0

test_case "refuses to move onto a volume that does not exist (an empty database)"
NEW_NAME=capi setup v1.0.0 "${MOVE_ENV[@]}"
deploy v1.1.0 "$work/new-compose.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @v1.1.0"
check "explains why" has "$work/out" "the volume finances_db_data does not exist"
check "finances untouched" eq "$(running_project) $(running)" "finances v1.0.0"

test_case "a failed move stops capi before finances starts again (health check)"
NEW_NAME=capi VOLUMES=finances_db_data setup v1.0.0 "${MOVE_ENV[@]}"
FAKE_UNHEALTHY=v1.1.0 deploy v1.1.0 "$work/new-compose.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @v1.1.0 pull @v1.1.0 down finances @v1.1.0 migrate @v1.1.0 seed @v1.1.0 up @v1.1.0 health @v1.1.0 health @v1.1.0 health @v1.1.0 down capi @v1.1.0 up @v1.0.0 health @v1.0.0"
check "finances back" eq "$(running_project) $(running)" "finances v1.0.0"
check "one database" eq "$(db_running)" finances
check "compose restored" eq "$(cat "$srv/docker-compose.prod.yml")" "# compose old"
check "reports rollback" has "$work/out" "rolled back to v1.0.0"

test_case "a failed move stops capi before finances starts again (migrations)"
NEW_NAME=capi VOLUMES=finances_db_data setup v1.0.0 "${MOVE_ENV[@]}"
FAKE_MIGRATE_FAIL=v1.1.0 deploy v1.1.0 "$work/new-compose.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @v1.1.0 pull @v1.1.0 down finances @v1.1.0 migrate @v1.1.0 down capi @v1.1.0 up @v1.0.0 health @v1.0.0"
check "finances back" eq "$(running_project) $(running)" "finances v1.0.0"
check "one database" eq "$(db_running)" finances

test_case "rolls back across the rename: stops capi before finances"
OLD_NAME=capi VOLUMES=finances_db_data setup v1.1.0 "${MOVE_ENV[@]}"
deploy v1.0.0 "$work/new-compose.yml"
check "exit 0" eq "$rc" 0
check "steps" eq "$(calls)" "config @v1.0.0 pull @v1.0.0 down capi @v1.0.0 migrate @v1.0.0 seed @v1.0.0 up @v1.0.0 health @v1.0.0"
check "runs as finances" eq "$(running_project)" finances
check "one database" eq "$(db_running)" finances

test_case "redeploys in the same project without stopping it"
OLD_NAME=capi NEW_NAME=capi VOLUMES=finances_db_data setup v1.1.0 "${MOVE_ENV[@]}"
deploy v1.2.0 "$work/new-compose.yml"
check "exit 0" eq "$rc" 0
check "steps" eq "$(calls)" "config @v1.2.0 pull @v1.2.0 migrate @v1.2.0 seed @v1.2.0 up @v1.2.0 health @v1.2.0"
check "runs as capi" eq "$(running_project)" capi

test_case "production refuses a staging project"
NEW_NAME=capi-staging VOLUMES=finances_db_data setup v1.0.0 "${MOVE_ENV[@]}"
deploy v1.1.0 "$work/new-compose.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @v1.1.0"
check "explains why" has "$work/out" "production never runs in a staging project (capi-staging)"
check "finances untouched" eq "$(running_project) $(running)" "finances v1.0.0"

MCP_ON=(COMPOSE_PROFILES=remote-mcp REMOTE_MCP_ENABLED=true)

test_case "leaves the MCP adapter out when its profile is off"
NEW_MCP=1 setup v1.0.0
deploy v1.1.0 "$work/new-compose.yml"
check "exit 0" eq "$rc" 0
check "steps" eq "$(calls)" "config @v1.1.0 pull @v1.1.0 migrate @v1.1.0 seed @v1.1.0 up @v1.1.0 health @v1.1.0"
check "adapter not running" eq "$(running_mcp)" none

test_case "pulls, starts and checks the MCP adapter when its profile is on"
NEW_MCP=1 setup v1.0.0 "${MCP_ON[@]}"
deploy v1.1.0 "$work/new-compose.yml"
check "exit 0" eq "$rc" 0
check "steps" eq "$(calls)" "config @v1.1.0 pull+mcp @v1.1.0 migrate @v1.1.0 seed @v1.1.0 up @v1.1.0 health @v1.1.0 health-mcp @v1.1.0"
check "adapter running" eq "$(running_mcp)" v1.1.0
check "as capi-mcp" eq "$(running_mcp_service)" capi-mcp
check "says so" has "$work/out" "remote MCP adapter on"

test_case "rolls back the MCP adapter with the rest"
OLD_MCP=1 NEW_MCP=1 setup v1.0.0 "${MCP_ON[@]}"
FAKE_MCP_UNHEALTHY=v1.1.0 deploy v1.1.0 "$work/new-compose.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @v1.1.0 pull+mcp @v1.1.0 migrate @v1.1.0 seed @v1.1.0 up @v1.1.0 health @v1.1.0 health-mcp @v1.1.0 health @v1.1.0 health-mcp @v1.1.0 health @v1.1.0 health-mcp @v1.1.0 up @v1.0.0 health @v1.0.0 health-mcp @v1.0.0"
check "previous version running" eq "$(running)" v1.0.0
check "previous adapter running" eq "$(running_mcp)" v1.0.0
check "reports rollback" has "$work/out" "rolled back to v1.0.0"

test_case "rolls back the MCP adapter to its name before #464"
OLD_LEGACY=1 OLD_MCP=1 NEW_MCP=1 setup v1.0.0 "${MCP_ON[@]}"
FAKE_MCP_UNHEALTHY=v1.1.0 deploy v1.1.0 "$work/new-compose.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @v1.1.0 pull+mcp @v1.1.0 migrate @v1.1.0 seed @v1.1.0 up @v1.1.0 health @v1.1.0 health-mcp @v1.1.0 health @v1.1.0 health-mcp @v1.1.0 health @v1.1.0 health-mcp @v1.1.0 up @v1.0.0 health @v1.0.0 health-mcp @v1.0.0"
check "previous adapter running" eq "$(running_mcp)" v1.0.0
check "as finances-mcp" eq "$(running_mcp_service)" finances-mcp
check "reports rollback" has "$work/out" "rolled back to v1.0.0"

test_case "a rollback to a version without the adapter removes it"
NEW_MCP=1 setup v1.0.0 "${MCP_ON[@]}"
FAKE_UNHEALTHY=v1.1.0 deploy v1.1.0 "$work/new-compose.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @v1.1.0 pull+mcp @v1.1.0 migrate @v1.1.0 seed @v1.1.0 up @v1.1.0 health @v1.1.0 health @v1.1.0 health @v1.1.0 up @v1.0.0 health @v1.0.0"
check "previous version running" eq "$(running)" v1.0.0
check "adapter gone" eq "$(running_mcp)" none
check "compose restored" eq "$(cat "$srv/docker-compose.prod.yml")" "# compose old"

test_case "refuses the adapter's profile without REMOTE_MCP_ENABLED=true"
NEW_MCP=1 setup v1.0.0 COMPOSE_PROFILES=remote-mcp REMOTE_MCP_ENABLED=false
deploy v1.1.0 "$work/new-compose.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @v1.1.0"
check "explains why" has "$work/out" "REMOTE_MCP_ENABLED is not true"
check ".env version restored" eq "$(env_version)" v1.0.0
check "compose restored" eq "$(cat "$srv/docker-compose.prod.yml")" "# compose old"
check "switch line kept" has "$srv/.env" "REMOTE_MCP_ENABLED=false"

test_case "rejects an invalid version"
for bad in "" "1.2.3" "v1.2" "v1.2.3-rc.1" 'v1.2.3;id'; do
  setup v1.0.0
  deploy "$bad"
  check "exit 2 for [$bad]" eq "$rc" 2
  check "no docker call for [$bad]" eq "$(calls)" ""
  check ".env untouched for [$bad]" eq "$(env_version)" v1.0.0
done

test_case "refuses to run while another deploy holds the lock"
setup v1.0.0
exec 8>"$srv/.deploy.lock"
flock 8
deploy v1.1.0
exec 8>&-
check "exit 1" eq "$rc" 1
check "no docker call" eq "$(calls)" ""
check "explains why" has "$work/out" "another deploy is already running"
check ".env untouched" eq "$(env_version)" v1.0.0

# --- Staging (#421) ----------------------------------------------------------

release=$work/release
S1=sha-1111111
S2=sha-2222222

# setup_staging <running version or ""> [.env lines...] — /srv/capi-staging
# with both compose files, and a release directory with the new ones.
# NEW_OVERRIDE: content of the new docker-compose.staging.yml.
# OLD_STAGING_NAME / NEW_STAGING_NAME: a `name:` line in that override.
setup_staging() {
  setup "$@"
  echo "# staging old" >"$srv/docker-compose.staging.yml"
  [[ -z ${OLD_STAGING_NAME:-} ]] || echo "name: $OLD_STAGING_NAME" >>"$srv/docker-compose.staging.yml"
  if [[ -n ${1:-} ]]; then
    echo "${OLD_STAGING_NAME:-finances-staging}" >"$state/running_project"
    echo "${OLD_STAGING_NAME:-finances-staging}" >"$state/db"
  fi
  rm -rf "$release"
  mkdir -p "$release"
  echo "# compose new${NEW_MCP:+ capi-mcp}" >"$release/docker-compose.prod.yml"
  printf '%s\n' "${NEW_OVERRIDE:-# staging new
        aliases:
          - capi-staging-web
          - finances-staging-web}" >"$release/docker-compose.staging.yml"
  [[ -z ${NEW_STAGING_NAME:-} ]] || echo "name: $NEW_STAGING_NAME" >>"$release/docker-compose.staging.yml"
}

staging_files() { cat "$srv/docker-compose.prod.yml" "$srv/docker-compose.staging.yml" | head -n 2 | tr '\n' '|'; }

test_case "staging: deploys a commit and keeps the data (#494)"
setup_staging $S1
deploy --staging $S2 "$release/docker-compose.prod.yml"
check "exit 0" eq "$rc" 0
check "steps" eq "$(calls)" "config @$S2 pull @$S2 migrate @$S2 seed @$S2 demo @$S2 up @$S2 health @$S2"
check "staging project" eq "$(project)" finances-staging
check ".env version" eq "$(env_version)" $S2
check "running" eq "$(running)" $S2
check "both compose files installed" eq "$(staging_files)" "# compose new|# staging new|"
check "no compose backup left" eq "$(find "$srv" -name '*.prev' | wc -l)" 0
check "deploy.log written" has "$srv/deploy.log" "deployed $S2 to finances-staging (previous: $S1)"

test_case "staging: resets the demo data on demand"
setup_staging $S1
deploy --staging --reset-demo $S2 "$release/docker-compose.prod.yml"
check "exit 0" eq "$rc" 0
check "steps" eq "$(calls)" "config @$S2 pull @$S2 migrate @$S2 seed @$S2 demo-reset @$S2 up @$S2 health @$S2"
check "running" eq "$(running)" $S2

test_case "staging: keeps the running version when the reset fails"
setup_staging $S1
FAKE_DEMO_FAIL=$S2 deploy --staging --reset-demo $S2 "$release/docker-compose.prod.yml"
check "exit 1" eq "$rc" 1
check "running untouched" eq "$(running)" $S1
check "says why" has "$work/out" "FAILED: demo data"

test_case "production refuses --reset-demo"
setup v1.0.0
deploy --reset-demo v1.1.0
check "exit 2" eq "$rc" 2
check "running untouched" eq "$(running)" v1.0.0

test_case "staging: first deploy"
setup_staging ""
rm "$srv/docker-compose.prod.yml" "$srv/docker-compose.staging.yml"
deploy --staging $S1 "$release/docker-compose.prod.yml"
check "exit 0" eq "$rc" 0
check "running" eq "$(running)" $S1
check "both compose files installed" eq "$(staging_files)" "# compose new|# staging new|"

test_case "staging: keeps the running version when the demo data fails"
setup_staging $S1
FAKE_DEMO_FAIL=$S2 deploy --staging $S2 "$release/docker-compose.prod.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @$S2 pull @$S2 migrate @$S2 seed @$S2 demo @$S2"
check ".env version restored" eq "$(env_version)" $S1
check "running untouched" eq "$(running)" $S1
check "both compose files restored" eq "$(staging_files)" "# compose old|# staging old|"
check "says why" has "$work/out" "FAILED: demo data"

test_case "staging: rolls back both compose files when the health check fails"
setup_staging $S1
FAKE_UNHEALTHY=$S2 deploy --staging $S2 "$release/docker-compose.prod.yml"
check "exit 1" eq "$rc" 1
check "previous version running" eq "$(running)" $S1
check "both compose files restored" eq "$(staging_files)" "# compose old|# staging old|"
check "reports rollback" has "$work/out" "rolled back to $S1"

for alias in capi-web finances-web; do
  test_case "staging: refuses a configuration with web's production alias $alias"
  NEW_OVERRIDE="# staging new
        aliases:
          - $alias
          - capi-staging-web" setup_staging $S1
  deploy --staging $S2 "$release/docker-compose.prod.yml"
  check "exit 1" eq "$rc" 1
  check "steps" eq "$(calls)" "config @$S2"
  check "explains why" has "$work/out" "keeps web's production alias ($alias)"
  check ".env version restored" eq "$(env_version)" $S1
  check "both compose files restored" eq "$(staging_files)" "# compose old|# staging old|"
done

test_case "staging: refuses the MCP adapter"
NEW_MCP=1 setup_staging $S1 "${MCP_ON[@]}"
deploy --staging $S2 "$release/docker-compose.prod.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @$S2"
check "explains why" has "$work/out" "never runs on staging"
check ".env version restored" eq "$(env_version)" $S1

test_case "staging: needs the override next to the compose file"
setup_staging $S1
rm "$release/docker-compose.staging.yml"
deploy --staging $S2 "$release/docker-compose.prod.yml"
check "exit 2" eq "$rc" 2
check "no docker call" eq "$(calls)" ""
check ".env untouched" eq "$(env_version)" $S1

test_case "staging: rejects anything but sha-<commit>"
for bad in v1.2.3 sha-123456 sha-ABCDEF1 sha-xyz1234 'sha-1234567;id' ''; do
  setup_staging $S1
  deploy --staging "$bad"
  check "exit 2 for [$bad]" eq "$rc" 2
  check "no docker call for [$bad]" eq "$(calls)" ""
done

test_case "staging: moves from finances-staging to capi-staging"
NEW_STAGING_NAME=capi-staging VOLUMES=finances-staging_db_data setup_staging $S1 DB_VOLUME=finances-staging_db_data
deploy --staging $S2 "$release/docker-compose.prod.yml"
check "exit 0" eq "$rc" 0
check "steps" eq "$(calls)" "config @$S2 pull @$S2 down finances-staging @$S2 migrate @$S2 seed @$S2 demo @$S2 up @$S2 health @$S2"
check "staging project" eq "$(project)" capi-staging
check "one database" eq "$(db_running)" capi-staging
check "deploy.log written" has "$srv/deploy.log" "deployed $S2 to capi-staging (previous: $S1)"

test_case "staging: refuses a project that is not *-staging"
NEW_STAGING_NAME=capi VOLUMES=finances-staging_db_data setup_staging $S1 DB_VOLUME=finances-staging_db_data
deploy --staging $S2 "$release/docker-compose.prod.yml"
check "exit 1" eq "$rc" 1
check "steps" eq "$(calls)" "config @$S2"
check "explains why" has "$work/out" "staging runs only in a project named *-staging, not capi"
check "staging untouched" eq "$(running_project) $(running)" "finances-staging $S1"
check "both compose files restored" eq "$(staging_files)" "# compose old|# staging old|"

test_case "production rejects a staging version"
setup v1.0.0
deploy $S1
check "exit 2" eq "$rc" 2
check "no docker call" eq "$(calls)" ""

test_case "runs migrations and seeds as the owner, and makes the API's database password once (#557)"
NEW_MIGRATE=1 setup v1.0.0
deploy v1.1.0 "$work/new-compose.yml"
check "exit 0" eq "$rc" 0
check "steps" eq "$(calls)" "config @v1.1.0 pull @v1.1.0 migrate @v1.1.0 seed @v1.1.0 up @v1.1.0 health @v1.1.0"
check "in the migrate service" eq "$(run_services)" migrate
password=$(sed -n 's/^APP_DB_PASSWORD=//p' "$srv/.env")
check "password written" eq "${#password}" 64
check ".env stays private" eq "$(stat -c %a "$srv/.env")" 600
check "other .env lines kept" eq "$(grep -c -e '^POSTGRES_USER=app$' -e '^JWT_SECRET=not-a-secret$' "$srv/.env")" 2
deploy v1.2.0 "$work/new-compose.yml"
check "exit 0 again" eq "$rc" 0
check "password kept" eq "$(sed -n 's/^APP_DB_PASSWORD=//p' "$srv/.env")" "$password"

test_case "keeps the api service and no password for a compose file from before #557"
setup v1.0.0
deploy v1.1.0 "$work/new-compose.yml"
check "exit 0" eq "$rc" 0
check "in the api service" eq "$(run_services)" api
check "no password" eq "$(grep -c '^APP_DB_PASSWORD=' "$srv/.env")" 0

if ((failures > 0)); then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all deploy.sh checks passed"
