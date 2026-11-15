# Remote MCP access (claude.ai and the Claude apps)

Lets claude.ai, Claude Desktop's connectors and the Claude mobile apps use the Finances tools without a local MCP server. Design and threat model: [ADR 0003](../adr/0003-remote-mcp-oauth.md) (#78).

> **Status: shipped disabled.** Do **not** enable it in production before the security audit and penetration test of #102 cover it and its high / critical findings are fixed. Everything below is for that later day.

```
Claude's servers (160.79.104.0/21)
   │  HTTPS, public host finances-mcp.<domain>
   ▼
Caddy (infra repo) ── only /mcp, /.well-known/oauth-*, /oauth/register|token|revoke
   ▼
finances-mcp (apps/mcp --http) ──▶ api (/api/oauth/*, /api/*) ──▶ db
                                    ▲
owner's browser (on the tailnet) ───┘ via web: /oauth/authorize (consent page)
```

- **Public**: only the MCP adapter (`apps/mcp --http`) and only six paths. `web`, `api` and `db` keep no published port and no public route.
- **Private**: the consent page is the web app on the tailnet. Claude opens it in **your** browser (phone or computer, connected to Tailscale); Claude's servers never reach it.
- **Off switch**: `REMOTE_MCP_ENABLED`. Anything but `true` = no OAuth route in the API (404), every OAuth token refused, the adapter refuses to start.

## What a connection can do

The same as a personal access token of the same scope (deny-by-default, `@TokenAccess`):

- **Lecture seule** (default): every read tool, previews included.
- **Lecture et écriture** (tick "Autoriser les modifications" on the consent page): also the write tools (each one previews first and needs `confirm: true` after you agree), and the bank import preview / commit with the CSV **text** (the remote server never reads a file path).
- Never: delete anything, manage tokens, passkeys, connections or the account, close a month, create accounts.

Tokens: access 15 minutes, refresh 30 days rotated on each use (a reused refresh token cuts the connection), connection at most 90 days. Every API call made by a connection is in the profile's "Applications connectées → Derniers appels" (method, route, status; 90 days).

## Enabling (after #102)

### 1. Pick the public host name

A dedicated name, e.g. `finances-mcp.<your domain>`, with a public DNS record pointing at the VPS (in the `infra` repo / DNS provider). The app's tailnet name stays as it is.

### 2. Run the adapter

Not in `docker-compose.prod.yml` yet: the enabling change adds a `finances-mcp` service (image `ghcr.io/gregoirebdn/finances-mcp`, built from `apps/mcp`, `node dist/index.js --http`), with the same hardening as `api` / `web` (`read_only`, `cap_drop: [ALL]`, `no-new-privileges`, memory and pid limits), on the project network (to reach `api`) and the external `proxy` network (for Caddy), **no `ports:`**. Its environment:

| Variable                | Value                                                                      |
| ----------------------- | -------------------------------------------------------------------------- |
| `REMOTE_MCP_ENABLED`    | `true`                                                                     |
| `FINANCES_API_URL`      | `http://api:4000`                                                          |
| `REMOTE_MCP_PUBLIC_URL` | `https://finances-mcp.<domain>` (origin only, https)                       |
| `MCP_HTTP_HOST`         | `0.0.0.0` (inside the container)                                           |
| `MCP_HTTP_PORT`         | `4100` (default)                                                           |
| `MCP_TRUSTED_PROXIES`   | Caddy's address on the `proxy` network (IP or CIDR; `loopback` by default) |

### 3. Configure the API

In the stack's `.env` (`.env.production.example` documents them):

```bash
REMOTE_MCP_ENABLED=true
REMOTE_MCP_PUBLIC_URL=https://finances-mcp.<domain>
# Optional: the allowed redirect URIs (default: the claude.ai and claude.com callbacks)
REMOTE_MCP_REDIRECT_URIS=
```

`APP_URL` must be the tailnet URL of the web app: the consent page is `${APP_URL}/oauth/authorize`. The API refuses to boot when `REMOTE_MCP_ENABLED=true` without an https `REMOTE_MCP_PUBLIC_URL` in production. Apply the migrations (the deploy does) and restart `api`.

### 4. Route it in Caddy (infra repo)

Sketch, to adapt in the `infra` repo:

```caddyfile
finances-mcp.example.com {
	@anthropic remote_ip 160.79.104.0/21
	@allowed path /mcp /.well-known/oauth-protected-resource /.well-known/oauth-protected-resource/mcp /.well-known/oauth-authorization-server /oauth/register /oauth/token /oauth/revoke

	request_body {
		max_size 8MB
	}
	handle @allowed {
		# route keeps this order (Caddy would otherwise run respond first).
		route {
			reverse_proxy @anthropic finances-mcp:4100 {
				flush_interval -1
			}
			respond 403
		}
	}
	respond 404
}
```

Check Anthropic's published outbound range before restricting by IP; drop the `remote_ip` matcher if it changes too often. Nothing else of the app is added to this site.

### 5. Connect Claude

1. claude.ai → Settings → Connectors → **Add custom connector**: name `Finances`, URL `https://finances-mcp.<domain>/mcp`. Leave the OAuth client fields empty (Claude registers itself).
2. Claude opens the consent page on the tailnet: sign in if asked (password or passkey; approving needs a sign-in in the last 5 minutes), check that the return host is **claude.ai**, tick "Autoriser les modifications" only if you want the write tools, then **Autoriser**.
3. The connector appears in the Claude apps signed in with the same account (mobile included). Your phone must be on the tailnet only when (re)connecting, for the consent page.

## Checks after enabling

```bash
# Public: only the adapter answers, and asks for a token
curl -si https://finances-mcp.<domain>/mcp -X POST | head -5          # 401 + WWW-Authenticate resource_metadata
curl -s https://finances-mcp.<domain>/.well-known/oauth-protected-resource/mcp
curl -s https://finances-mcp.<domain>/.well-known/oauth-authorization-server
curl -si https://finances-mcp.<domain>/api/health | head -1         # 404: the API is not public
```

From a machine **outside** the tailnet, the app's own host name must still not answer. The profile page shows the connection under "Applications connectées".

## Disconnecting, kill switch

- **One connection**: Profil → Applications connectées → **Déconnecter** (immediate: its access and refresh tokens are revoked).
- **Everything, now**: set `REMOTE_MCP_ENABLED=false` (API and adapter) and restart them, or stop the `finances-mcp` service. Grants are kept but refused; turning it back on restores them unless revoked.
- **Suspected leak**: disconnect every application, then look at the "Derniers appels" list. The adapter logs carry only method, route label and status (`docker compose logs finances-mcp`).

## Local test (no internet exposure)

```bash
createdb finances_scratch_78 && DATABASE_URL=postgres://…/finances_scratch_78 pnpm --filter @finances/api db:migrate
pnpm --filter @finances/api build && pnpm --filter @finances/mcp build
# API (compiled: decorator metadata is needed)
DATABASE_URL=…/finances_scratch_78 REMOTE_MCP_ENABLED=true REMOTE_MCP_PUBLIC_URL=http://localhost:4100 node apps/api/dist/main.js
# Adapter
REMOTE_MCP_ENABLED=true FINANCES_API_URL=http://localhost:4000 REMOTE_MCP_PUBLIC_URL=http://localhost:4100 node apps/mcp/dist/index.js --http
```

Then drive the flow with the MCP Inspector, adding its callback to `REMOTE_MCP_REDIRECT_URIS` (e.g. `http://localhost:6274/oauth/callback`), or with `curl` as in `apps/mcp/src/http/server.test.ts` and `apps/api/src/auth/oauth/oauth.http.spec.ts`. Drop the scratch database afterwards.
