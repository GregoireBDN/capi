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

# Fake docker: records each `docker compose` call with the FINANCES_VERSION set
# in .env at that moment, and fails the steps listed (per version) in FAKE_*.
cat >"$work/bin/docker" <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail
[[ $1 == compose ]] || { echo "fake docker: unexpected $*" >&2; exit 99; }
shift
args=()
while (($#)); do
  case $1 in
    -f) shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
v=$(sed -n 's/^FINANCES_VERSION=//p' .env | tail -n 1)
rc=0
listed() { [[ " ${!1:-} " == *" $v "* ]] && rc=1; return 0; }
case "${args[*]}" in
  "config --quiet") step=config ;;
  "pull api web") step=pull; listed FAKE_PULL_FAIL ;;
  "run --rm -T api node dist/database/migrate.js") step=migrate; listed FAKE_MIGRATE_FAIL ;;
  "run --rm -T api node dist/database/seed.js") step=seed ;;
  "up -d --remove-orphans") step=up; echo "$v" >"$FAKE_STATE/running" ;;
  "exec -T web node -e "*)
    step=health
    running=$(cat "$FAKE_STATE/running" 2>/dev/null || echo none)
    echo "health @$running" >>"$FAKE_STATE/calls"
    [[ " ${FAKE_UNHEALTHY:-} " == *" $running "* ]] && exit 1
    exit 0 ;;
  *) echo "fake docker: unexpected compose ${args[*]}" >&2; exit 99 ;;
esac
echo "$step @$v" >>"$FAKE_STATE/calls"
exit "$rc"
SHIM
chmod +x "$work/bin/docker"

export PATH="$work/bin:$PATH" FINANCES_DIR=$srv FAKE_STATE=$state
export HEALTH_RETRIES=3 HEALTH_INTERVAL=0

failures=0
current=

# setup <running version or ""> — fresh /srv/finances with .env and compose file.
setup() {
  rm -rf "$srv" "$state"
  mkdir -p "$srv" "$state"
  : >"$state/calls"
  {
    echo "POSTGRES_USER=app"
    [[ -n $1 ]] && echo "FINANCES_VERSION=$1"
    echo "JWT_SECRET=not-a-secret"
  } >"$srv/.env"
  chmod 600 "$srv/.env"
  echo "# compose old" >"$srv/docker-compose.prod.yml"
  echo "# compose new" >"$work/new-compose.yml"
  [[ -n $1 ]] && echo "$1" >"$state/running"
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

env_version() { sed -n 's/^FINANCES_VERSION=//p' "$srv/.env"; }
running() { cat "$state/running" 2>/dev/null || echo none; }
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

test_case "first deploy adds FINANCES_VERSION to .env"
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

if ((failures > 0)); then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all deploy.sh checks passed"
