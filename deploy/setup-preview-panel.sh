#!/usr/bin/env bash
# One-time server setup of the previews' list and settings panel (#608,
# docs/runbooks/previews.md), run from the admin machine (the owner's Mac)
# once this repository's pull request and the infra one are merged:
#
#   deploy/setup-preview-panel.sh [ssh target, default ops@vps]
#
# INFRA_DIR names a checkout of GregoireBDN/infra (default ../infra next to
# this repository, cloned there when missing). Every file comes from the
# `main` branch of each repository (git show origin/main:…), never from the
# working tree. Safe to run again.
set -euo pipefail

target=${1:-ops@vps}
here=$(cd "$(dirname "$0")/.." && pwd)
infra=${INFRA_DIR:-$here/../infra}

git -C "$here" fetch -q origin main
if [[ ! -d $infra/.git ]]; then
  git clone -q https://github.com/GregoireBDN/infra.git "$infra"
fi
git -C "$infra" fetch -q origin main

capi_file() { git -C "$here" show "origin/main:$1"; }
infra_file() { git -C "$infra" show "origin/main:$1"; }

# Refuse to go on with a main that does not have #608 yet.
capi_file deploy/systemd/capi-previews-apply.path >/dev/null
infra_file caddy/Caddyfile | grep -q capi-previews.gbodin.cloud ||
  { echo "the infra pull request of #608 is not merged yet" >&2; exit 1; }

echo "== directories and panel.env"
ssh "$target" 'set -e
  sudo install -d -o deploy -g deploy -m 755 /srv/capi-previews/public
  sudo install -d -o deploy -g deploy -m 750 /srv/capi-previews/requests
  printf "PANEL_UID=%s\nPANEL_GID=%s\n" "$(id -u deploy)" "$(id -g deploy)" |
    sudo -u deploy tee /srv/capi-previews/panel.env >/dev/null'

echo "== systemd: apply the panel's settings when it writes one"
for unit in capi-previews-apply.service capi-previews-apply.path; do
  # shellcheck disable=SC2029 # $unit is ours, expanded here on purpose
  capi_file "deploy/systemd/$unit" | ssh "$target" "sudo tee /etc/systemd/system/$unit >/dev/null"
done
ssh "$target" 'sudo systemctl daemon-reload && sudo systemctl enable --now capi-previews-apply.path'

echo "== Caddy: capi-previews.gbodin.cloud"
# Copied in place (cp, not mv): the container mounts the file itself, a new
# inode would not reach it. Back to the previous file if it does not validate.
infra_file caddy/Caddyfile | ssh "$target" 'set -e; cd /srv/caddy
  sudo tee /tmp/Caddyfile.608 >/dev/null
  sudo cp Caddyfile "Caddyfile.bak-$(date +%F)"
  sudo cp /tmp/Caddyfile.608 Caddyfile
  if ! sudo docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile; then
    sudo cp "Caddyfile.bak-$(date +%F)" Caddyfile
    echo "Caddyfile refused, previous one kept" >&2; exit 1
  fi
  sudo docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile'

echo "== portal: « À tester »"
infra_file portal/config/services.yaml | ssh "$target" 'sudo tee /srv/portal/config/services.yaml >/dev/null &&
  cd /srv/portal && docker compose restart homepage'

echo "== tooling from main (staging deploy step), then a first run"
cat <<'MSG'
If /srv/capi-previews/preview-panel is missing, run Actions › Staging › Run workflow
(it installs preview.sh and the panel), then:
MSG
ssh "$target" 'sudo systemctl start capi-previews.service; sleep 5;
  sudo journalctl -u capi-previews -n 5 --no-pager;
  docker ps --filter name=capi-previews-panel --format "{{.Names}} {{.Status}}" 2>/dev/null || sudo docker ps --filter name=capi-previews-panel --format "{{.Names}} {{.Status}}"'
echo "Done: open https://gbodin.cloud and https://capi-previews.gbodin.cloud from the phone."
