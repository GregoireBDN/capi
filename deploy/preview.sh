#!/usr/bin/env bash
# Pull request previews on the server (#599, docs/runbooks/previews.md).
#
#   preview.sh sync       deploy the latest images of the open pull requests,
#                         remove every other preview, apply the settings
#   preview.sh apply      apply the settings asked from the panel (#608), no
#                         call to GitHub (the capi-previews-apply.path unit)
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
# Settings (#608): the panel (deploy/preview-panel, capi-previews.gbodin.cloud)
# has no Docker access. It writes what the owner asks, one JSON file per pull
# request, in $PREVIEWS_DIR/requests; `apply` reads each one, keeps only the
# allow-listed settings below and applies them. Nothing else in a preview's
# `.env` can be changed from there: never a database, a secret or an address.
#
#   look        staging | production   the web's APP_ENVIRONMENT (the look only)
#   autoSignIn  true | false           DEMO_AUTO_SIGN_IN, the demo sign-in
#   reset       a short id             new id = seed-demo --reset (fresh data)
#
# Every run writes $PREVIEWS_DIR/public/index.json, the running previews with
# their title, labels and settings, read by the panel and the gbodin.cloud
# portal. Pull requests labelled `visuel` take the preview slots first.
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
REQUESTS_DIR=$PREVIEWS_DIR/requests
PUBLIC_DIR=$PREVIEWS_DIR/public
# Titles and labels of the open pull requests, kept between runs for the index.
PULLS_META=$PREVIEWS_DIR/.pulls.json
PANEL_FILES=(preview-panel/compose.yml preview-panel/server.mjs preview-panel/panel.css)
# Aliases a preview's `web` must never have on the `proxy` network.
FORBIDDEN_ALIASES=(capi-web finances-web capi-staging-web finances-staging-web)

log() { printf '[preview %s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

usage() {
  echo "usage: $0 sync | apply | remove <pull request number>" >&2
  exit 2
}

valid_number() { [[ $1 =~ ^[1-9][0-9]{0,5}$ ]]; }

# Open pull requests worth a preview, one line each, those labelled `visuel`
# first, then the most recently updated: `<number> <head commit>`. Their
# titles and labels go to $PULLS_META. PREVIEW_PULLS_FILE replaces the API
# (tests).
open_pulls() {
  local json
  if [[ -n ${PREVIEW_PULLS_FILE:-} ]]; then
    json=$(cat "$PREVIEW_PULLS_FILE")
  else
    json=$(curl -fsS --max-time 30 -H 'Accept: application/vnd.github+json' \
      "https://api.github.com/repos/$REPO/pulls?state=open&per_page=100")
  fi
  REPO=$REPO MAX_AGE_DAYS=$MAX_AGE_DAYS META=$PULLS_META python3 -I -c '
import datetime, json, os, re, sys
repo = os.environ["REPO"].lower()
meta = {}
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
    labels = [str(l.get("name", ""))[:50] for l in pr.get("labels") or [] if isinstance(l, dict)]
    visual = "visuel" in labels
    rows.append((visual, updated, int(pr["number"]), sha))
    meta[str(int(pr["number"]))] = {"title": str(pr.get("title") or "")[:200], "labels": labels[:10]}
tmp = os.environ["META"] + ".tmp"
with open(tmp, "w") as f:
    json.dump(meta, f)
os.replace(tmp, os.environ["META"])
for visual, updated, number, sha in sorted(rows, reverse=True):
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
PREVIEW_APP_ENVIRONMENT=staging
PREVIEW_AUTO_SIGN_IN=true
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
  settings_to_env "$n" || true

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
  rm -f -- "$REQUESTS_DIR/pr-$n.json"
}

# The settings asked for pull request N, checked against the allow-list:
# `<look> <autoSignIn> <reset id> <number of settings dropped>`. A missing or
# unreadable request gives the defaults; an unknown key or value is dropped
# (and counted, never its text).
requested_settings() {
  REQUEST=$REQUESTS_DIR/pr-$1.json python3 -I -c '
import json, os, re
look, auto, reset, dropped = "staging", "true", "-", 0
try:
    with open(os.environ["REQUEST"], "rb") as f:
        raw = f.read(4097)
    request = json.loads(raw) if len(raw) <= 4096 else None
except (OSError, ValueError):
    request = {}
if not isinstance(request, dict):
    request, dropped = {}, 1
for key, value in request.items():
    if key == "look" and value in ("staging", "production"):
        look = value
    elif key == "autoSignIn" and isinstance(value, bool):
        auto = "true" if value else "false"
    elif key == "reset" and isinstance(value, str) and re.fullmatch(r"[0-9a-z]{1,32}", value):
        reset = value
    else:
        dropped += 1
print(look, auto, reset, dropped)
'
}

# env_value N KEY — a value of the preview's .env.
env_value() {
  sed -n "s/^$2=//p" "$PREVIEWS_DIR/pr-$1/.env" 2>/dev/null | tail -n 1 || true
}

# settings_to_env N — writes the asked look and sign-in to the preview's
# .env; succeeds only when something changed.
settings_to_env() {
  local n=$1 env=$PREVIEWS_DIR/pr-$1/.env look auto reset dropped tmp
  [[ -f $env ]] || return 1
  read -r look auto reset dropped < <(requested_settings "$n")
  if ((dropped)); then
    log "pr-$n: ignored $dropped setting(s) outside the allow-list"
  fi
  if [[ $(env_value "$n" PREVIEW_APP_ENVIRONMENT) == "$look" &&
    $(env_value "$n" PREVIEW_AUTO_SIGN_IN) == "$auto" ]]; then
    return 1
  fi
  tmp=$(umask 077 && mktemp "$env.XXXXXX")
  grep -v -e '^PREVIEW_APP_ENVIRONMENT=' -e '^PREVIEW_AUTO_SIGN_IN=' "$env" >"$tmp" || true
  printf 'PREVIEW_APP_ENVIRONMENT=%s\nPREVIEW_AUTO_SIGN_IN=%s\n' "$look" "$auto" >>"$tmp"
  mv -f "$tmp" "$env"
  log "pr-$n: settings look=$look autoSignIn=$auto"
}

# apply — the asked settings of every running preview: the containers whose
# variables changed are recreated, a new reset id reseeds the demo data.
apply() {
  local dir n look auto reset dropped failed=0
  for dir in "$PREVIEWS_DIR"/pr-*; do
    [[ -d $dir ]] || continue
    n=${dir##*/pr-}
    valid_number "$n" || continue
    [[ -n $(running_version "$n") ]] || continue
    if settings_to_env "$n"; then
      compose_in "$n" up -d --no-deps api web || {
        log "pr-$n: could not apply the settings"
        failed=1
      }
    fi
    read -r look auto reset dropped < <(requested_settings "$n")
    if [[ $reset != - && $reset != "$(cat "$dir/.reset" 2>/dev/null || true)" ]]; then
      # Recorded first: a reset that fails is not retried on every run.
      echo "$reset" >"$dir/.reset"
      if compose_in "$n" run --rm -T api node dist/database/seed-demo.js --reset; then
        log "pr-$n: fresh demo data"
      else
        log "pr-$n: demo data reset failed"
        failed=1
      fi
    fi
  done
  write_index
  return "$failed"
}

# write_index — $PUBLIC_DIR/index.json, the previews on this server for the
# panel and the portal: `previews` (all) and `visual` (labelled `visuel`).
write_index() {
  [[ -d $PUBLIC_DIR ]] || return 0
  PREVIEWS_DIR=$PREVIEWS_DIR PUBLIC_DIR=$PUBLIC_DIR META=$PULLS_META DOMAIN=$DOMAIN python3 -I -c '
import datetime, glob, json, os, re
root, domain = os.environ["PREVIEWS_DIR"], os.environ["DOMAIN"]
try:
    with open(os.environ["META"]) as f:
        meta = json.load(f)
except (OSError, ValueError):
    meta = {}
def read(path):
    try:
        with open(path) as f:
            return f.read()
    except OSError:
        return ""
def env(text, key):
    values = re.findall(r"^" + key + r"=(.*)$", text, re.M)
    return values[-1] if values else ""
previews = []
for d in glob.glob(os.path.join(root, "pr-*")):
    n = d.rsplit("pr-", 1)[1]
    if not re.fullmatch(r"[1-9][0-9]{0,5}", n) or not os.path.isdir(d):
        continue
    text = read(os.path.join(d, ".env"))
    version = env(text, "CAPI_VERSION")
    state = "up" if version else ("failed" if read(os.path.join(d, ".failed")) else "starting")
    info = meta.get(n, {})
    labels = info.get("labels", [])
    previews.append({
        "number": int(n),
        "label": "#" + n,
        "title": info.get("title") or "Pull request #" + n,
        "labels": labels,
        "visual": "visuel" in labels,
        "state": state,
        "version": version,
        "url": "https://capi-pr-%s.%s" % (n, domain),
        "pullUrl": "https://github.com/GregoireBDN/capi/pull/" + n,
        "look": env(text, "PREVIEW_APP_ENVIRONMENT") or "staging",
        "autoSignIn": (env(text, "PREVIEW_AUTO_SIGN_IN") or "true") == "true",
        "reset": read(os.path.join(d, ".reset")).strip(),
    })
previews.sort(key=lambda p: (not p["visual"], -p["number"]))
index = {
    "updatedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "previews": previews,
    "visual": [p for p in previews if p["visual"]],
}
tmp = os.path.join(os.environ["PUBLIC_DIR"], ".index.json.tmp")
with open(tmp, "w") as f:
    json.dump(index, f, ensure_ascii=False)
os.chmod(tmp, 0o644)
os.replace(tmp, os.path.join(os.environ["PUBLIC_DIR"], "index.json"))
'
}

# panel — keeps the settings panel running (capi-previews-panel), when its
# files are installed and its .env exists (one-time setup, see the runbook).
panel() {
  local f revision
  [[ -f $PREVIEWS_DIR/panel.env ]] || return 0
  for f in "${PANEL_FILES[@]}"; do
    [[ -f $PREVIEWS_DIR/$f ]] || return 0
  done
  # A new revision of its files (installed by the staging deploy) recreates
  # the container: node reads them once, at start.
  revision=$(cd "$PREVIEWS_DIR" && cat "${PANEL_FILES[@]}" | sha256sum | cut -c1-16)
  (cd "$PREVIEWS_DIR/preview-panel" && PANEL_REVISION=$revision docker compose -p capi-previews-panel \
    --env-file ../panel.env -f compose.yml up -d --remove-orphans --quiet-pull) >/dev/null ||
    { log "panel: could not start"; return 1; }
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
  apply || failed=1
  panel || failed=1
  return "$failed"
}

[[ -d $PREVIEWS_DIR ]] || { echo "$PREVIEWS_DIR is missing" >&2; exit 1; }
exec 9>"$PREVIEWS_DIR/.lock"
flock -n 9 || { log "another run is in progress"; exit 0; }

case ${1:-} in
  sync) sync ;;
  apply) apply ;;
  remove) [[ $# -eq 2 ]] || usage; remove "$2" && write_index ;;
  *) usage ;;
esac
