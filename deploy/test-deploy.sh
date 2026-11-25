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
# prints the installed compose files). The project given with `-p` (staging) is
# written to $FAKE_STATE/project.
cat >"$work/bin/docker" <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail
[[ $1 == compose ]] || { echo "fake docker: unexpected $*" >&2; exit 99; }
shift
args=()
while (($#)); do
  case $1 in
    -f) shift 2 ;;
    -p) echo "$2" >"$FAKE_STATE/project"; shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
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
case "${args[*]}" in
  "config --services") services | tr ' ' '\n'; exit 0 ;;
  config) cat docker-compose.prod.yml; [[ ! -f docker-compose.staging.yml ]] || cat docker-compose.staging.yml; exit 0 ;;
  "config --quiet") step=config ;;
  "pull api web") step=pull; listed FAKE_PULL_FAIL ;;
  "pull api web capi-mcp" | "pull api web finances-mcp") step=pull+mcp; listed FAKE_PULL_FAIL ;;
  "run --rm -T api node dist/database/migrate.js") step=migrate; listed FAKE_MIGRATE_FAIL ;;
  "run --rm -T api node dist/database/seed.js") step=seed ;;
  "run --rm -T api node dist/database/seed-demo.js --reset") step=demo; listed FAKE_DEMO_FAIL ;;
  "up -d --remove-orphans")
    step=up
    echo "$v" >"$FAKE_STATE/running"
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

# setup <running version or ""> [.env lines...] — fresh /srv/finances with
# .env and compose file. OLD_MCP / NEW_MCP=1: that compose file has the MCP
# adapter (and the old one runs it when its profile is on). OLD_LEGACY=1: the
# running compose file is from before #464 (FINANCES_VERSION, finances-mcp),
# and so is .env. ENV_VERSION_LINES: replaces the version lines of .env.
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
  [[ -z ${OLD_LEGACY:-} ]] || old_mcp=finances-mcp
  echo "# compose old${OLD_LEGACY:+ legacy}${OLD_MCP:+ $old_mcp}" >"$srv/docker-compose.prod.yml"
  echo "# compose new${NEW_MCP:+ capi-mcp}" >"$work/new-compose.yml"
  if [[ -n $running ]]; then
    echo "$running" >"$state/running"
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
check "deploy.log written" has "$srv/deploy.log" "deployed v1.1.0 (previous: v1.0.0)"
check "default project" eq "$(project)" none

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
check "previous version read" has "$srv/deploy.log" "deployed v1.1.0 (previous: v1.0.0)"

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
check "previous version read" has "$srv/deploy.log" "deployed v1.2.0 (previous: v1.0.0)"

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

# setup_staging <running version or ""> [.env lines...] — /srv/finances-staging
# with both compose files, and a release directory with the new ones.
# NEW_OVERRIDE: content of the new docker-compose.staging.yml.
setup_staging() {
  setup "$@"
  echo "# staging old" >"$srv/docker-compose.staging.yml"
  rm -rf "$release"
  mkdir -p "$release"
  echo "# compose new${NEW_MCP:+ capi-mcp}" >"$release/docker-compose.prod.yml"
  printf '%s\n' "${NEW_OVERRIDE:-# staging new
        aliases:
          - capi-staging-web
          - finances-staging-web}" >"$release/docker-compose.staging.yml"
}

staging_files() { cat "$srv/docker-compose.prod.yml" "$srv/docker-compose.staging.yml" | head -n 2 | tr '\n' '|'; }

test_case "staging: deploys a commit with fresh demo data"
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

test_case "production rejects a staging version"
setup v1.0.0
deploy $S1
check "exit 2" eq "$rc" 2
check "no docker call" eq "$(calls)" ""

if ((failures > 0)); then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all deploy.sh checks passed"
