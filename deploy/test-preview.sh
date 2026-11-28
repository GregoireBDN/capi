#!/usr/bin/env bash
# Checks are strings evaluated later by `check` (single quotes on purpose).
# shellcheck disable=SC2016,SC2034
# Tests preview.sh against a fake `docker` on PATH and a file of pull requests
# instead of GitHub's API: no Docker, network or server needed. Needs Linux
# userland (flock, GNU date) and python3, e.g. CI or
#   docker run --rm -v "$PWD":/w -w /w python:3.12 bash deploy/test-preview.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"

# Fake docker. `manifest inspect` succeeds for the tags listed in
# $FAKE_STATE/images; `compose` calls are recorded as `<project> <command>`
# in $FAKE_STATE/calls, fail when `<project> <command>` is listed in
# $FAKE_STATE/fail, and `config` prints the preview override with
# ${PREVIEW_NUMBER} replaced from .env (enough for the alias checks); the
# MCP adapter is a service only with COMPOSE_PROFILES=remote-mcp, like the
# real profile.
cat >"$work/bin/docker" <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail
if [[ $1 == manifest ]]; then
  grep -qx -- "${3##*:}" "$FAKE_STATE/images" 2>/dev/null
  exit
fi
if [[ $1 == volume ]]; then
  echo "volume $*" >>"$FAKE_STATE/calls"
  exit 0
fi
[[ $1 == compose ]] || { echo "fake docker: unexpected $*" >&2; exit 99; }
shift
project= files=() args=()
while (($#)); do
  case $1 in
    -p) project=$2; shift 2 ;;
    -f) files+=("$2"); shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
cmd=${args[0]}
if [[ $cmd == config ]]; then
  n=$(sed -n 's/^PREVIEW_NUMBER=//p' .env)
  if [[ ${args[1]:-} == --services ]]; then
    printf 'db\napi\nweb\n'
    if grep -qx 'COMPOSE_PROFILES=remote-mcp' .env; then echo capi-mcp; fi
  else
    # The override's `!override` replaces production's aliases: print it.
    sed "s/\${PREVIEW_NUMBER}/$n/g" "${files[-1]}"
  fi
  exit 0
fi
[[ $cmd == run ]] && cmd="run ${args[*]: -1}"
echo "$project $cmd" >>"$FAKE_STATE/calls"
if grep -qx -- "$project $cmd" "$FAKE_STATE/fail" 2>/dev/null; then exit 1; fi
SHIM
chmod +x "$work/bin/docker"

srv=$work/srv
state=$work/state
export PATH="$work/bin:$PATH" PREVIEWS_DIR=$srv FAKE_STATE=$state
export PREVIEW_PULLS_FILE=$work/pulls.json HEALTH_RETRIES=2 HEALTH_INTERVAL=0

fails=0
check() {
  if eval "$2"; then
    echo "ok   - $1"
  else
    echo "FAIL - $1"
    fails=$((fails + 1))
  fi
}

reset() {
  rm -rf "$srv" "$state"
  mkdir -p "$srv" "$state"
  cp "$here/../docker-compose.prod.yml" "$here/../docker-compose.preview.yml" "$srv/"
  : >"$state/calls"
}

sha() { printf '%040d' "$1" | tr 0 "${2:-a}"; }
ago() { date -u -d "$1 ago" +%Y-%m-%dT%H:%M:%SZ; }
# pulls 'number:minutes-ago[:repo[:sha letter]]' ...
pulls() {
  local spec n min repo letter out=()
  for spec in "$@"; do
    IFS=: read -r n min repo letter <<<"$spec"
    out+=("{\"number\":$n,\"updated_at\":\"$(ago "$min minutes")\",\"head\":{\"sha\":\"$(sha "$n" "${letter:-a}")\",\"repo\":{\"full_name\":\"${repo:-GregoireBDN/capi}\"}}}")
  done
  local joined
  joined=$(printf '%s,' "${out[@]}")
  echo "[${joined%,}]" >"$PREVIEW_PULLS_FILE"
}
image() { echo "pr-$1-$(sha "$1" "${2:-a}" | cut -c1-7)" >>"$state/images"; }
calls() { cat "$state/calls"; }
run() { "$here/preview.sh" "$@" >"$work/out" 2>&1; local rc=$?; cat "$work/out" >>"$work/all"; return $rc; }

echo "# a pull request with its images gets a preview"
reset
pulls 12:5
image 12
run sync && rc=0 || rc=$?
check "sync succeeds" '[[ $rc -eq 0 ]]'
check "pull, migrate, seed, demo, up in order" '[[ "$(calls)" == "capi-pr-12 pull
capi-pr-12 run dist/database/migrate.js
capi-pr-12 run dist/database/seed.js
capi-pr-12 run --if-empty
capi-pr-12 up
capi-pr-12 exec" ]]'
check ".env has its own secrets and the version" 'grep -q "^CAPI_VERSION=pr-12-aaaaaaa$" "$srv/pr-12/.env" && grep -q "^DB_VOLUME=capi-pr-12_db_data$" "$srv/pr-12/.env" && grep -Eq "^JWT_SECRET=[0-9a-f]{64}$" "$srv/pr-12/.env"'
check ".env is private" '[[ $(stat -c %a "$srv/pr-12/.env") == 600 ]]'
secret=$(grep JWT_SECRET "$srv/pr-12/.env")

echo "# the same commit again does nothing"
: >"$state/calls"
run sync
check "no call" '[[ -z "$(calls)" ]]'

echo "# a new commit is deployed, secrets kept"
pulls 12:1::b
image 12 b
run sync
check "deployed pr-12-bbbbbbb" 'grep -q "^CAPI_VERSION=pr-12-bbbbbbb$" "$srv/pr-12/.env"'
check "same JWT secret" '[[ $(grep JWT_SECRET "$srv/pr-12/.env") == "$secret" ]]'

echo "# a new commit still building keeps the running preview"
: >"$state/calls"
pulls 12:1::c
run sync
check "nothing removed or deployed" '[[ -z "$(calls)" ]] && [[ -d $srv/pr-12 ]]'

echo "# forks, stale pull requests and pull requests without images get none"
reset
pulls 20:5:someone/capi 21:$((8 * 24 * 60)) 22:5
image 20
image 21
run sync
check "no deploy" '[[ -z "$(calls)" ]] && [[ ! -e $srv/pr-20 && ! -e $srv/pr-21 && ! -e $srv/pr-22 ]]'

echo "# at most MAX_PREVIEWS, the most recently updated first"
reset
pulls 31:40 32:10 33:20 34:30
for n in 31 32 33 34; do image $n; done
run sync
check "32, 33, 34 deployed, not 31" '[[ -d $srv/pr-32 && -d $srv/pr-33 && -d $srv/pr-34 && ! -e $srv/pr-31 ]]'

echo "# a closed pull request's preview is removed, with its volume"
pulls 32:10 33:20
: >"$state/calls"
run sync
check "pr-34 down -v, directory gone" '[[ "$(calls)" == "capi-pr-34 down" ]] && [[ ! -e $srv/pr-34 ]]'

echo "# remove by hand"
: >"$state/calls"
run remove 33
check "pr-33 removed" '[[ "$(calls)" == "capi-pr-33 down" ]] && [[ ! -e $srv/pr-33 ]]'
check "refuses a name that is not a number" '! "$here/preview.sh" remove "../capi" >/dev/null 2>&1'

echo "# a failed deploy stops the preview and is not retried for that commit"
reset
pulls 40:5
image 40
echo "capi-pr-40 run dist/database/migrate.js" >"$state/fail"
run sync && rc=0 || rc=$?
check "sync fails" '[[ $rc -ne 0 ]]'
check "stopped, failure recorded" '[[ "$(tail -n 1 "$state/calls")" == "capi-pr-40 down" ]] && grep -qx pr-40-aaaaaaa "$srv/pr-40/.failed"'
: >"$state/calls"
run sync
check "same commit not retried" '[[ -z "$(calls)" ]]'
rm "$state/fail"
pulls 40:1::b
image 40 b
run sync
check "next commit deployed, failure cleared" 'grep -q "^CAPI_VERSION=pr-40-bbbbbbb$" "$srv/pr-40/.env" && [[ ! -e $srv/pr-40/.failed ]]'

echo "# a preview never takes production's or staging's alias"
reset
pulls 50:5
image 50
sed -i 's/- capi-pr-${PREVIEW_NUMBER}-web/- capi-web/' "$srv/docker-compose.preview.yml"
run sync && rc=0 || rc=$?
check "refused before any pull" '[[ $rc -ne 0 ]] && ! grep -q pull "$state/calls" && grep -q "web would answer as capi-web" "$work/out"'

echo "# the GitHub API failing changes nothing"
reset
mkdir -p "$srv/pr-60"
echo "not json" >"$PREVIEW_PULLS_FILE"
run sync && rc=0 || rc=$?
check "fails, preview kept" '[[ $rc -ne 0 && -d $srv/pr-60 && -z "$(calls)" ]]'

if ((fails)); then
  cat "$work/all"
  echo "$fails check(s) failed"
  exit 1
fi
echo "all checks passed"
