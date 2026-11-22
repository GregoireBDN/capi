# Runbook — staging

Staging (#421) runs `main` between a merge and a release: every merge to `main` builds the images and deploys them to a second compose project on the server, with **demo data only**, reset on each deploy. Production keeps its own flow (`vX.Y.Z` tags, owner approval, [deploy runbook](deploy.md)); the two share the server, Caddy and the GHCR images, nothing else.

## How it works

```text
merge to main
  └─ .github/workflows/staging.yml
       ├─ ci        the CI workflow (lint, types, tests, build), called as a reusable workflow
       ├─ images    build, Trivy, push ghcr.io/gregoirebdn/finances-{api,web,mcp}:sha-<short>
       └─ deploy    environment `staging` (no required reviewer)
            ├─ join the tailnet as an ephemeral `tag:ci` node
            ├─ upload deploy/deploy.sh, docker-compose.prod.yml and docker-compose.staging.yml
            │  of the commit to /srv/finances-staging/releases/sha-<short>/ (the last 10 kept)
            └─ ssh deploy@vps → deploy.sh --staging sha-<short> <compose file>
```

`deploy.sh --staging` runs the same steps as a production deploy (see the [deploy runbook](deploy.md#how-it-works): install the compose files, set `FINANCES_VERSION`, pull, migrate, seed, `up -d`, health check through `web`, automatic rollback), with these differences:

- **Project and directory**: always the compose project `finances-staging` (`-p`), in `/srv/finances-staging` (`FINANCES_DIR`), with `docker-compose.prod.yml` **and** the override [`docker-compose.staging.yml`](../../docker-compose.staging.yml). Its lock, `.env` and `deploy.log` are its own, so a staging deploy never waits for, nor touches, a production one.
- **Version**: an image tag `sha-<commit>` (7 to 40 lowercase hex characters); `vX.Y.Z` is refused, as production refuses `sha-…`.
- **Demo data**: after the seed, `node dist/database/seed-demo.js --reset` wipes every table and seeds the demo data again (one transaction: if it fails, the previous data stays and the deploy rolls back). The demo seed refuses `NODE_ENV=production`, which the images set, except on the database the override names in `DEMO_STAGING_DATABASE` (`finances_staging`, a name ending in `_staging`); it refuses `finances` whatever that variable says (`apps/api/src/database/demo/guard.ts`).
- **Safety checks** before anything is pulled: the merged configuration must not give `web` production's `finances-web` alias on the `proxy` network (Caddy would send production traffic to staging), and the remote MCP adapter must not be in the stack (`COMPOSE_PROFILES` empty).

What the override fixes, whatever `.env` says:

| Setting                                    | Staging                                               | Why                                                                 |
| ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Database                                   | `finances_staging`, volume `finances-staging_db_data` | own data; the only name the demo seed may wipe in production images |
| `web` on `proxy`                           | alias `finances-staging-web` only (`!override`)       | Caddy's staging upstream, never production's                        |
| `SMTP_HOST`                                | empty                                                 | no email                                                            |
| `REMOTE_MCP_ENABLED`                       | `false`                                               | no OAuth routes, no connector                                       |
| `PRICE_API_ENABLED`, `WALLET_SYNC_ENABLED` | `false`                                               | the demo's seeded prices; no outbound call                          |
| `APP_ENVIRONMENT` (`web`)                  | `staging`                                             | yellow header, icons and manifest (#454), see below                 |

**Staging looks like staging** (#454): the same `web` image reads `APP_ENVIRONMENT=staging` at runtime (unset or anything else is production, which needs nothing), so on staging the header and the top of the phone's menu are yellow with a « Staging » label (on phones the label takes the place of the word « Finances »), and the page links its own manifest (`/manifest-staging.json`: « Finances (staging) », short name « Finances β »), yellow icons (`/icons/staging/`), a yellow favicon and a yellow `theme-color`. A home-screen install of staging shows the yellow icon and its own name. iOS reads the icon when the app is added to the home screen: a staging install made before #454 keeps the old icon until it is removed and added again.

Staging and production share **no database, cookie origin or secret**: staging has its own volume and `POSTGRES_PASSWORD`, its own `JWT_SECRET` (a production session is never valid there), and its own host (`APP_URL`), so its `__Host-` session cookies and its passkeys belong to that host only. There is no backup of staging: everything in it is rebuilt by the next deploy.

**Every deploy signs everyone out of staging** (the reset empties the sessions too) and drops whatever was changed by hand there. Sign in again with the demo account: `usertest@finances.test` / `usertest` (public: staging is reachable from the tailnet only).

## One-time setup (owner)

Nothing here is done by the workflow or an agent; nothing in the repo holds a secret. Steps 1 and 2 of the [deploy runbook](deploy.md#one-time-setup) (the `deploy` user, its GHCR login) and the Tailscale OAuth client of step 3 are reused as they are.

- [ ] **Server directory** (as `ops`):

  ```bash
  sudo install -d -o deploy -g deploy -m 750 /srv/finances-staging
  ```

- [ ] **Environment** (as `deploy`, `sudo -iu deploy`): copy [`.env.staging.example`](../../.env.staging.example) from the laptop (`git show origin/main:.env.staging.example`), then generate staging's **own** secrets on the server; never copy one from `/srv/finances/.env`:

  ```bash
  cd /srv/finances-staging
  install -m 600 /dev/null .env
  cat .env.staging.example > .env && rm .env.staging.example
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" .env
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
  ${EDITOR:-nano} .env                    # APP_URL = the staging host below
  ls -l .env                              # -rw------- deploy deploy
  ```

  `FINANCES_VERSION` stays empty: the first deploy sets it. No copy in the password manager is needed (losing them only means wiping the volume: `docker volume rm finances-staging_db_data`).

- [ ] **Caddy** (`infra` repo): a site block for the staging host, e.g. `finances-staging.gbodin.cloud → finances-staging-web:3000`, like production's. The wildcard record `*.gbodin.cloud` and the wildcard certificate already cover it (ADR 0001 §3), so it is reachable from the tailnet only. Reload Caddy.
- [ ] **Memory**: staging adds an API, a web server and a Postgres to the server (`APP_MEM_LIMIT=384m` each for `api` and `web`). Check `free -h` leaves room for both stacks.
- [ ] **GitHub** › Settings › Environments › **New environment** `staging`:
  - **no** required reviewer, **Deployment branches**: the branch `main` only;
  - environment secrets `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET` (the same OAuth client as production's, or a second one with the same `tag:ci` tag), and `DEPLOY_SSH_KEY` only for the OpenSSH fallback;
  - optional variables: `STAGING_URL` if the host is not `https://finances-staging.gbodin.cloud`, `DEPLOY_HOST` if the server is not `vps`.
- [ ] **Tailscale**: nothing to change; `tag:ci` already reaches the server's SSH as `deploy` only.
- [ ] **First deploy**: Actions › **Staging** › **Run workflow** on `main` (or merge anything). Then, from the phone on the tailnet, open the staging host and sign in with the demo account. Installing it as a PWA beside production is fine: it is another origin.

## Operations

As `deploy` in `/srv/finances-staging`:

```bash
alias dcs='docker compose -p finances-staging -f docker-compose.prod.yml -f docker-compose.staging.yml'
dcs ps                                  # db, api, web healthy, PORTS empty
dcs logs -f --tail=200 api
tail -50 deploy.log
```

- **Redeploy** the latest `main`: Actions › Staging › Run workflow (`gh workflow run staging.yml`). An older commit: `/srv/finances-staging/releases/sha-<short>/deploy/deploy.sh --staging sha-<short> /srv/finances-staging/releases/sha-<short>/docker-compose.prod.yml` (the last 10 are kept), as long as its images are still in GHCR.
- **Reset the demo data without a deploy**: `dcs run --rm -T api node dist/database/seed-demo.js --reset`.
- **Start over**: `dcs down -v` (removes the staging volume only; the project name keeps production's `finances_db_data` out of reach), then redeploy.
- **Stop staging**: `dcs down`, and disable the workflow (Actions › Staging › ⋯ › Disable workflow) so merges don't start it again.

Merges in a row: the deploy job runs one at a time (`concurrency: deploy-staging`); of the merges waiting, only the latest is deployed. A failed staging deploy only fails its run: production is never touched.

## Troubleshooting

- **`the staging configuration keeps web's production alias`**: the server's Docker Compose is older than 2.24.4 and doesn't know `!override`; upgrade the compose plugin. Nothing was started.
- **`the remote MCP adapter never runs on staging`**: empty `COMPOSE_PROFILES` in `/srv/finances-staging/.env`.
- **`FAILED: demo data`**: `dcs run --rm -T api node dist/database/seed-demo.js --reset` shows the error; `Refusing to seed demo data …` means the override's database name or `DEMO_STAGING_DATABASE` was changed.
- **Caddy answers 502 on the staging host**: `dcs ps`; `docker network inspect proxy` should list `finances-staging-web`.
- Everything else is as in production: [production stack runbook § Troubleshooting](production-stack.md#troubleshooting), [deploy runbook § Troubleshooting](deploy.md#troubleshooting).
