# Runbook: Capi production stack

This runbook covers how Capi runs on the server: first install, environment, migrations and seed, the owner account, upgrades and logs. The design decisions are in [ADR 0001](../adr/0001-multi-app-hosting.md). Releases, the `deploy` user, GHCR access and rollbacks are covered in the [deploy runbook](deploy.md) (#31). Caddy, the portal, hardening and backups live in the `infra` repo.

## Overview

```text
phone / laptop ──tailnet──▶ Caddy (infra, 443 on the Tailscale IP, network `proxy`)
                              │  finances.gbodin.cloud → capi-web:3000 (or finances-web)
                              ▼
                 ┌──────── project `capi` (/srv/capi) ─────────────┐
                 │ web  (proxy + default networks, alias capi-web) │
                 │  │  /api/* and SSR → http://api:4000                │
                 │ api  (default network only)                         │
                 │  │                                                  │
                 │ db   postgres:17-alpine, volume finances_db_data    │
                 │ capi-mcp (profile remote-mcp, proxy + default)  │
                 │  │  → http://api:4000 with the connector's token    │
                 └─────────────────────────────────────────────────────┘
Claude's servers ──internet──▶ Caddy, public host finances-mcp.<domain>
                              (seven paths only) → capi-mcp:4100
```

- **No service publishes a port.** Only Caddy publishes 80/443, bound to the Tailscale IP. Never add `ports:` to this stack: Docker-published ports bypass `ufw`, and the API trusts `X-Forwarded-For` from private addresses (#49).
- **Images**: `ghcr.io/gregoirebdn/capi-api`, `capi-web` and `capi-mcp`, tag pinned by `CAPI_VERSION` in `.env` (`vX.Y.Z` or `sha-<shortsha>`).
- **Remote MCP adapter** (`capi-mcp`, #78, #328): only started with `COMPOSE_PROFILES=remote-mcp` in `.env`, and refuses to start unless `REMOTE_MCP_ENABLED=true`. It is the only part of the app on a public host; enabling, checks and the kill switch are in the [remote MCP runbook](remote-mcp.md).
- **Files on the server**: `/srv/capi/docker-compose.prod.yml` (copied from the release tag by each deploy) and `/srv/capi/.env`. Both are owned by `deploy`, and `.env` has mode `600`. Nothing else from the repo is needed there.
- **Restart policy**: every service is `restart: unless-stopped`. After a reboot, Docker starts the stack again on its own (Docker is enabled at boot and ordered after `tailscaled`, see the `infra` bootstrap). Containers stopped by hand stay stopped.
- **Container hardening** (#183): `api`, `web` and `capi-mcp` run as the image's `node` user on a read-only root filesystem (only a 16 MB `/tmp` tmpfs is writable), with every Linux capability dropped, `no-new-privileges`, a memory limit (`APP_MEM_LIMIT`, default `512m`, no swap; `capi-mcp`: `MCP_MEM_LIMIT`, default `256m`) and at most 256 processes (`capi-mcp`: 128). `db` keeps only the capabilities its entrypoint needs to fix the data directory's ownership and drop to `postgres`, with `no-new-privileges`. `dc run` (migrations, seed) gets the same settings as the service.
- **Health**: `GET /api/health` checks the database, and SMTP only when SMTP is configured (see [Email](#email-smtp)). The `api` and `web` containers have healthchecks. `web` checks the whole chain (web → API → database). `capi-mcp` checks that its port accepts connections (no request, no log line).

Every command below runs as `deploy` in `/srv/capi` (`sudo -iu deploy`, then `cd /srv/capi`). To keep commands short:

```bash
alias dc='docker compose -f docker-compose.prod.yml'
```

## Prerequisites

Before the first install, make sure of the following:

- Docker Engine and the compose plugin are installed, and the external network `proxy` exists (`docker network ls | grep proxy`). The `infra` bootstrap sets both up.
- The `deploy` user exists, owns `/srv/capi` and is logged in to GHCR with a `read:packages` token. See [deploy runbook § One-time setup](deploy.md#one-time-setup), steps 1 and 2.
- Caddy has the `finances.gbodin.cloud → capi-web:3000` site block (`infra` repo; `web` also answers to `finances-web` until #464's step B, [rename runbook](rename.md)), and `*.gbodin.cloud` resolves to the server's Tailscale IP.
- At least one release exists in GHCR (`vX.Y.Z`, pushed by the release workflow).

## First install

### 1. Compose file

Copy `docker-compose.prod.yml` of the release you are about to run from your laptop. The repo is private, so it can't be fetched from the server.

```bash
# On the laptop, in the finances checkout
git fetch --tags
git show v1.0.0:docker-compose.prod.yml > /tmp/docker-compose.prod.yml
scp /tmp/docker-compose.prod.yml deploy@vps:/srv/capi/docker-compose.prod.yml
```

After that, each deploy installs the compose file of the deployed tag itself.

### 2. Environment

Start from [`.env.production.example`](../../.env.production.example), which documents every variable. Copy it to the server the same way (`git show v1.0.0:.env.production.example`), then:

```bash
cd /srv/capi
install -m 600 /dev/null .env          # create it private before writing secrets
cat .env.production.example > .env && rm .env.production.example
# Secrets: generated on the server, URL-safe (POSTGRES_PASSWORD goes into a URL)
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" .env
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s/^CAPI_VERSION=.*/CAPI_VERSION=v1.0.0/" .env
${EDITOR:-nano} .env                    # review APP_URL, SMTP_*, ...
ls -l .env                              # -rw------- deploy deploy
```

Copy `POSTGRES_PASSWORD` and `JWT_SECRET` into the password manager. The backups of the `.env` and the database are covered by #30.

Required values: `CAPI_VERSION`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `JWT_SECRET` and `APP_URL` (`https://finances.gbodin.cloud`). `docker compose` refuses to run while any of them is empty. The API also refuses to start with a `JWT_SECRET` shorter than 32 characters (`openssl rand -hex 32` gives 64); if an older `.env` has a shorter one, replace it before deploying (everyone is signed out). Validate the file without printing the secrets:

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
cd /srv/capi
# 1. New compose file of the tag (from the laptop, as in First install § 1), if it changed
# 2. New variables from .env.production.example of the tag, if any
sed -i 's/^CAPI_VERSION=.*/CAPI_VERSION=v1.1.0/' .env
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
- The API logs no transaction labels, amounts or balances. It does log client IPs (the device's Tailscale address as seen by Caddy, #49, #251) and request paths. Still, never paste logs anywhere public.
- `.env` changes take effect on `dc up -d` (the containers are recreated). A `restart` alone keeps the old environment.

## Email (SMTP)

SMTP is optional in production:

- **Not configured** (`SMTP_HOST` empty): no email is sent. Sign-up skips the verification email, and "forgot password" sends nothing, so the password can't be reset by email. `/api/health` doesn't check SMTP, so an absent mail server never marks the stack unhealthy or rolls a deploy back.
- **Configured**: `/api/health` checks the SMTP connection. While the SMTP server is unreachable, the API is reported unhealthy, and a deploy during that time is rolled back by `deploy.sh`. Use a reliable provider, or leave SMTP off.

`EMAIL_FROM` must be an address the SMTP provider accepts. Links in emails use `APP_URL`.

## Wallet sync (crypto)

Wallet crypto accounts can be read on chain from their public keys (#129). It is **off by default** (`WALLET_SYNC_ENABLED=false`): nothing is sent, wallet accounts are filled by hand. Read [ADR 0002](../adr/0002-wallet-sync-privacy.md) before turning it on: the chain endpoints then receive the wallet's addresses and can link them to the server's IP.

| What is sent                                                                                           | To                                                   | Setting                                 |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------- |
| Bitcoin addresses derived on the server (never the xpub) or saved as single addresses, one per request | Esplora, `mempool.space/api` by default              | `ESPLORA_URL`                           |
| EVM address + token contracts (`eth_chainId`, `eth_getBalance`, `balanceOf`)                           | publicnode.com JSON-RPC per chain by default         | `EVM_RPC_URLS` (JSON keyed by chain id) |
| Token asset ids (contracts and decimals lookup, cached 24 h)                                           | CoinGecko (only when `PRICE_API_ENABLED` is also on) | `PRICE_API_URL`                         |

- **While it is off**, setting up a wallet from `/crypto` or the accounts page says so before the account is created; the account keeps its keys and stays empty until sync is turned on (or holdings are typed on its page).
- **Turn on**: set `WALLET_SYNC_ENABLED=true` in `.env`, then `dc up -d api`. Each wallet is synced before a valuation at most every `WALLET_SYNC_INTERVAL_SECONDS` (600) and with "Synchroniser" on its account page (at most every 30 s).
- **Self-hosted endpoints**: `ESPLORA_URL=https://my-esplora/api`, `EVM_RPC_URLS={"1":"https://my-node/rpc","56":""}` (`""` turns a chain off; ids: 1 Ethereum, 42161 Arbitrum, 8453 Base, 10 Optimism, 137 Polygon, 56 BNB Chain). The API refuses to boot on an unknown chain id or a non-http(s) URL.
- **Failures**: each chain is read on its own. A chain that fails (a timeout, `WALLET_SYNC_TIMEOUT_MS`, default 10 s; a rate limit; a wrong chain id) keeps its last synced holdings while the other chains are updated; the account page names it (« Certaines chaînes n’ont pas pu être lues », with the reason and the retry time). Logs say `Wallet sync failed on <chain> (<reason>)` (chain: `bitcoin`, `ethereum`, `arbitrum`, `base`, `optimism`, `polygon`, `bsc`; reason: `timeout`, `network`, `rate_limited`, `http`, `malformed`, `rpc`, `wrong_chain`, `tokens`, `unexpected`) and never contain addresses or URLs; failed chains are kept in memory, so after a restart the page only says the last sync failed until the next one.
- **Rate limits (HTTP 429)** (#250): the public endpoints throttle bursts, and a first sync is one (an extended key asks 40 Bitcoin addresses or more, one request each; every EVM chain a batch or two). Esplora requests are paced (one per second, `ESPLORA_MIN_INTERVAL_MS`, 1000; lower it for a self-hosted Esplora) and a `Retry-After` up to 60 s is waited out once per sync, pausing the scan (`Wallet sync paused on bitcoin: rate limited, resuming in … s`). Bitcoin scans are **resumable** (#268): every address read is kept in the database (`crypto_bitcoin_scans`, `crypto_bitcoin_scan_addresses`: branch, index, used, balance; never the address), so a scan cut short resumes where it stopped (`Wallet sync kept N Bitcoin address(es) read before failing; the next attempt resumes there`), and a re-sync reads only the used addresses and the 20 after the last used one per branch. Page loads reuse a key's scan completed less than `WALLET_SYNC_INTERVAL_SECONDS` ago (no Bitcoin request) and wait 5 s at most for a sync, which then goes on in the background; "Synchroniser" scans at once and waits for it (about a minute for a key: ~45 requests at one per second). Otherwise the endpoint is **backed off**, per chain and in memory: the larger of its `Retry-After` and 1 min doubled on each rate limit in a row, at most 1 h. During the backoff the chain is not asked at all, neither by page loads nor by "Synchroniser" (which shows « Prochain essai possible à … »); logs say `Wallet sync failed on bitcoin (rate_limited), next attempt in 120 s`, then `Wallet sync skipped bitcoin: rate limited, next attempt in … s`. A first sync rate limited often recovers by itself at the next attempt. If a chain stays rate limited (shared egress IP, many keys):
  - **Bitcoin**: point `ESPLORA_URL` at another Esplora (`https://blockstream.info/api`) or, better for privacy, your own (mempool or electrs + esplora on your node, `ESPLORA_URL=http://my-node:3006/api`), then `dc up -d api`.
  - **EVM**: point the chain at another key-less RPC or your own node through `EVM_RPC_URLS` (e.g. `{"137":"https://polygon-rpc.example/"}`), or turn an unused chain off with `""`, and `dc up -d api` (a restart also clears the backoff).
  - **Tokens** (`tokens`): the CoinGecko contracts lookup failed; it is cached 24 h once it succeeds, so it only matters for newly added tokens.
- **An xpub that finds 0 BTC**: its key lists « 0 adresse utilisée » for its type (`scans` of `GET /api/accounts/:id/wallet-keys`): Ledger Live exports `xpub` for every account type, so pick the right one (« Changer »; Native SegWit `bc1q…` for most accounts) or « Détecter ».
- **A wallet created as "Saisie manuelle"** (before #207, the Crypto page set up wallets as manual accounts): on its page, « Relier à un wallet ou une plateforme » turns it into a wallet with its public keys (remove any hand-typed holding first). 0 € values it recorded while empty are dropped.
- **Turn off**: `WALLET_SYNC_ENABLED=false` and `dc up -d api`. Synced lines stay as they are (shown as last synced); add manual lines to keep the accounts up to date.

## Client IPs and trusted proxies

Caddy sets `X-Forwarded-For`. `web` believes it only from Caddy and forwards a clean header to `api`, which believes it only from `web` (#49):

- **Caddy** (infra repo) must see the device itself: its `100.x` Tailscale IPv4 or its `fd7a:115c:a1e0::…` Tailscale IPv6 (both are published, with `A` and `AAAA` records). That needs the shared `proxy` network to be **dual-stack**: on an IPv4-only `proxy`, Docker relays the IPv6 connections through `docker-proxy` from the bridge gateway, so every device on IPv6 arrives as `172.18.0.1` and shares one rate-limit bucket (#251; the sign-in throttle of one device locks out the others). The infra repo's `bootstrap.sh` creates `proxy` with `--ipv6`, and `scripts/proxy-network-ipv6.sh` converts an existing one (infra runbook `caddy-portal.md`, Client IP). A device that uses both families counts as two clients, one per address.
- **`web`** (`WEB_TRUSTED_PROXIES`, default `caddy`): Caddy's service name on the shared `proxy` network (`caddy` in the infra repo's `caddy/compose.yml`). `web` resolves it through Docker's DNS at start-up and every 30 s, so a restarted Caddy with a new IP is followed within 30 s. Any other container on `proxy` (the portal, another app) that calls `capi-web:3000` gets its own address as client IP, whatever header it sends (#183). While the name doesn't resolve (Caddy renamed or off `proxy`), `web` trusts nobody: the site still works, but every request counts against the address it comes from (Caddy's) for rate limits, and the `web` logs say `Trusted proxy "caddy" does not resolve` once.
- **`api`** (`TRUSTED_PROXIES`, default `loopback,uniquelocal`): `web` on the project network, and `capi-mcp` when it runs, which forwards the client IP it believes.
- **`capi-mcp`** (`MCP_TRUSTED_PROXIES`, default `caddy`, #328): like `web`, Caddy's service name resolved every 30 s; its per-IP limit and the API's limits on the OAuth routes then apply to the real caller (Anthropic's servers). While the name doesn't resolve it trusts nobody and logs `trusted proxy "caddy" does not resolve` once.

Check what `web` resolves: `dc exec -T web node -e "require('dns').promises.lookup('caddy',{all:true}).then(r=>console.log(r))"` (it should be Caddy's addresses in `docker network inspect proxy`: an IPv4 and, on the dual-stack network, an IPv6).

**End-to-end check** (after a change to Caddy, the `proxy` network or `TRUSTED_PROXIES`): from a device on the tailnet, call the site over each family, then read the client IPs the API logged.

```bash
curl -4 -s -o /dev/null https://finances.gbodin.cloud/api/health
curl -6 -s -o /dev/null https://finances.gbodin.cloud/api/health
```

```bash
ssh ops@vps 'docker logs --since 2m finances-api-1 2>&1' | grep -o '"remoteAddress":"[^"]*"' | sort | uniq -c
```

Expected: the device's own addresses (`tailscale ip -4` and `tailscale ip -6` on that device), never `172.x.y.z`. Health checks from inside the stack (`127.0.0.1` / `::1`) may show up too. A second device shows its own pair. `172.18.0.1` (the `proxy` gateway) on the IPv6 call means `proxy` is still IPv4-only (see Caddy above); Caddy's container address means `web` doesn't trust Caddy (the `caddy` name doesn't resolve, see below); `web`'s address means `api` doesn't trust `web` (`TRUSTED_PROXIES`).

If Caddy's service is renamed, set `WEB_TRUSTED_PROXIES=<new name>` in `.env`, then `dc up -d web`. To fall back to the behaviour before #183 (trust every private address, so neighbours on `proxy` can choose their client IP), set `WEB_TRUSTED_PROXIES=uniquelocal`. Residual risk: a container given the network alias `caddy` on `proxy` would be trusted too, which takes access to the Docker daemon or a change to an app's compose file.

## Running the production stack locally

To check the images and the compose file on a laptop, use a throwaway project name: the dev stack (`docker-compose.yml`) is also called `capi`, and the prod file would otherwise take over its containers. Give it its own `DB_VOLUME` too. Also create the `proxy` network if it doesn't exist.

```bash
docker network create proxy                       # only if missing; remove it afterwards
cat > /tmp/capi-local.env <<EOF
CAPI_VERSION=local
DB_VOLUME=capi-local_db_data
POSTGRES_USER=finances
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
APP_URL=https://capi.example.test
EOF
c="docker compose -p capi-local --env-file /tmp/capi-local.env -f docker-compose.prod.yml -f docker-compose.build.yml"
$c build
$c run --rm api node dist/database/migrate.js
$c run --rm api node dist/database/seed.js
$c up -d && $c ps
$c exec -T web node -e "fetch('http://localhost:3000/api/health').then(async r=>console.log(r.status, await r.text()))"
$c down -v                                         # removes the throwaway volume too
```

`docker-compose.build.yml` builds the images from the checkout (monorepo root as context) and tags them like the GHCR images, with `CAPI_VERSION`; the MCP adapter only with its profile (`COMPOSE_PROFILES=remote-mcp` in the env file, plus `REMOTE_MCP_ENABLED=true` and `REMOTE_MCP_PUBLIC_URL=https://capi-mcp.example.test`, https in production images). `docs/security/pentest/stack.sh oauth` runs it that way.

## Troubleshooting

| Symptom                                             | Check                                                                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `required variable … is missing a value`            | `.env` is incomplete, or the command didn't run from `/srv/capi`.                                                                                                                    |
| `network proxy declared as external, but not found` | The `infra` bootstrap hasn't created it: `docker network create --ipv6 proxy`.                                                                                                       |
| `pull access denied` / `unauthorized`               | GHCR login of `deploy` missing or expired ([deploy runbook](deploy.md)).                                                                                                             |
| Sign-in rate limited on every device at once        | Every device has the same client IP: run the end-to-end check in [Client IPs and trusted proxies](#client-ips-and-trusted-proxies) (`172.18.0.1` = IPv4-only `proxy` network, #251). |
| `api` unhealthy                                     | `dc logs api`. Most often the database isn't ready or migrated, or SMTP is configured but unreachable.                                                                               |
| Caddy answers 502                                   | `web` isn't running or healthy (`dc ps`), or isn't on `proxy` (`docker network inspect proxy` should list `capi-web`).                                                               |
| Signed out on every request                         | `APP_URL` isn't the HTTPS origin, or the site is opened over plain HTTP (the cookies are `Secure`).                                                                                  |
| Passkey sign-in or creation fails at once           | The page origin isn't `APP_URL` (or `WEBAUTHN_ORIGIN`), or `WEBAUTHN_RP_ID` doesn't match it. The password always works.                                                             |
| `api` or `web` restarts with exit code 137          | Out of memory (`docker inspect <container> --format '{{.State.OOMKilled}}'`): raise `APP_MEM_LIMIT` in `.env`, then `dc up -d`.                                                      |
| `EROFS: read-only file system`                      | Something tries to write outside `/tmp` (the root filesystem is read-only, #183): fix the code, never drop `read_only`.                                                              |
| `password authentication failed`                    | `POSTGRES_PASSWORD` changed after the volume was created. Put the old one back, or `ALTER USER` inside `db`.                                                                         |
