#!/usr/bin/env bash
# Pull request previews on the server (#599, docs/runbooks/previews.md).
#
#   preview.sh sync       deploy the latest images of the open pull requests,
#                         remove every other preview
#   preview.sh remove N   remove the preview of pull request N
#
# Pull-based on purpose. The capi-previews systemd timer runs `sync` every two
# minutes as `deploy`: it reads the open pull requests from GitHub's public API
# and pulls the images the Preview workflow pushed for their latest commit
# (ghcr.io/gregoirebdn/capi-{api,web}:pr-<n>-<commit>). No workflow holds a
# key to the server and nothing on GitHub chooses what runs here: this script
# and the compose files are installed from main by the staging deploy; a pull
# request only brings images, run as the same hardened containers as
# production, with demo data only.
#
# A preview is the compose project capi-pr-<n> in $PREVIEWS_DIR/pr-<n>, with
# docker-compose.prod.yml, the docker-compose.preview.yml override and an
# `.env` written here once (its own database password and JWT secret). Only
# pull requests from this repository (never a fork) updated in the last
# MAX_AGE_DAYS days get one, the most recently updated first, at most
# MAX_PREVIEWS at once. A pull request whose images are not pushed yet keeps
# its running preview, or gets none. Closed, merged, stale or extra previews
# are removed with their volume. A failed deploy stops that preview (its data
# is kept) and the next run tries again.
#
# Logs go to stdout (the journal): pull request numbers and image tags only.
set -euo pipefail

PREVIEWS_DIR=${PREVIEWS_DIR:-/srv/capi-previews}
REPO=${PREVIEW_REPO:-GregoireBDN/capi}
REGISTRY=${PREVIEW_REGISTRY:-ghcr.io/gregoirebdn}
DOMAIN=${PREVIEW_DOMAIN:-gbodin.cloud}
MAX_PREVIEWS=${MAX_PREVIEWS:-3}
MAX_AGE_DAYS=${MAX_AGE_DAYS:-7}
MEM_LIMIT=${PREVIEW_MEM_LIMIT:-384m}
HEALTH_RETRIES=${HEALTH_RETRIES:-36}
HEALTH_INTERVAL=${HEALTH_INTERVAL:-5}
HEALTH_URL=http://localhost:3000/api/health
COMPOSE_FILES=(docker-compose.prod.yml docker-compose.preview.yml)
# Aliases a preview's `web` must never have on the `proxy` network.
FORBIDDEN_ALIASES=(capi-web finances-web capi-staging-web finances-staging-web)

log() { printf '[preview %s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

usage() {
  echo "usage: $0 sync | remove <pull request number>" >&2
  exit 2
}

valid_number() { [[ $1 =~ ^[1-9][0-9]{0,5}$ ]]; }

# Open pull requests worth a preview, one line each, most recently updated
# first: `<number> <head commit>`. PREVIEW_PULLS_FILE replaces the API (tests).
open_pulls() {
  local json
  if [[ -n ${PREVIEW_PULLS_FILE:-} ]]; then
    json=$(cat "$PREVIEW_PULLS_FILE")
  else
    json=$(curl -fsS --max-time 30 -H 'Accept: application/vnd.github+json' \
      "https://api.github.com/repos/$REPO/pulls?state=open&per_page=100")
  fi
  REPO=$REPO MAX_AGE_DAYS=$MAX_AGE_DAYS python3 -I -c '
import datetime, json, os, re, sys
repo = os.environ["REPO"].lower()
limit = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=int(os.environ["MAX_AGE_DAYS"]))
rows = []
try:
    pulls = json.load(sys.stdin)
except ValueError:
    sys.exit("the pull request list is not JSON")
for pr in pulls:
    head = pr.get("head") or {}
    if ((head.get("repo") or {}).get("full_name") or "").lower() != repo:
        continue
    updated = datetime.datetime.fromisoformat(pr["updated_at"].replace("Z", "+00:00"))
    sha = head.get("sha") or ""
    if updated < limit or not re.fullmatch(r"[0-9a-f]{40}", sha):
        continue
    rows.append((updated, int(pr["number"]), sha))
for updated, number, sha in sorted(rows, reverse=True):
    print(number, sha)
' <<<"$json"
}

image_exists() {
  local app
  for app in api web; do
    docker manifest inspect "$REGISTRY/capi-$app:$1" >/dev/null 2>&1 || return 1
  done
}

# The image tag a preview runs, empty when there is none.
running_version() {
  sed -n 's/^CAPI_VERSION=//p' "$PREVIEWS_DIR/pr-$1/.env" 2>/dev/null | tail -n 1 || true
}

# The image tag whose deploy last failed, empty when none: it is not tried
# again until the pull request gets a new commit.
failed_version() {
  cat "$PREVIEWS_DIR/pr-$1/.failed" 2>/dev/null || true
}

compose_in() {
  local n=$1
  shift
  (cd "$PREVIEWS_DIR/pr-$n" && docker compose -p "capi-pr-$n" -f "${COMPOSE_FILES[0]}" -f "${COMPOSE_FILES[1]}" "$@")
}

# write_env N VERSION — the preview's .env: secrets made once, version updated.
write_env() {
  local n=$1 version=$2 env=$PREVIEWS_DIR/pr-$1/.env tmp
  if [[ ! -f $env ]]; then
    (
      umask 077
      cat >"$env" <<EOF
PREVIEW_NUMBER=$n
DB_VOLUME=capi-pr-${n}_db_data
POSTGRES_USER=capi
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
APP_URL=https://capi-pr-$n.$DOMAIN
WEBAUTHN_RP_ID=
WEBAUTHN_ORIGIN=
TRUSTED_PROXIES=loopback,uniquelocal
WEB_TRUSTED_PROXIES=caddy
APP_MEM_LIMIT=$MEM_LIMIT
COMPOSE_PROFILES=
EOF
    )
  fi
  tmp=$(umask 077 && mktemp "$env.XXXXXX")
  grep -v -e '^CAPI_VERSION=' -e '^FINANCES_VERSION=' "$env" >"$tmp" || true
  printf 'CAPI_VERSION=%s\nFINANCES_VERSION=%s\n' "$version" "$version" >>"$tmp"
  mv -f "$tmp" "$env"
}

healthy() {
  compose_in "$1" exec -T web node -e \
    "fetch('$HEALTH_URL',{signal:AbortSignal.timeout(10000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1
}

# deploy N VERSION — returns non-zero (and stops the preview) on failure.
deploy() {
  local n=$1 version=$2 dir=$PREVIEWS_DIR/pr-$1 config alias services i
  log "pr-$n: deploying $version (was: $(running_version "$n" || true))"
  mkdir -p "$dir"
  for i in "${COMPOSE_FILES[@]}"; do
    cp "$PREVIEWS_DIR/$i" "$dir/$i.tmp"
    mv -f "$dir/$i.tmp" "$dir/$i"
  done
  write_env "$n" "$version"

  if ! config=$(compose_in "$n" config); then
    log "pr-$n: invalid compose configuration"
    return 1
  fi
  for alias in "${FORBIDDEN_ALIASES[@]}"; do
    if grep -Eq "^[[:space:]]*- ${alias}\$" <<<"$config"; then
      log "pr-$n: refused, web would answer as $alias"
      return 1
    fi
  done
  services=$(compose_in "$n" config --services)
  if grep -Eqx '(capi|finances)-mcp' <<<"$services"; then
    log "pr-$n: refused, the remote MCP adapter never runs in a preview"
    return 1
  fi

  if compose_in "$n" pull api web &&
    compose_in "$n" run --rm -T api node dist/database/migrate.js &&
    compose_in "$n" run --rm -T api node dist/database/seed.js &&
    compose_in "$n" run --rm -T api node dist/database/seed-demo.js --if-empty &&
    compose_in "$n" up -d --remove-orphans; then
    for ((i = 1; i <= HEALTH_RETRIES; i++)); do
      if healthy "$n"; then
        log "pr-$n: $version is up at https://capi-pr-$n.$DOMAIN"
        rm -f "$dir/.failed"
        return 0
      fi
      sleep "$HEALTH_INTERVAL"
    done
    log "pr-$n: still unhealthy after $HEALTH_RETRIES checks"
  else
    log "pr-$n: deploy step failed"
  fi
  # Free the memory and remember the failure: the next commit of the pull
  # request is tried, not this one again.
  compose_in "$n" down --remove-orphans || true
  write_env "$n" ""
  echo "$version" >"$dir/.failed"
  return 1
}

remove() {
  local n=$1 dir=$PREVIEWS_DIR/pr-$1
  valid_number "$n" || usage
  log "pr-$n: removing"
  if [[ -f $dir/.env && -f $dir/${COMPOSE_FILES[0]} ]]; then
    compose_in "$n" down -v --remove-orphans
  else
    docker compose -p "capi-pr-$n" down --remove-orphans
    docker volume rm -f "capi-pr-${n}_db_data" >/dev/null
  fi
  rm -rf -- "$dir"
}

sync() {
  local pulls line n sha version keep=() deploys=() failed=0 dir

  if ! pulls=$(open_pulls); then
    log "could not read the open pull requests; nothing changed"
    return 1
  fi

  while read -r n sha; do
    [[ -n ${n:-} ]] || continue
    ((${#keep[@]} < MAX_PREVIEWS)) || break
    valid_number "$n" || continue
    version=pr-$n-${sha:0:7}
    if [[ $(running_version "$n") == "$version" || $(failed_version "$n") == "$version" ]]; then
      keep+=("$n")
    elif image_exists "$version"; then
      keep+=("$n")
      deploys+=("$n:$version")
    elif [[ -n $(running_version "$n") ]]; then
      # The new commit's images are still building: keep the running one.
      keep+=("$n")
    fi
  done <<<"$pulls"

  # Remove first, so the memory is free before anything starts.
  for dir in "$PREVIEWS_DIR"/pr-*; do
    [[ -d $dir ]] || continue
    n=${dir##*/pr-}
    valid_number "$n" || continue
    if [[ " ${keep[*]} " != *" $n "* ]]; then
      remove "$n" || failed=1
    fi
  done

  for line in "${deploys[@]}"; do
    deploy "${line%%:*}" "${line#*:}" || failed=1
  done
  return "$failed"
}

[[ -d $PREVIEWS_DIR ]] || { echo "$PREVIEWS_DIR is missing" >&2; exit 1; }
exec 9>"$PREVIEWS_DIR/.lock"
flock -n 9 || { log "another run is in progress"; exit 0; }

case ${1:-} in
  sync) sync ;;
  remove) [[ $# -eq 2 ]] || usage; remove "$2" ;;
  *) usage ;;
esac
