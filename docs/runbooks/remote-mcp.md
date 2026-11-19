# Remote MCP access (claude.ai and the Claude apps)

Lets claude.ai, Claude Desktop's connectors and the Claude mobile apps use the Finances tools without a local MCP server. Design and threat model: [ADR 0003](../adr/0003-remote-mcp-oauth.md) (#78).

> **Status: ready, off in production.** The #102 findings are fixed and the OAuth server and the production adapter service passed `docs/security/pentest/stack.sh oauth` (#328). The image (`ghcr.io/gregoirebdn/finances-mcp`), the `finances-mcp` service (profile `remote-mcp`) and the deploy are in this repository; the public host (DNS, Caddy) is in the `infra` repo. Turning it on is the owner's step: [Enabling](#enabling).

```
Claude's servers (160.79.104.0/21, 153.61.208.0/20)
   │  HTTPS, public host finances-mcp.<domain>
   ▼
Caddy (infra repo) ── only /mcp, /.well-known/oauth-*, /oauth/register|token|revoke
   ▼
finances-mcp (apps/mcp --http) ──▶ api (/api/oauth/*, /api/*) ──▶ db
                                    ▲
owner's browser (on the tailnet) ───┘ via web: /oauth/authorize (consent page)
```

- **Public**: only the MCP adapter (`apps/mcp --http`) and only seven paths. `web`, `api` and `db` keep no published port and no public route.
- **Private**: the consent page is the web app on the tailnet. Claude opens it in **your** browser (phone or computer, connected to Tailscale); Claude's servers never reach it.
- **Off switch**: `REMOTE_MCP_ENABLED`. Anything but `true` = no OAuth route in the API (404), every OAuth token refused, the adapter refuses to start.

## What a connection can do

The same as a personal access token of the same scope (deny-by-default, `@TokenAccess`):

- **Lecture seule** (default): every read tool, previews included.
- **Lecture et écriture** (tick "Autoriser les modifications" on the consent page): also the write tools (each one previews first and needs `confirm: true` after you agree), and the bank import preview / commit with the CSV **text** (the remote server never reads a file path).
- Never: delete anything, manage tokens, passkeys, connections or the account, close a month, create accounts.

Tokens: access 15 minutes, refresh 30 days rotated on each use (a reused refresh token cuts the connection), connection at most 90 days. Every API call made by a connection is in its detail under Réglages › Claude et accès › Accès actifs, told in plain words (from the method, route and status; 90 days).

## Enabling

In this order: the adapter must not be reachable before the API serves its OAuth routes, and Caddy must not route to a container that doesn't exist yet (it would answer 502, harmless).

### 1. Ship a release with the adapter

A release from #328 onwards builds, scans and pushes `ghcr.io/gregoirebdn/finances-mcp:vX.Y.Z` with the API and web images, and its `docker-compose.prod.yml` has the `finances-mcp` service. Deployed with the profile off, nothing changes on the server. After the first such release, check that the package `finances-mcp` exists under GitHub › Packages and that the server's GHCR token (classic, `read:packages`, deploy runbook § 2) can pull it:

```bash
ssh -t ops@vps 'sudo -iu deploy docker pull ghcr.io/gregoirebdn/finances-mcp:vX.Y.Z'
```

### 2. Public host name (DNS)

A dedicated name, `finances-mcp.gbodin.cloud`: an `A` record to the VPS's **public** IPv4, **DNS only** in Cloudflare (grey cloud). A proxied record would put Cloudflare's addresses in front of Caddy and break the `remote_ip` allow-list. No `AAAA`: Anthropic calls over IPv4 only, and nothing listens on the public IPv6. The app's tailnet name (`finances.gbodin.cloud`) stays as it is: nothing else gets a public record.

### 3. Public listener and Caddy site (infra repo)

Done in the `infra` repo (GregoireBDN/infra#7, its `docs/runbooks/caddy-portal.md` « Public MCP host »). Three layers, each open only to Anthropic's **outbound IPv4 ranges** `160.79.104.0/21` and `153.61.208.0/20`:

- **Hostinger firewall**: two accept rules, TCP 443 from those ranges.
- **Docker guard**: `DOCKER-USER` exceptions from `/etc/infra-public-allow`, applied by the infra `bootstrap.sh`. Docker forwards published ports past `ufw`, so a `ufw allow` alone would do nothing.
- **Caddy**: the public IPv4 `:443` is mapped to container port `8443` (`compose.public.yml`), where only the `finances-mcp.gbodin.cloud` site listens. That site answers 403 outside the ranges and 404 outside the adapter's seven paths, caps bodies at 8 MB and keeps streaming (`flush_interval -1`). It reaches the adapter as `finances-mcp:4100` on the `proxy` network: the adapter believes `X-Forwarded-For` only from the service named `caddy` (keep that name, or set `MCP_TRUSTED_PROXIES`).

Anthropic publishes its ranges at [platform.claude.com/docs/en/api/ip-addresses](https://platform.claude.com/docs/en/api/ip-addresses) (« Outbound IP addresses »; checked 2026-11-19, no outbound IPv6). If the connector's calls time out or get 403, check that page first and update the three layers together rather than dropping the filter.

### 4. Turn it on (`/srv/finances/.env`)

```bash
COMPOSE_PROFILES=remote-mcp
REMOTE_MCP_ENABLED=true
REMOTE_MCP_PUBLIC_URL=https://finances-mcp.gbodin.cloud
# Optional, the defaults:
# REMOTE_MCP_REDIRECT_URIS=        (claude.ai and claude.com callbacks)
# MCP_TRUSTED_PROXIES=caddy
# MCP_MEM_LIMIT=256m
```

`APP_URL` must stay the tailnet URL of the web app: the consent page is `${APP_URL}/oauth/authorize`. The API refuses to boot with `REMOTE_MCP_ENABLED=true` and no https `REMOTE_MCP_PUBLIC_URL`; the adapter refuses to start without both; `deploy.sh` refuses the profile without `REMOTE_MCP_ENABLED=true`. Then, as `deploy` in `/srv/finances` (`dc` = `docker compose -f docker-compose.prod.yml`, production stack runbook):

```bash
dc config --services                 # db api web finances-mcp
dc up -d api finances-mcp            # recreates api with the new variables, starts the adapter
dc ps                                # finances-mcp healthy
dc logs --tail=5 finances-mcp        # "remote MCP listening on 0.0.0.0:4100 (public https://…/mcp)"
```

From then on every deploy pulls, health-checks and rolls back the adapter with the rest.

### 5. Connect Claude

1. claude.ai → Settings → Connectors → **Add custom connector**: name `Finances`, URL `https://finances-mcp.gbodin.cloud/mcp`. Leave the OAuth client fields empty (Claude registers itself).
2. Claude opens the consent page on the tailnet: sign in if asked (password or passkey; approving needs a sign-in in the last 5 minutes), check that the return host is **claude.ai**, tick "Autoriser les modifications" only if you want the write tools, then **Autoriser**.
3. The connector appears in the Claude apps signed in with the same account (iPhone included). Your phone must be on the tailnet only when (re)connecting, for the consent page.
4. From the iPhone app: « Quels sont mes comptes ? » (`accounts_overview`), then a write tool without `confirm` to see its preview.

## Checks after enabling

```bash
# Public: only the adapter answers, and asks for a token
curl -si https://finances-mcp.gbodin.cloud/mcp -X POST | head -5        # 401 + WWW-Authenticate resource_metadata (403 from outside Anthropic's range)
curl -s https://finances-mcp.gbodin.cloud/.well-known/oauth-protected-resource/mcp
curl -s https://finances-mcp.gbodin.cloud/.well-known/oauth-authorization-server
curl -si https://finances-mcp.gbodin.cloud/api/health | head -1       # 404: the API is not public
curl -si https://finances-mcp.gbodin.cloud/dashboard | head -1        # 404
```

From a machine **outside** Anthropic's range the allowed paths answer 403 and the others 404 (so from your laptop, expect 403 on the first three: that is the allow-list working; run them from the server with `--resolve` to Caddy, or trust the connector's own calls). From a machine **outside** the tailnet, `finances.gbodin.cloud` must still not answer. Réglages › Claude et accès shows the connection under « Accès actifs », and its detail lists the calls.

## Disconnecting, kill switch

- **One connection**: Réglages → Claude et accès → its row in « Accès actifs » → **Déconnecter** (immediate: its access and refresh tokens are revoked).
- **Everything, now** (as `deploy` in `/srv/finances`):

  ```bash
  dc stop finances-mcp      # the public host answers 502 at once
  sed -i 's/^REMOTE_MCP_ENABLED=.*/REMOTE_MCP_ENABLED=false/; s/^COMPOSE_PROFILES=.*/COMPOSE_PROFILES=/' .env
  dc up -d api              # no /api/oauth route, every OAuth token refused
  dc rm -f finances-mcp
  ```

  Grants are kept but refused; setting both lines back and `dc up -d api finances-mcp` restores them unless revoked. With the API switched off but the adapter still running, a call within 30 s of the token's last check reaches the API and gets a tool error, later calls 503: no data either way (`stack.sh oauth`, « kill switch with the adapter running »). Optionally remove the Caddy site and the DNS record (infra repo).

- **Suspected leak**: disconnect every application, then look at what each one did in its detail. The adapter logs carry only method, route label and status (`dc logs finances-mcp`).

## Local test (no internet exposure)

```bash
createdb finances_scratch_78 && DATABASE_URL=postgres://…/finances_scratch_78 pnpm --filter @finances/api db:migrate
pnpm --filter @finances/api build && pnpm --filter @finances/mcp build
# API (compiled: decorator metadata is needed)
DATABASE_URL=…/finances_scratch_78 REMOTE_MCP_ENABLED=true REMOTE_MCP_PUBLIC_URL=http://localhost:4100 node apps/api/dist/main.js
# Adapter
REMOTE_MCP_ENABLED=true FINANCES_API_URL=http://localhost:4000 REMOTE_MCP_PUBLIC_URL=http://localhost:4100 node apps/mcp/dist/index.js --http
```

Or the production image and service: `docs/security/pentest/stack.sh up`, `run`, `oauth` (throwaway `finances-audit` stack, nothing published).

Then drive the flow with the MCP Inspector, adding its callback to `REMOTE_MCP_REDIRECT_URIS` (e.g. `http://localhost:6274/oauth/callback`), or with `curl` as in `apps/mcp/src/http/server.test.ts` and `apps/api/src/auth/oauth/oauth.http.spec.ts`. Drop the scratch database afterwards.
