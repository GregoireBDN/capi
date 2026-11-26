# Runbook — staging

Staging (#421) runs `main` between a merge and a release: every merge to `main` builds the images and deploys them to a second compose project on the server, with **demo data only**: seeded on an empty database, then kept between deploys and reset only on demand (#494). Production keeps its own flow (`vX.Y.Z` tags, owner approval, [deploy runbook](deploy.md)); the two share the server, Caddy and the GHCR images, nothing else.

## How it works

```text
merge to main
  └─ .github/workflows/staging.yml
       ├─ ci        the CI workflow (lint, types, tests, build), called as a reusable workflow
       ├─ images    build, Trivy, push ghcr.io/gregoirebdn/capi-{api,web,mcp}:sha-<short>
       └─ deploy    environment `staging` (no required reviewer)
            ├─ join the tailnet as an ephemeral `tag:ci` node
            ├─ upload deploy/deploy.sh, docker-compose.prod.yml and docker-compose.staging.yml
            │  of the commit to /srv/capi-staging/releases/sha-<short>/ (the last 10 kept)
            └─ ssh deploy@vps → deploy.sh --staging sha-<short> <compose file>
```

`deploy.sh --staging` runs the same steps as a production deploy (see the [deploy runbook](deploy.md#how-it-works): install the compose files, set `CAPI_VERSION`, pull, migrate, seed, `up -d`, health check through `web`, automatic rollback), with these differences:

- **Project and directory**: the compose project `capi-staging` (the override's `name:`, `finances-staging` before #464's step B; `deploy.sh` refuses a name that doesn't end in `-staging`), in `/srv/capi-staging` (`CAPI_DIR`, or `FINANCES_DIR` before #464), with `docker-compose.prod.yml` **and** the override [`docker-compose.staging.yml`](../../docker-compose.staging.yml). Its lock, `.env` and `deploy.log` are its own, so a staging deploy never waits for, nor touches, a production one.
- **Version**: an image tag `sha-<commit>` (7 to 40 lowercase hex characters); `vX.Y.Z` is refused, as production refuses `sha-…`.
- **Demo data** (#494): after the seed, `node dist/database/seed-demo.js --if-empty` fills an empty database with the demo data (first deploy, a volume emptied by hand) and leaves one that has data as it is, so what was entered or changed on staging, and the sessions, survive a deploy; the migrations still run on that data, which tests them on something other than a fresh database. `deploy.sh --staging --reset-demo` (Actions › Staging › Run workflow with **reset_demo** ticked) runs `seed-demo.js --reset` instead: every table wiped and the demo data seeded again. Both run in one transaction: if one fails, the previous data stays and the deploy rolls back. The demo seed refuses `NODE_ENV=production`, which the images set, except on the database the override names in `DEMO_STAGING_DATABASE` (`finances_staging`, a name ending in `_staging`); it refuses `finances` whatever that variable says (`apps/api/src/database/demo/guard.ts`).
- **Safety checks** before anything is pulled: the merged configuration must not give `web` production's `capi-web` or `finances-web` alias on the `proxy` network (Caddy would send production traffic to staging), and the remote MCP adapter must not be in the stack (`COMPOSE_PROFILES` empty).

What the override fixes, whatever `.env` says:

| Setting                                    | Staging                                                                  | Why                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Database                                   | `finances_staging`, volume `finances-staging_db_data` (`DB_VOLUME`)      | own data; the only name the demo seed may wipe in production images |
| `web` on `proxy`                           | aliases `capi-staging-web` and `finances-staging-web` only (`!override`) | Caddy's staging upstream, never production's                        |
| `SMTP_HOST`                                | empty                                                                    | no email                                                            |
| `REMOTE_MCP_ENABLED`                       | `false`                                                                  | no OAuth routes, no connector                                       |
| `PRICE_API_ENABLED`, `WALLET_SYNC_ENABLED` | `false`                                                                  | the demo's seeded prices; no outbound call                          |
| `APP_ENVIRONMENT` (`web`)                  | `staging`                                                                | yellow header, icons and manifest (#454), see below                 |

**Staging looks like staging** (#454): the same `web` image reads `APP_ENVIRONMENT=staging` at runtime (unset or anything else is production, which needs nothing), so on staging the header and the top of the phone's menu are yellow with a « Staging » label beside the blue wordmark, and the page links its own manifest (`/manifest-staging.json`: « Capi (staging) », short name « Capi β »), yellow icons (`/icons/staging/`), a yellow favicon and a yellow `theme-color`. A home-screen install of staging shows the yellow icon and its own name. iOS reads the icon when the app is added to the home screen: a staging install made before #454 keeps the old icon until it is removed and added again.

Staging and production share **no database, cookie origin or secret**: staging has its own volume and `POSTGRES_PASSWORD`, its own `JWT_SECRET` (a production session is never valid there), and its own host (`APP_URL`), so its `__Host-` session cookies and its passkeys belong to that host only. There is no backup of staging: a reset or `dcs down -v` loses whatever was entered there.

**A deploy keeps staging's data and sessions**; only a reset empties them (and signs everyone out). The demo account is `usertest@finances.test` / `usertest` (public: staging is reachable from the tailnet only); a password or email changed there stays changed until the next reset. The demo data ends 10 days before the day it was seeded and then ages like any data: reset to get recent months again.

## One-time setup (owner)

Nothing here is done by the workflow or an agent; nothing in the repo holds a secret. Steps 1 and 2 of the [deploy runbook](deploy.md#one-time-setup) (the `deploy` user, its GHCR login) and the Tailscale OAuth client of step 3 are reused as they are.

- [ ] **Server directory** (as `ops`):

  ```bash
  sudo install -d -o deploy -g deploy -m 750 /srv/capi-staging
  ```

- [ ] **Environment** (as `deploy`, `sudo -iu deploy`): copy [`.env.staging.example`](../../.env.staging.example) from the laptop (`git show origin/main:.env.staging.example`), then generate staging's **own** secrets on the server; never copy one from `/srv/capi/.env`:

  ```bash
  cd /srv/capi-staging
  install -m 600 /dev/null .env
  cat .env.staging.example > .env && rm .env.staging.example
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" .env
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
  ${EDITOR:-nano} .env                    # APP_URL = the staging host below
  ls -l .env                              # -rw------- deploy deploy
  ```

  `CAPI_VERSION` stays empty: the first deploy sets it. No copy in the password manager is needed (losing them only means wiping the volume: `docker volume rm finances-staging_db_data`).

- [ ] **Caddy** (`infra` repo): a site block for the staging host, e.g. `finances-staging.gbodin.cloud → capi-staging-web:3000`, like production's. The wildcard record `*.gbodin.cloud` and the wildcard certificate already cover it (ADR 0001 §3), so it is reachable from the tailnet only. Reload Caddy.
- [ ] **Memory**: staging adds an API, a web server and a Postgres to the server (`APP_MEM_LIMIT=384m` each for `api` and `web`). Check `free -h` leaves room for both stacks.
- [ ] **GitHub** › Settings › Environments › **New environment** `staging`:
  - **no** required reviewer, **Deployment branches**: the branch `main` only;
  - environment secrets `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET` (the same OAuth client as production's, or a second one with the same `tag:ci` tag), and `DEPLOY_SSH_KEY` only for the OpenSSH fallback;
  - optional variables: `STAGING_URL` if the host is not `https://finances-staging.gbodin.cloud`, `DEPLOY_HOST` if the server is not `vps`.
- [ ] **Tailscale**: nothing to change; `tag:ci` already reaches the server's SSH as `deploy` only.
- [ ] **First deploy**: Actions › **Staging** › **Run workflow** on `main` (or merge anything). Then, from the phone on the tailnet, open the staging host and sign in with the demo account. Installing it as a PWA beside production is fine: it is another origin.

## Operations

As `deploy` in `/srv/capi-staging`:

```bash
alias dcs='docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml'
dcs ps                                  # db, api, web healthy, PORTS empty
dcs logs -f --tail=200 api
tail -50 deploy.log
```

- **Redeploy** the latest `main`: Actions › Staging › Run workflow (`gh workflow run staging.yml`), data kept. An older commit: `/srv/capi-staging/releases/sha-<short>/deploy/deploy.sh --staging sha-<short> /srv/capi-staging/releases/sha-<short>/docker-compose.prod.yml` (the last 10 are kept), as long as its images are still in GHCR.
- **Reset the demo data**: Actions › Staging › Run workflow, **reset_demo** ticked (`gh workflow run staging.yml -f reset_demo=true`), which also redeploys the latest `main`; without a deploy: `dcs run --rm -T api node dist/database/seed-demo.js --reset`.
- **Start over**: `dcs down -v` (removes the staging volume only, the one `DB_VOLUME` names in staging's `.env`; never set it to production's `finances_db_data`), then redeploy.
- **Stop staging**: `dcs down`, and disable the workflow (Actions › Staging › ⋯ › Disable workflow) so merges don't start it again.

Merges in a row: the deploy job runs one at a time (`concurrency: deploy-staging`); of the merges waiting, only the latest is deployed. A failed staging deploy only fails its run: production is never touched.

## Troubleshooting

- **`the staging configuration keeps web's production alias`**: the server's Docker Compose is older than 2.24.4 and doesn't know `!override`; upgrade the compose plugin. Nothing was started.
- **`the remote MCP adapter never runs on staging`**: empty `COMPOSE_PROFILES` in `/srv/capi-staging/.env`.
- **`FAILED: demo data`**: `dcs run --rm -T api node dist/database/seed-demo.js --if-empty` (or `--reset` after a reset) shows the error; `Refusing to seed demo data …` means the override's database name or `DEMO_STAGING_DATABASE` was changed.
- **Caddy answers 502 on the staging host**: `dcs ps`; `docker network inspect proxy` should list `capi-staging-web`.
- Everything else is as in production: [production stack runbook § Troubleshooting](production-stack.md#troubleshooting), [deploy runbook § Troubleshooting](deploy.md#troubleshooting).
