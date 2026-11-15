# ADR 0003 — Remote MCP access with OAuth (claude.ai and the Claude apps)

- **Status**: Accepted (implemented **disabled**; enabling waits for #102)
- **Date**: 2026-11-15
- **Issue**: #78 (milestone M8 Claude (MCP))

## Context

The MCP server (`apps/mcp`) runs on the owner's machine over stdio with a personal access token. claude.ai, Claude Desktop's custom connectors and the Claude mobile apps cannot start a local process: their connectors call a **remote** MCP server **from Anthropic's servers** (outbound range `160.79.104.0/21`), over Streamable HTTP, and authorize with **OAuth 2.1** as the MCP authorization specification (2025-11-25) requires:

- the MCP server is an OAuth resource server: it answers `401` with `WWW-Authenticate: Bearer resource_metadata="…"` and serves Protected Resource Metadata (RFC 9728), whose `resource` must be exactly the MCP URL;
- the authorization server publishes RFC 8414 metadata with `code_challenge_methods_supported: ["S256"]`; the client uses PKCE S256 and the `resource` parameter (RFC 8707); the server must only accept tokens issued for it (audience) and rotate refresh tokens of public clients;
- client registration: Client ID Metadata Documents (SHOULD), Dynamic Client Registration (MAY, backwards compatibility) or a pre-registered client. claude.ai registers with DCR as a **public client** (`token_endpoint_auth_method: none`), or with CIMD when the server advertises it; its redirect URI is `https://claude.ai/api/mcp/auth_callback` (`https://claude.com/api/mcp/auth_callback` announced), it posts `application/x-www-form-urlencoded` to `/token`, refreshes on a `401` and a few minutes before expiry, and expects `invalid_grant` for a dead refresh token.

The rest of the app must stay reachable **only through Tailscale** (ADR 0001, M6): web, API and database are never published. The app is single user; tokens are deny-by-default for writes (`@TokenAccess`), nothing can be deleted through MCP, and nothing financial is ever logged.

## Decision

### 1. The OAuth authorization server lives in the API

The API already owns the user, the sessions, passkeys and the fresh-authentication rule (#176), the throttler, the token audit and the database. The authorization server is a set of `/api/oauth/*` routes there (`apps/api/src/auth/oauth/`):

| Route                                                                                     | Who calls it                                                                      | Access                                                               |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET /api/oauth/metadata`                                                                 | Anthropic (through the MCP adapter, as `/.well-known/oauth-authorization-server`) | public                                                               |
| `POST /api/oauth/register`                                                                | Anthropic (DCR, as `/oauth/register`)                                             | public, 5/min per IP, redirect URIs from an allow-list               |
| `POST /api/oauth/token`                                                                   | Anthropic (as `/oauth/token`)                                                     | public, 20/min per IP                                                |
| `POST /api/oauth/revoke`                                                                  | Anthropic (as `/oauth/revoke`, RFC 7009)                                          | public, 20/min per IP                                                |
| `GET /api/oauth/authorize`, `POST /api/oauth/authorize`, `POST /api/oauth/authorize/deny` | the consent page of the web app                                                   | session only; approving needs a **fresh session** (`FreshAuthGuard`) |
| `GET /api/oauth/grants`, `DELETE /api/oauth/grants/:id`, `GET /api/oauth/audit`           | the profile page                                                                  | session only                                                         |
| `GET /api/oauth/token-info`                                                               | the MCP adapter, to check a presented token                                       | OAuth access token only                                              |

The MCP process holds **no secret and no database access**: it stays a protocol adapter over the API, as with stdio.

**Rejected: the authorization server in `apps/mcp`.** It would need the user store, the session check, the fresh-auth rule and its own persistence; duplicating auth is how bugs creep in.

### 2. Tokens

- **Opaque, hashed, prefixed**: access `fin_oat_…`, refresh `fin_ort_…`, code `fin_oac_…` (32 random bytes, base64url), stored as SHA-256 like personal access tokens; never logged, never returned after issue.
- **Scopes** are the token scopes: `read` (GET routes and read-only previews) and `write` (also the `@TokenAccess('write')` routes). The consent screen grants `read` unless the owner ticks "Autoriser les modifications"; the token response says which (`read` or `read write`). The deny-by-default rule of `JwtGuard` applies unchanged: an OAuth token reaches exactly what a personal access token of the same scope reaches, never a `@TokenAccess('none')` route (token, passkey, account management, deletes).
- **Lifetimes**: authorization code 2 minutes, single use; access token 15 minutes; refresh token 30 days, **rotated** on every use; a grant (one connection) lives at most 90 days, like a session family, then the owner reconnects.
- **Replay and reuse**: a code is consumed with a conditional `UPDATE … WHERE used_at IS NULL RETURNING`; presenting a used code revokes the grant it produced. A refresh token is rotated the same way; presenting an already-rotated one revokes the whole grant (reuse detection, as for sessions).
- **Audience**: every grant stores the `resource` it was issued for (the MCP URL). The token endpoint refuses another `resource` (`invalid_target`); the API accepts an OAuth access token only when its grant's resource is the configured MCP URL; the MCP adapter accepts only `fin_oat_` tokens (never a personal access token or a session) and checks them with `token-info` before serving a request.
- **Token passthrough**: the adapter forwards the access token to the API. This is not the "passthrough" the MCP spec forbids (an MCP server relaying a token issued for _another_ resource to a third-party API): the API is the issuer, and the MCP endpoint and the API form one resource server whose audience the token names. The API applies its own scope, route and audit rules to every call. A token exchange would add a second secret and no isolation.
- **Client registration**: DCR only, public clients only (`token_endpoint_auth_method: none`), `authorization_code` + `refresh_token` grants, redirect URIs **exactly** in `REMOTE_MCP_REDIRECT_URIS` (default: the claude.ai and claude.com callbacks). At most 50 clients; registration evicts unused ones (no active grant), never a connected one. A registered client is only a name and redirect URIs: it gets nothing without the owner's consent.
- **CIMD not implemented**: it makes the server fetch arbitrary URLs given by unauthenticated callers (SSRF). claude.ai falls back to DCR when `client_id_metadata_document_supported` is absent.

### 3. Exposure: only the MCP adapter is public; the consent page stays on the tailnet

`apps/mcp` gets a Streamable HTTP transport (`node dist/index.js --http`, stateless: one MCP server per request, JSON responses, no session) that serves **only**:

- `POST /mcp` (the MCP endpoint; `GET` and `DELETE` answer 405);
- `GET /.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` (built from its configuration);
- `GET /.well-known/oauth-authorization-server`, `POST /oauth/register`, `/oauth/token`, `/oauth/revoke`, forwarded to the API routes above (form bodies converted to JSON, so the API never parses forms; bodies capped at 16 KB).

Everything else answers 404. The **authorization endpoint is the web app's consent page** (`https://<app on the tailnet>/oauth/authorize`): it is opened by the owner's own browser (phone or computer, which are on the tailnet), never by Anthropic's servers, so it stays private. Anthropic's servers only need the adapter.

Infrastructure, to be done in the separate `infra` repo when enabling (not in this change):

- a **dedicated public host name** for the adapter (e.g. `finances-mcp.<domain>`), served by the server's Caddy and routed to a `finances-mcp` container (`node dist/index.js --http`) that joins the external `proxy` network and the project network; `web`, `api` and `db` keep no published port and no public route;
- Caddy for that host forwards only the paths listed above (`handle /mcp`, `/.well-known/oauth-*`, `/oauth/register|token|revoke`, `respond 404` otherwise), optionally restricted to Anthropic's range `160.79.104.0/21` (`remote_ip`), with request body limits and no buffering of responses;
- the public listener is the only change to the network edge: the tailnet listener and DNS of the app stay as they are.

**Rejected: Tailscale Funnel.** Funnel publishes a node's whole HTTPS listener on the `ts.net` name (paths can be split, but it is the tailnet's own host name and certificate), only on ports 443/8443/10000, with Tailscale's relays in the request path and less control over limits and IP filtering than Caddy. A dedicated Caddy host keeps one edge, one place for TLS, body limits and the IP allow-list, and the tailnet name untouched. Funnel stays a fallback for a quick test from a laptop.

**Rejected: routing `/api` publicly.** The API would be on the internet for the sake of three endpoints.

### 4. Defense in depth and kill switch

- **Off by default**: `REMOTE_MCP_ENABLED` (anything but `true` is off). Off, the API mounts **no** `/api/oauth` route (404, not even in the router) and `JwtGuard` refuses every `fin_oat_` token; the adapter refuses to start. Turning it off and restarting is the kill switch: every connection stops at once, without deleting grants.
- **Revocation** from the profile page ("Applications connectées", next to the personal access tokens): revoking a grant revokes its access and refresh tokens at once.
- **Rate limits**: per IP on the public OAuth routes (above), the per-token bucket already applied to bearer tokens (60/min), and in the adapter (per IP before authentication, per token after).
- **Audit**: one `oauth_audit` row per API call made with an OAuth token (grant, method, route pattern, status; never the URL, query, body or amounts), kept 90 days, shown on the profile page like the access-token audit.
- **Consent**: shown on a page with `X-Frame-Options: DENY` / `frame-ancestors 'none'`; it states the client name (self-declared, so shown as such), the **host of the redirect URI** (the trust anchor) and the scope; approving needs a sign-in in the last 5 minutes (`ReauthSheet` otherwise). Redirects go only to the exact registered URI, with `iss` (RFC 9207) and `state`.
- **Logs**: the adapter logs a method, a path pattern and a status; never a token, code, verifier, client secret, argument or tool output. The API's request log already drops query strings and redacted DB errors.
- **Remote tools differ from local ones only where the server's disk is involved**: over HTTP `preview_bank_import` refuses `filePath` (it would read the server's files) and takes `content` only.

## Consequences

- Enabling remote access puts one more host on the internet. Its attack surface is the adapter's six paths and, behind them, the API's OAuth routes and the token-authenticated API. The **pentest of #102 must cover it, and its high / critical findings must be fixed before `REMOTE_MCP_ENABLED=true` is set in production** (runbook `docs/runbooks/remote-mcp.md`).
- Tokens are held by Anthropic on the owner's behalf. A leaked access token is usable for 15 minutes, a refresh token until it is rotated or revoked; revoking the connection or the kill switch stops both.
- The owner reconnects every 90 days at most, and after any reuse alarm.
- Claude Code can keep using the local stdio server; the HTTP transport only accepts the configured redirect URIs, so loopback clients are not allowed unless added on purpose.
