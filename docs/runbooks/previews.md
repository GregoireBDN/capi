# Runbook — pull request previews

Every open pull request that changes the app gets its own copy of Capi on the server (#599), at `https://capi-pr-<number>.gbodin.cloud`, reachable from the tailnet only, with **demo data only**. It replaces the test servers that ran on the owner's Mac: a pull request is tested from the phone, with the computer off.

## How it works

```text
push to a pull request (a branch of this repository, never a fork)
  └─ .github/workflows/preview.yml
       ├─ images    build, Trivy, push ghcr.io/gregoirebdn/capi-{api,web}:pr-<n>-<short commit>
       └─ comment   the preview's address on the pull request (one comment, updated)

on the server, every 2 minutes (systemd timer capi-previews, user deploy)
  └─ /srv/capi-previews/preview.sh sync
       ├─ read the open pull requests (GitHub's public API, no token)
       ├─ keep at most 3: this repository's, updated in the last 7 days, most recent first
       ├─ remove the other previews (stack and volume)
       └─ deploy a kept pull request whose new images are in GHCR:
            pull, migrate, seed, demo data (--if-empty), up -d, health check
```

**Pull, not push.** No workflow has a key to the server, and nothing a pull request contains decides what runs there: `preview.sh` and the compose files on the server are main's, installed by the staging deploy (`staging.yml`, step « Install the preview tooling »). A pull request only brings images, which run as the same hardened containers as production (read-only, no capabilities, memory-capped) with demo data. A pull request that changes `preview.sh` or `docker-compose.preview.yml` takes effect after its merge.

Each preview is the compose project `capi-pr-<n>` in `/srv/capi-previews/pr-<n>`: `docker-compose.prod.yml` with the override [`docker-compose.preview.yml`](../../docker-compose.preview.yml), and an `.env` written by the script on first deploy (its own `POSTGRES_PASSWORD` and `JWT_SECRET`, `APP_URL`, `DB_VOLUME=capi-pr-<n>_db_data`, `APP_MEM_LIMIT=384m`). Like staging: database `finances_preview_staging` (a `_staging` name, the only kind the demo seed accepts with the production images), no email, no remote MCP, no price or chain API, the yellow staging look, and `web` aliased `capi-pr-<n>-web` only on the `proxy` network (the script refuses to start one that would answer as production or staging). Caddy (infra repo) routes `capi-pr-<n>.gbodin.cloud` there; a preview that is not running answers 502.

- **A new commit**: deployed on the first run after its images are pushed (about 2 minutes after the comment); the data is kept, migrations run on it. Until then the previous commit keeps running.
- **A failed deploy**: the preview is stopped (data kept), the failure is written to `pr-<n>/.failed` and that commit is not tried again; the next commit is.
- **Closed, merged, or idle for 7 days**: removed with its volume on the next run. Above 3 open previews, the least recently updated one goes.
- **Demo account**: `usertest@finances.test` / `usertest`, as on staging.

The images stay in GHCR under their `pr-…` tags; clean them up from the package settings when they pile up.

## The list, the settings and the demo sign-in (#608)

```text
gbodin.cloud (portal)            « À tester »: the running previews labelled `visuel`, one tap each
  └─ ⚙ capi-previews.gbodin.cloud  settings panel: one card per preview
        look      Staging (yellow) | Production      web's APP_ENVIRONMENT
        🔑        demo sign-in on | off              api's DEMO_AUTO_SIGN_IN
        ↺         fresh demo data                    seed-demo --reset
```

- **Order**: pull requests labelled `visuel` take the 3 slots first, then the most recently updated.
- **Index**: every run of `preview.sh` writes `/srv/capi-previews/public/index.json` (number, title, labels, state, address, settings). The panel serves it at `/index.json`; the portal's Homepage reads it there, on the `proxy` network.
- **Panel** (`deploy/preview-panel/`): a Node script with no dependency, in a read-only container running as `deploy`'s uid with no capability, **no Docker socket, no secret, no database**. It shows the index and writes what the owner asks to `requests/pr-<n>.json`, nothing else: plain HTML forms, no script in the page, a strict CSP, and a post is refused unless its `Origin` is the panel's own (a page elsewhere in the browser can't change a preview). `preview.sh sync` keeps it running and restarts it when the staging deploy installs new files.
- **Applying**: the `capi-previews-apply.path` unit starts `preview.sh apply` (as `deploy`) when a request is written. It reads each request through an **allow-list** (`look` ∈ staging, production; `autoSignIn` a boolean; `reset` a short id): anything else is dropped and counted in the journal, never copied. A changed look or sign-in rewrites those two lines of the preview's `.env` and recreates `api` and `web`; a new reset id runs `seed-demo.js --reset` once. Within a few seconds; at the latest on the next `sync`.
- **Demo sign-in**: `POST /api/auth/demo-sign-in` signs in `usertest@finances.test` only when `DEMO_AUTO_SIGN_IN=true` **and** the database is the `_staging` one named by `DEMO_STAGING_DATABASE` (`apps/api/src/auth/demo-sign-in.ts`), otherwise 404. Only the preview override sets the variable, on by default. The sign-in page then signs in by itself, except right after « Se déconnecter » in the same tab (a « Compte démo » button then waits for a tap).

### Why a preview never uses production data

The « Production » setting is the **look** only. A preview runs a pull request's code before anyone has read it: its migrations would run on the real database (no undo), and any bug or bad line could read, change or send away the real finances. The previews also have the demo account's public password and an automatic sign-in. So nothing in the panel can name a database, a secret, an address or a variable outside the allow-list, and the preview stacks are not on the production database's network.

### What stays open (accepted for now)

- **Who reaches the panel**: anyone on the tailnet, like the previews and staging. The tailnet is the owner's devices only; an access gate (Tailscale identity headers or a sign-in) is out of scope of #608. With it someone on the tailnet can only switch a preview's look, its demo sign-in, or reset its demo data.
- **Anyone on the tailnet is signed in to a preview**: the demo account, demo data only, the same as typing its public password.
- **Pull request titles** are shown on the portal and the panel: the repository is public, they are not secret.
- **Login CSRF** is not a concern: the demo sign-in signs in the demo account only, on the preview's own origin.

## One-time setup (owner)

Reuses the `deploy` user and its GHCR login (steps 1 and 2 of the [deploy runbook](deploy.md#one-time-setup)). Nothing here needs a secret in GitHub.

- [ ] **Infra**: merge the infra pull request that adds the `capi-pr-*` route, then copy the Caddyfile and reload Caddy (infra repo, `docs/runbooks/caddy-portal.md`).
- [ ] **Directory** (as `ops`):

  ```bash
  sudo install -d -o deploy -g deploy -m 750 /srv/capi-previews
  ```

- [ ] **Tooling**: merge the pull request that adds previews; its staging deploy installs `preview.sh` and the compose files in `/srv/capi-previews` (or run Actions › Staging › Run workflow).
- [ ] **Timer** (as `ops`, from a checkout of main, or `git show origin/main:deploy/systemd/capi-previews.service` etc.):

  ```bash
  sudo cp deploy/systemd/capi-previews.service deploy/systemd/capi-previews.timer /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now capi-previews.timer
  ```

- [ ] **Check**: open a pull request that changes the app, wait for the comment, then `journalctl -u capi-previews -n 20` shows `pr-<n>: … is up`, and the address opens from the phone.
- [ ] **List and settings (#608)**: after merging #608 here and its infra pull request, run `deploy/setup-preview-panel.sh` from the Mac (it runs the steps below over `ssh ops@vps`): the `public` and `requests` directories, `panel.env` with `deploy`'s ids, the `capi-previews-apply.path` unit, then the Caddyfile and the portal's `services.yaml` from the infra repo, and reloads Caddy. By hand:

  ```bash
  sudo install -d -o deploy -g deploy -m 755 /srv/capi-previews/public
  sudo install -d -o deploy -g deploy -m 750 /srv/capi-previews/requests
  printf 'PANEL_UID=%s\nPANEL_GID=%s\n' "$(id -u deploy)" "$(id -g deploy)" | sudo -u deploy tee /srv/capi-previews/panel.env
  sudo cp deploy/systemd/capi-previews-apply.service deploy/systemd/capi-previews-apply.path /etc/systemd/system/
  sudo systemctl daemon-reload && sudo systemctl enable --now capi-previews-apply.path
  ```

## Operate

| What                  | How (on the server, as `deploy` unless noted)                                   |
| --------------------- | ------------------------------------------------------------------------------- |
| See what runs         | `ls /srv/capi-previews`, `docker ps --filter name=capi-pr-`                     |
| Logs of the runs      | `journalctl -u capi-previews -n 50` (as `ops`)                                  |
| Run now               | `sudo systemctl start capi-previews.service` (as `ops`)                         |
| Remove one            | `/srv/capi-previews/preview.sh remove <n>`                                      |
| Retry a failed commit | `rm /srv/capi-previews/pr-<n>/.failed`, then run now                            |
| Fresh demo data       | ↺ in the panel, or `preview.sh remove <n>`, then run now                        |
| Apply settings now    | `sudo systemctl start capi-previews-apply.service` (as `ops`)                   |
| Panel logs            | `docker logs capi-previews-panel-panel-1`                                       |
| Pause all previews    | `sudo systemctl disable --now capi-previews.timer` (as `ops`), then remove each |

Sizing: each preview is capped at 384 MB for `api` and for `web`, plus its Postgres; three previews fit next to production and staging on the 8 GB server. `MAX_PREVIEWS`, `MAX_AGE_DAYS` and `PREVIEW_MEM_LIMIT` can be set in the service (`Environment=`) if that changes.

## Tests

`deploy/test-preview.sh` runs `preview.sh` against a fake `docker` and a file of pull requests (no Docker, network or server), including the index, the `visuel` order and the settings allow-list; `node --test deploy/preview-panel/server.test.mjs` tests the panel (origin check, allow-list, escaping). The Deploy checks workflow runs both with shellcheck and actionlint. The demo sign-in's guard is `apps/api/src/auth/demo-sign-in.spec.ts`.
