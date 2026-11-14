# Runbook: Finances production stack

This runbook covers how Finances runs on the server: first install, environment, migrations and seed, the owner account, upgrades and logs. The design decisions are in [ADR 0001](../adr/0001-multi-app-hosting.md). Releases, the `deploy` user, GHCR access and rollbacks are covered in the [deploy runbook](deploy.md) (#31). Caddy, the portal, hardening and backups live in the `infra` repo.

## Overview

```text
phone / laptop ──tailnet──▶ Caddy (infra, 443 on the Tailscale IP, network `proxy`)
                              │  finances.gbodin.cloud → finances-web:3000
                              ▼
                 ┌──────── project `finances` (/srv/finances) ─────────┐
                 │ web  (proxy + default networks, alias finances-web) │
                 │  │  /api/* and SSR → http://api:4000                │
                 │ api  (default network only)                         │
                 │  │                                                  │
                 │ db   postgres:17-alpine, volume finances_db_data    │
                 └─────────────────────────────────────────────────────┘
```

- **No service publishes a port.** Only Caddy publishes 80/443, bound to the Tailscale IP. Never add `ports:` to this stack: Docker-published ports bypass `ufw`, and the API trusts `X-Forwarded-For` from private addresses (#49).
- **Images**: `ghcr.io/gregoirebdn/finances-api` and `finances-web`, tag pinned by `FINANCES_VERSION` in `.env` (`vX.Y.Z` or `sha-<shortsha>`).
- **Files on the server**: `/srv/finances/docker-compose.prod.yml` (copied from the release tag by each deploy) and `/srv/finances/.env`. Both are owned by `deploy`, and `.env` has mode `600`. Nothing else from the repo is needed there.
- **Restart policy**: every service is `restart: unless-stopped`. After a reboot, Docker starts the stack again on its own (Docker is enabled at boot and ordered after `tailscaled`, see the `infra` bootstrap). Containers stopped by hand stay stopped.
- **Container hardening** (#183): `api` and `web` run as the image's `node` user on a read-only root filesystem (only a 16 MB `/tmp` tmpfs is writable), with every Linux capability dropped, `no-new-privileges`, a memory limit (`APP_MEM_LIMIT`, default `512m`, no swap) and at most 256 processes. `db` keeps only the capabilities its entrypoint needs to fix the data directory's ownership and drop to `postgres`, with `no-new-privileges`. `dc run` (migrations, seed) gets the same settings as the service.
- **Health**: `GET /api/health` checks the database, and SMTP only when SMTP is configured (see [Email](#email-smtp)). The `api` and `web` containers have healthchecks. `web` checks the whole chain (web → API → database).

Every command below runs as `deploy` in `/srv/finances` (`sudo -iu deploy`, then `cd /srv/finances`). To keep commands short:

```bash
alias dc='docker compose -f docker-compose.prod.yml'
```

## Prerequisites

Before the first install, make sure of the following:

- Docker Engine and the compose plugin are installed, and the external network `proxy` exists (`docker network ls | grep proxy`). The `infra` bootstrap sets both up.
- The `deploy` user exists, owns `/srv/finances` and is logged in to GHCR with a `read:packages` token. See [deploy runbook § One-time setup](deploy.md#one-time-setup), steps 1 and 2.
- Caddy has the `finances.gbodin.cloud → finances-web:3000` site block (`infra` repo), and `*.gbodin.cloud` resolves to the server's Tailscale IP.
- At least one release exists in GHCR (`vX.Y.Z`, pushed by the release workflow).

## First install

### 1. Compose file

Copy `docker-compose.prod.yml` of the release you are about to run from your laptop. The repo is private, so it can't be fetched from the server.

```bash
# On the laptop, in the finances checkout
git fetch --tags
git show v1.0.0:docker-compose.prod.yml > /tmp/docker-compose.prod.yml
scp /tmp/docker-compose.prod.yml deploy@vps:/srv/finances/docker-compose.prod.yml
```

After that, each deploy installs the compose file of the deployed tag itself.

### 2. Environment

Start from [`.env.production.example`](../../.env.production.example), which documents every variable. Copy it to the server the same way (`git show v1.0.0:.env.production.example`), then:

```bash
cd /srv/finances
install -m 600 /dev/null .env          # create it private before writing secrets
cat .env.production.example > .env && rm .env.production.example
# Secrets: generated on the server, URL-safe (POSTGRES_PASSWORD goes into a URL)
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" .env
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s/^FINANCES_VERSION=.*/FINANCES_VERSION=v1.0.0/" .env
${EDITOR:-nano} .env                    # review APP_URL, SMTP_*, ...
ls -l .env                              # -rw------- deploy deploy
```

Copy `POSTGRES_PASSWORD` and `JWT_SECRET` into the password manager. The backups of the `.env` and the database are covered by #30.

Required values: `FINANCES_VERSION`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `JWT_SECRET` and `APP_URL` (`https://finances.gbodin.cloud`). `docker compose` refuses to run while any of them is empty. The API also refuses to start with a `JWT_SECRET` shorter than 32 characters (`openssl rand -hex 32` gives 64); if an older `.env` has a shorter one, replace it before deploying (everyone is signed out). Validate the file without printing the secrets:

```bash
dc config -q && echo OK
```

### 3. Pull, migrate, seed, start

```bash
dc pull
dc run --rm api node dist/database/migrate.js   # starts db, applies the Drizzle migrations
dc run --rm api node dist/database/seed.js      # default categories; idempotent
dc up -d
dc ps                                           # all services healthy, PORTS column empty
```

`migrate.js` uses Drizzle's runtime migrator on the migrations shipped in the API image (`/app/drizzle`), with the same journal as `pnpm db:migrate`. Both scripts can be run again at any time: they only apply what is missing.

### 4. Check

```bash
# Health through the whole chain, from inside the web container
dc exec -T web node -e "fetch('http://localhost:3000/api/health').then(async r=>{console.log(r.status, await r.text())})"
# No published port (expect no output)
docker ps --filter label=com.docker.compose.project=finances --format '{{.Names}} {{.Ports}}' | grep -- '->'
```

From a device on the tailnet, open `https://finances.gbodin.cloud/api/health`. It should return `200` with `"status":"ok"`.

### 5. Create the owner account

Open `https://finances.gbodin.cloud` and sign up. Registration is open only while no user exists. Once the owner account is created, `POST /api/auth/register` returns 403 and the sign-up form is hidden. Do this right after the first start: until then, anyone on the tailnet could take the account.

The session cookies are `Secure` (the API sets them with `secure: true` when `NODE_ENV=production`, which the image sets) and `httpOnly`, so they only travel over HTTPS. In the browser's dev tools, the `token` and `refresh_token` cookies of `finances.gbodin.cloud` should show `Secure` and `HttpOnly`.

If SMTP is not configured, the verification email is skipped (a warning is logged) and the account still works.

## Upgrades

Normally a release does everything: push a `vX.Y.Z` tag. The [deploy runbook](deploy.md) covers that flow and rollbacks. `deploy.sh` runs the same steps as below and rolls back if the health check fails.

To upgrade by hand (e.g. the pipeline is unavailable):

```bash
cd /srv/finances
# 1. New compose file of the tag (from the laptop, as in First install § 1), if it changed
# 2. New variables from .env.production.example of the tag, if any
sed -i 's/^FINANCES_VERSION=.*/FINANCES_VERSION=v1.1.0/' .env
dc pull api web
dc run --rm api node dist/database/migrate.js
dc run --rm api node dist/database/seed.js
dc up -d --remove-orphans
dc ps
```

The database is migrated forward only. Going back to an older image runs it against the newer schema (see [deploy runbook § Rolling back](deploy.md#rolling-back)). To upgrade Postgres to a new major version, dump and restore the database (backups runbook, `infra`). Never just change the image tag: the data directory format differs between majors.

## Logs and operations

```bash
dc ps                          # state and health
dc logs -f --tail=200 api      # JSON lines (pino); reqId correlates a request
dc logs -f --tail=200 web
dc logs --since=1h db
dc restart api                 # restart one service
dc up -d                       # recreate what changed in .env / the compose file
dc exec db psql -U "$(grep ^POSTGRES_USER= .env | cut -d= -f2)" finances   # SQL shell
```

- Logs are rotated by Docker (`json-file`, 5 × 10 MB per container).
- The API logs no transaction labels, amounts or balances. It does log client IPs (as seen through Caddy, #49) and request paths. Still, never paste logs anywhere public.
- `.env` changes take effect on `dc up -d` (the containers are recreated). A `restart` alone keeps the old environment.

## Email (SMTP)

SMTP is optional in production:

- **Not configured** (`SMTP_HOST` empty): no email is sent. Sign-up skips the verification email, and "forgot password" sends nothing, so the password can't be reset by email. `/api/health` doesn't check SMTP, so an absent mail server never marks the stack unhealthy or rolls a deploy back.
- **Configured**: `/api/health` checks the SMTP connection. While the SMTP server is unreachable, the API is reported unhealthy, and a deploy during that time is rolled back by `deploy.sh`. Use a reliable provider, or leave SMTP off.

`EMAIL_FROM` must be an address the SMTP provider accepts. Links in emails use `APP_URL`.

## Wallet sync (crypto)

Wallet crypto accounts can be read on chain from their public keys (#129). It is **off by default** (`WALLET_SYNC_ENABLED=false`): nothing is sent, wallet accounts are filled by hand. Read [ADR 0002](../adr/0002-wallet-sync-privacy.md) before turning it on: the chain endpoints then receive the wallet's addresses and can link them to the server's IP.

| What is sent                                                                 | To                                                   | Setting                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------- |
| Bitcoin addresses derived on the server (never the xpub), one per request    | Esplora, `mempool.space/api` by default              | `ESPLORA_URL`                           |
| EVM address + token contracts (`eth_chainId`, `eth_getBalance`, `balanceOf`) | publicnode.com JSON-RPC per chain by default         | `EVM_RPC_URLS` (JSON keyed by chain id) |
| Token asset ids (contracts and decimals lookup, cached 24 h)                 | CoinGecko (only when `PRICE_API_ENABLED` is also on) | `PRICE_API_URL`                         |

- **Turn on**: set `WALLET_SYNC_ENABLED=true` in `.env`, then `dc up -d api`. Each wallet is synced before a valuation at most every `WALLET_SYNC_INTERVAL_SECONDS` (600) and with "Synchroniser" on its account page (at most every 30 s).
- **Self-hosted endpoints**: `ESPLORA_URL=https://my-esplora/api`, `EVM_RPC_URLS={"1":"https://my-node/rpc","56":""}` (`""` turns a chain off; ids: 1 Ethereum, 42161 Arbitrum, 8453 Base, 10 Optimism, 137 Polygon, 56 BNB Chain). The API refuses to boot on an unknown chain id or a non-http(s) URL.
- **Failures**: a timeout (`WALLET_SYNC_TIMEOUT_MS`, default 10 s), a rate limit or a wrong chain id keeps the last synced holdings, shown as stale on the account page. Logs say `Wallet sync failed (<reason>)` (`timeout`, `network`, `rate_limited`, `http`, `malformed`, `rpc`, `wrong_chain`, `tokens`) and never contain addresses or URLs.
- **Turn off**: `WALLET_SYNC_ENABLED=false` and `dc up -d api`. Synced lines stay as they are (shown as last synced); add manual lines to keep the accounts up to date.

## Client IPs and trusted proxies

Caddy sets `X-Forwarded-For`. `web` believes it only from Caddy and forwards a clean header to `api`, which believes it only from `web` (#49):

- **`web`** (`WEB_TRUSTED_PROXIES`, default `caddy`): Caddy's service name on the shared `proxy` network (`caddy` in the infra repo's `caddy/compose.yml`). `web` resolves it through Docker's DNS at start-up and every 30 s, so a restarted Caddy with a new IP is followed within 30 s. Any other container on `proxy` (the portal, another app) that calls `finances-web:3000` gets its own address as client IP, whatever header it sends (#183). While the name doesn't resolve (Caddy renamed or off `proxy`), `web` trusts nobody: the site still works, but every request counts against the address it comes from (Caddy's) for rate limits, and the `web` logs say `Trusted proxy "caddy" does not resolve` once.
- **`api`** (`TRUSTED_PROXIES`, default `loopback,uniquelocal`): `web` on the project network, which only `web` and `db` join.

Check what `web` resolves: `dc exec -T web node -e "require('dns').promises.lookup('caddy',{all:true}).then(r=>console.log(r))"` (it should be Caddy's address in `docker network inspect proxy`).

If Caddy's service is renamed, set `WEB_TRUSTED_PROXIES=<new name>` in `.env`, then `dc up -d web`. To fall back to the behaviour before #183 (trust every private address, so neighbours on `proxy` can choose their client IP), set `WEB_TRUSTED_PROXIES=uniquelocal`. Residual risk: a container given the network alias `caddy` on `proxy` would be trusted too, which takes access to the Docker daemon or a change to an app's compose file.

## Running the production stack locally

To check the images and the compose file on a laptop, use a throwaway project name: the dev stack (`docker-compose.yml`) is also called `finances`, and the prod file would otherwise take over its containers. Also create the `proxy` network if it doesn't exist.

```bash
docker network create proxy                       # only if missing; remove it afterwards
cat > /tmp/finances-local.env <<EOF
FINANCES_VERSION=local
POSTGRES_USER=finances
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
APP_URL=https://finances.example.test
EOF
c="docker compose -p finances-local --env-file /tmp/finances-local.env -f docker-compose.prod.yml -f docker-compose.build.yml"
$c build
$c run --rm api node dist/database/migrate.js
$c run --rm api node dist/database/seed.js
$c up -d && $c ps
$c exec -T web node -e "fetch('http://localhost:3000/api/health').then(async r=>console.log(r.status, await r.text()))"
$c down -v                                         # removes the throwaway volume too
```

`docker-compose.build.yml` builds both images from the checkout (monorepo root as context) and tags them like the GHCR images, with `FINANCES_VERSION`.

## Troubleshooting

| Symptom                                             | Check                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `required variable … is missing a value`            | `.env` is incomplete, or the command didn't run from `/srv/finances`.                                                           |
| `network proxy declared as external, but not found` | The `infra` bootstrap hasn't created it: `docker network create proxy`.                                                         |
| `pull access denied` / `unauthorized`               | GHCR login of `deploy` missing or expired ([deploy runbook](deploy.md)).                                                        |
| `api` unhealthy                                     | `dc logs api`. Most often the database isn't ready or migrated, or SMTP is configured but unreachable.                          |
| Caddy answers 502                                   | `web` isn't running or healthy (`dc ps`), or isn't on `proxy` (`docker network inspect proxy` should list `finances-web`).      |
| Signed out on every request                         | `APP_URL` isn't the HTTPS origin, or the site is opened over plain HTTP (the cookies are `Secure`).                             |
| Passkey sign-in or creation fails at once           | The page origin isn't `APP_URL` (or `WEBAUTHN_ORIGIN`), or `WEBAUTHN_RP_ID` doesn't match it. The password always works.        |
| `api` or `web` restarts with exit code 137          | Out of memory (`docker inspect <container> --format '{{.State.OOMKilled}}'`): raise `APP_MEM_LIMIT` in `.env`, then `dc up -d`. |
| `EROFS: read-only file system`                      | Something tries to write outside `/tmp` (the root filesystem is read-only, #183): fix the code, never drop `read_only`.         |
| `password authentication failed`                    | `POSTGRES_PASSWORD` changed after the volume was created. Put the old one back, or `ALTER USER` inside `db`.                    |
