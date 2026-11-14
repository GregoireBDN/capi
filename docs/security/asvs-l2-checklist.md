# OWASP ASVS 4.0.3, level 2 — checklist

- **Issue**: #102. **Date**: 2026-11-14, `main` at `5abde73`.
- **Scope**: `apps/api`, `apps/web`, `docker-compose.prod.yml`, the Caddy and Tailscale files of the `infra` repo as read from a local checkout. `apps/mcp` is a local stdio client of the API and is covered through the token rows.
- **Method**: code review (evidence `path:line`, paths from the repo root) and dynamic checks against a local production-like stack (evidence `pentest/<script>`, results in the [report](audit-2026-11-14.md) §3).
- **Status**: **Pass**; **Partial** (met with a gap); **Fail** (not met → `fix` issue); **Accepted** (not met, deliberate, reason given); **N/A**; **Owner** (needs the VPS or an admin console, see the report §5).

Requirements of level 2 that cannot apply to this app (SMS / OTP authenticators, XML, LDAP, SOAP, GraphQL, WebSockets, file storage on disk...) are grouped as N/A at the end of each section rather than listed one by one.

## V1 Architecture

| #      | Requirement (short)                                | Status   | Evidence                                                                                                                                            |
| ------ | -------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.2  | Threat modelling for design changes                | Pass     | [threat-model.md](threat-model.md); ADRs 0001, 0002                                                                                                 |
| 1.1.4  | Trust boundaries and data flows documented         | Pass     | threat-model.md §3                                                                                                                                  |
| 1.4.1  | Access control enforced at a trusted service layer | Pass     | `JwtGuard` in the API only (`apps/api/src/auth/guards/jwt.guard.ts:42`); the web proxy adds no authorisation                                        |
| 1.4.4  | Single, vetted access control mechanism            | Pass     | One guard; route audit `apps/api/src/app.routes.spec.ts:56` (public allow-list), `:73` (token-writable allow-list)                                  |
| 1.5.1  | Input / output requirements defined                | Pass     | DTOs with class-validator, global `ValidationPipe` `apps/api/src/main.ts:86`                                                                        |
| 1.9.1  | Encrypted communication between components         | Accepted | Browser→Caddy TLS; Caddy→web→api→db plain HTTP / Postgres on one host's Docker networks, none published. Revisit if a component moves off the host. |
| 1.14.1 | Segregation of components of differing trust       | Partial  | `api`/`db` only on the project network; `web` shares the `proxy` network with other apps → #183                                                     |

## V2 Authentication

| #      | Requirement (short)                                              | Status   | Evidence                                                                                                                                                                               |
| ------ | ---------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1.1  | Passwords ≥ 12 characters                                        | **Fail** | `MinLength(8)` `apps/api/src/auth/dto/fields.ts:7` → #177                                                                                                                              |
| 2.1.2  | ≥ 64 characters allowed                                          | Pass     | No maximum; bcrypt input up to 72 bytes                                                                                                                                                |
| 2.1.3  | No truncation                                                    | **Fail** | bcrypt ignores bytes after 72 → #177                                                                                                                                                   |
| 2.1.4  | Any Unicode character allowed                                    | Pass     | `IsString()` only                                                                                                                                                                      |
| 2.1.5  | Users can change their password                                  | **Fail** | No change route; reset needs SMTP (off in production) → #177                                                                                                                           |
| 2.1.6  | Change requires current and new password                         | **Fail** | No change route → #177                                                                                                                                                                 |
| 2.1.7  | Checked against breached passwords                               | Accepted | Would need a third-party call or a large local list; single owner chooses a password-manager password. Privacy rule: no third-party calls with user data.                              |
| 2.1.8  | Strength meter                                                   | Accepted | Same reason; one owner                                                                                                                                                                 |
| 2.1.9  | No composition rules                                             | Pass     | `fields.ts:7`                                                                                                                                                                          |
| 2.1.10 | No periodic rotation                                             | Pass     | None                                                                                                                                                                                   |
| 2.1.11 | Paste and password managers allowed                              | Pass     | `autoComplete="current-password"` `apps/web/src/components/auth/LoginForm.tsx:160`                                                                                                     |
| 2.1.12 | Can view the masked password                                     | Pass     | `packages/ui/src/components/password-input.tsx`                                                                                                                                        |
| 2.2.1  | Anti-automation against brute force                              | Pass     | `login: 5` / min / IP `apps/api/src/throttle.config.ts:14`, passkey verify 5/min; pentest/01-auth.sh: 401 ×5 then 429, also through an untrusting proxy with spoofed `X-Forwarded-For` |
| 2.2.2  | Weak authenticators only as secondary                            | Pass     | Email used only for reset / verification links                                                                                                                                         |
| 2.2.3  | Notification after changes to authentication details             | Accepted | No SMTP in production; one owner sees passkeys and tokens on the profile page. Revisit with #78.                                                                                       |
| 2.3.2  | Enrolment of user-provided authenticators (FIDO)                 | Pass     | Passkeys (#100), `apps/api/src/auth/passkeys/`                                                                                                                                         |
| 2.4.1  | Passwords stored with a salted adaptive hash                     | Pass     | bcrypt `apps/api/src/auth/auth.service.ts:69`                                                                                                                                          |
| 2.4.2  | Salt ≥ 32 bits                                                   | Pass     | bcrypt 128-bit salt                                                                                                                                                                    |
| 2.4.4  | bcrypt work factor as large as practical (≥ 10)                  | Pass     | `BCRYPT_SALT_ROUNDS = 10` `apps/api/src/auth/auth.constants.ts:1` (minimum; could be raised)                                                                                           |
| 2.4.5  | Additional secret-salted KDF iteration (pepper)                  | Accepted | Pepper would live in the same `.env` as the DB password on one host; low gain                                                                                                          |
| 2.5.1  | Recovery secret not sent in clear / single-use, random           | Pass     | 256-bit random token, SHA-256 stored, 1 h, single use `auth.service.ts:322`, `:336`                                                                                                    |
| 2.5.2  | No hints / knowledge questions                                   | Pass     | None                                                                                                                                                                                   |
| 2.5.3  | Recovery doesn't reveal the password                             | Pass     | Link sets a new password                                                                                                                                                               |
| 2.5.4  | No shared / default accounts                                     | Pass     | Single owner created at first launch; registration closed after (403, pentest/01-auth.sh)                                                                                              |
| 2.5.5  | Notification on password change / reset                          | Accepted | As 2.2.3                                                                                                                                                                               |
| 2.5.6  | Secure forgotten-password mechanism                              | Partial  | Token flow is sound; earlier unused links stay valid and other sessions survive the reset → #177                                                                                       |
| 2.10.2 | Service passwords are not defaults                               | Pass     | `POSTGRES_PASSWORD`, `JWT_SECRET` required (`${VAR:?}`) `docker-compose.prod.yml:26`, `:41`                                                                                            |
| 2.10.4 | Secrets not in source code                                       | Pass     | gitleaks in `security.yml`; `.env*` git-ignored and docker-ignored                                                                                                                     |
| —      | Passkeys: challenge single use, purpose- and user-bound, 5 min   | Pass     | `apps/api/src/auth/passkeys/passkeys.service.ts:152`–`:166` (deleted before verification)                                                                                              |
| —      | Passkeys: origin, RP id, user verification checked               | Pass     | `passkeys.service.ts:237`–`:239`, `:327`–`:329`; RP id must cover the origin at boot `apps/api/src/config/env.ts` `resolveWebauthn`                                                    |
| —      | Passkeys: signature counter stored and checked                   | Pass     | `passkeys.service.ts:333`, `:345`                                                                                                                                                      |
| —      | Adding a passkey needs a fresh sign-in                           | Pass     | `assertFreshSession` `passkeys.service.ts:110`                                                                                                                                         |
| —      | Personal access tokens: random, hashed, scoped, expiring, capped | Pass     | `apps/api/src/auth/access-tokens/access-tokens.service.ts:37`, `:66`–`:69`, `:101`; prefix `access-tokens.constants.ts:2`                                                              |

N/A: 2.1.? for system-generated passwords, 2.3.1 / 2.3.3, 2.5.7, 2.6 (look-up secrets), 2.7 (out-of-band), 2.8 (OTP), 2.9 (hardware crypto authenticators beyond passkeys), 2.10.1 / 2.10.3 for service accounts (Owner: `.env` mode 600).

## V3 Session management

| #     | Requirement (short)                                        | Status   | Evidence                                                                                                                                                                                |
| ----- | ---------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1.1 | No session token in URLs                                   | Pass     | Cookies only; personal access tokens in `Authorization`                                                                                                                                 |
| 3.2.1 | New session token on authentication                        | Pass     | New family per sign-in `apps/api/src/auth/auth.service.ts:223` (`createSession`)                                                                                                        |
| 3.2.2 | ≥ 64 bits of entropy                                       | Pass     | Refresh: 256-bit `auth.service.ts:205`; access: signed JWT                                                                                                                              |
| 3.2.3 | Stored in the browser with secure methods                  | Pass     | `httpOnly` cookies `apps/api/src/auth/session-cookies.ts:10`                                                                                                                            |
| 3.2.4 | Approved cryptographic algorithms                          | Pass     | HS256 JWT, SHA-256 of random tokens                                                                                                                                                     |
| 3.3.1 | Logout invalidates the session                             | Partial  | Refresh family revoked `auth.service.ts:276`, `Clear-Site-Data: "cache"` `auth.controller.ts:112`; the access JWT stays valid ≤ 15 min (pentest/02-session.sh) → #178                   |
| 3.3.2 | Periodic re-authentication                                 | **Fail** | 30-day idle timeout renewed on each refresh, no absolute lifetime → #178                                                                                                                |
| 3.3.3 | Terminate other sessions after a password change           | **Fail** | → #177                                                                                                                                                                                  |
| 3.3.4 | Users can view and log out of their sessions               | **Fail** | Not available; passkeys and tokens are listable and revocable → #178                                                                                                                    |
| 3.4.1 | `Secure` attribute                                         | Pass     | `secure: env.isProduction` `session-cookies.ts:13`; seen on the production stack (pentest/01-auth.sh)                                                                                   |
| 3.4.2 | `HttpOnly` attribute                                       | Pass     | `session-cookies.ts:10`                                                                                                                                                                 |
| 3.4.3 | `SameSite` attribute                                       | Pass     | `Lax` `session-cookies.ts:12` (same-site siblings remain, #179)                                                                                                                         |
| 3.4.4 | `__Host-` prefix                                           | **Fail** | Cookies named `token`, `refresh_token` → #179                                                                                                                                           |
| 3.4.5 | Path / no shared domain                                    | Pass     | Host-only cookies (no `Domain`), `Path=/`                                                                                                                                               |
| 3.5.1 | Users can revoke tokens granted to clients                 | Pass     | `DELETE /api/access-tokens/:id` `access-tokens.controller.ts:105`                                                                                                                       |
| 3.5.2 | Session tokens rather than static secrets for the browser  | Pass     | Cookies for the browser; static tokens only for the MCP / scripts, scoped                                                                                                               |
| 3.5.3 | Stateless tokens protected by signatures                   | Pass     | `alg: none` and an HS256 token with a wrong key both 401 (pentest/02-session.sh); secret length → #182                                                                                  |
| 3.7.1 | Full session or re-authentication before sensitive actions | **Fail** | Token creation `access-tokens.controller.ts:64`, account deletion `apps/api/src/user/profile.controller.ts:49`, passkey revocation `passkeys.controller.ts:182` need any session → #176 |
| —     | Refresh rotation with reuse detection                      | Pass     | `auth.service.ts:233`–`:258`; replaying a rotated token revokes the family (pentest/02-session.sh); rotation not atomic → #178                                                          |

## V4 Access control

| #     | Requirement (short)                       | Status   | Evidence                                                                                                                                                                                                                      |
| ----- | ----------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1.1 | Enforced on a trusted server              | Pass     | API guard; the web proxy is a pass-through                                                                                                                                                                                    |
| 4.1.2 | Access-control data not user-manipulable  | Pass     | `sub` from the verified JWT or the token row `jwt.guard.ts:61`, `:93`                                                                                                                                                         |
| 4.1.3 | Least privilege                           | Pass     | Tokens deny-by-default for writes `jwt.guard.ts:19`, `:87`; session-only routes `@TokenAccess('none')`                                                                                                                        |
| 4.1.5 | Fail securely                             | Pass     | Unknown → 401/403; route audit fails CI on any new unguarded route `app.routes.spec.ts`                                                                                                                                       |
| 4.2.1 | IDOR protection                           | Pass     | Single-user data model (no foreign owner to reach); user-bound tables (passkeys, tokens, challenges) filter by `userId`. Sweep of 111 routes: every non-public route 401 without credentials (pentest/03-routes.sh)           |
| 4.2.2 | CSRF protection                           | Partial  | Server functions: TanStack CSRF middleware `apps/web/src/start.ts` (cross-site, same-site, no header → 403; pentest/05-web.sh). `/api`: `SameSite=Lax` + JSON DTOs only; same-site bodiless / multipart POSTs accepted → #179 |
| 4.3.1 | Admin interfaces use MFA                  | N/A      | No admin interface                                                                                                                                                                                                            |
| 4.3.2 | No directory browsing / metadata exposure | Pass     | `.env`, `.git/config`, `nitro.json`, server bundle, `package.json`, traversal → 404 (pentest/05-web.sh)                                                                                                                       |
| 4.3.3 | Step-up for sensitive actions             | **Fail** | → #176                                                                                                                                                                                                                        |
| —     | Token scopes                              | Pass     | `read` token: every non-GET route 403 except public routes and the declared `read` routes that save nothing; session-only GETs (tokens, audit, passkeys, wallet keys) 403 (pentest/03-routes.sh)                              |

## V5 Validation, sanitisation and encoding

| #     | Requirement (short)                         | Status   | Evidence                                                                                                                                                                                                                                                                                                                |
| ----- | ------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1.1 | HTTP parameter pollution                    | Pass     | Typed DTOs; repeated multipart fields refused `apps/api/src/imports/upload/multipart.ts:80`                                                                                                                                                                                                                             |
| 5.1.2 | Mass assignment                             | Pass     | `whitelist` + `forbidNonWhitelisted` `apps/api/src/main.ts:88`–`:89`                                                                                                                                                                                                                                                    |
| 5.1.3 | Positive input validation                   | Pass     | class-validator on every DTO, `ArrayMaxSize` on arrays, `MaxLength` on strings                                                                                                                                                                                                                                          |
| 5.1.4 | Structured data strongly typed              | Pass     | Dates, months, UUIDs (`ParseUUIDPipe`), cents as integers                                                                                                                                                                                                                                                               |
| 5.1.5 | Redirects to allow-listed destinations only | Pass     | No redirect parameter; `/auth?redirect=`, `//evil`, `?next=` stay on the origin (pentest/05-web.sh)                                                                                                                                                                                                                     |
| 5.2.2 | Unstructured data sanitised                 | Pass     | Labels kept verbatim, rendered as text by React; no `dangerouslySetInnerHTML` on data (only the constant theme script `apps/web/src/routes/__root.tsx:64`)                                                                                                                                                              |
| 5.2.4 | No `eval` of user input                     | Pass     | Semgrep `p/default` in CI                                                                                                                                                                                                                                                                                               |
| 5.2.5 | Template injection                          | Pass     | React Email templates receive props, rendered escaped                                                                                                                                                                                                                                                                   |
| 5.2.6 | SSRF                                        | Pass     | Base URLs from env only; path segments `encodeURIComponent` `apps/api/src/crypto/coingecko.provider.ts:132`, `apps/api/src/crypto/wallet-sync/esplora.provider.ts:66`; `redirect: 'error'` `coingecko.provider.ts:176`, `chain-provider.ts:104`; timeouts; body caps `coingecko.provider.ts:22`, `chain-provider.ts:83` |
| 5.3.1 | Context-aware output encoding               | Pass     | JSON responses; React rendering                                                                                                                                                                                                                                                                                         |
| 5.3.3 | XSS escaping                                | Pass     | `<img onerror>` label, `<script>` account name and file name stored and returned as JSON strings (pentest/04-input.sh); no HTML sink. Defence in depth missing → #174                                                                                                                                                   |
| 5.3.4 | Parameterised queries                       | Pass     | Drizzle builder; one `sql.raw` on a constant `apps/api/src/spending/spending.service.ts:376`; `' OR 1=1--` in search returns no rows (pentest/04-input.sh)                                                                                                                                                              |
| 5.3.6 | JSON injection                              | Pass     | `JSON.parse` / serializers only                                                                                                                                                                                                                                                                                         |
| 5.3.9 | Local / remote file inclusion               | Pass     | Only the history CLI writes a file, path confined `apps/api/src/imports/history/cli.ts:142`                                                                                                                                                                                                                             |
| 5.5.3 | Safe deserialisation                        | Pass     | JSON only; numbers from third parties parsed as strings (`quoteJsonNumbers`)                                                                                                                                                                                                                                            |
| —     | CSV / formula injection in exports          | **Fail** | `cell()` `apps/web/src/components/month-close/csv.ts:11` quotes but does not neutralise `=`, `+`, `-`, `@` → #175                                                                                                                                                                                                       |
| —     | Encoding edge cases of imports              | Pass     | Explicit Windows-1252 decoder `apps/api/src/imports/parsers/windows-1252.ts`; `€`, `É` round-trip (pentest/04-input.sh)                                                                                                                                                                                                 |

N/A: 5.2.1 (no rich text), 5.2.3 (no SMTP / IMAP injection surface: addresses are validated, the only recipient is the owner), 5.2.7 (no SVG upload), 5.3.2, 5.3.5, 5.3.7 (LDAP), 5.3.8 (no OS commands), 5.3.10 (XPath), 5.5.1, 5.5.2 (no XML).

## V6 Stored cryptography

| #     | Requirement (short)         | Status   | Evidence                                                                                          |
| ----- | --------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| 6.2.1 | Modules fail securely       | Pass     | JWT verification errors → 401 `jwt.guard.ts:66`                                                   |
| 6.2.2 | Proven algorithms           | Pass     | bcrypt, SHA-256, HMAC-SHA-256, WebAuthn via `@simplewebauthn/server`                              |
| 6.3.1 | CSPRNG                      | Pass     | `crypto.randomBytes`, `randomUUID`                                                                |
| 6.3.2 | Random GUIDs (v4)           | Pass     | `randomUUID`, Postgres `gen_random_uuid()`                                                        |
| 6.4.1 | Secrets management solution | Accepted | `.env` mode 600 on one VPS (runbook); a vault is out of proportion. Owner: check the mode.        |
| 6.4.2 | Key material not exposed    | Pass     | Secrets absent from the web image and client bundle (pentest/05-web.sh, image grep in the report) |
| —     | Secret strength enforced    | **Fail** | `JWT_SECRET` only non-empty `apps/api/src/config/env.ts:86` → #182                                |

N/A: 6.1.x data classification encryption at rest (Owner: disk / backup encryption), 6.2.3–6.2.8 (no custom encryption).

## V7 Error handling and logging

| #     | Requirement (short)                      | Status  | Evidence                                                                                                                                                                                                    |
| ----- | ---------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1.1 | No credentials or session tokens in logs | Pass    | Redaction `apps/api/src/config/logger.ts:81`–`:87`; after a full run: 0 password, cookie, `authorization`, `fin_pat_` occurrences in the API logs                                                           |
| 7.1.2 | No other sensitive data in logs          | Pass    | Labels, amounts, DB bound values kept out (`apps/api/src/common/logging/safe-error.ts:168`); request logs and error log paths keep no query string (`apps/api/src/config/logger.ts`, fixed by #181, was F9) |
| 7.1.3 | Security-relevant events logged          | Partial | Every 4xx at `warn` with path, status, request id (`all-exceptions.filter.ts`); token calls audited (`access_token_audit`); no dedicated sign-in success / failure event                                    |
| 7.1.4 | Log entries carry the needed metadata    | Pass    | Time, request id, client IP, method, URL, status                                                                                                                                                            |
| 7.2.2 | Access-control failures logged           | Pass    | 401 / 403 at `warn`                                                                                                                                                                                         |
| 7.3.1 | Log injection prevented                  | Pass    | JSON lines (pino); client `X-Request-Id` accepted as is (no format check) → #183                                                                                                                            |
| 7.4.1 | Generic error message with a support id  | Pass    | 500 body `Internal server error` + `requestId` `apps/api/src/common/filters/all-exceptions.filter.ts:111`                                                                                                   |
| 7.4.2 | Exception handling throughout            | Partial | Global filter; a 5 000-level JSON body ends in a stack overflow → 500 (pentest/04-input.sh) → #182                                                                                                          |
| 7.4.3 | Last-resort handler                      | Pass    | `@Catch()` filter, `APP_FILTER`                                                                                                                                                                             |

N/A: 7.3.3 / 7.3.4 (log integrity and time sync: Owner, Docker json-file on the VPS).

## V8 Data protection

| #     | Requirement (short)                         | Status  | Evidence                                                                                                                                                     |
| ----- | ------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 8.1.1 | Sensitive data not cached by intermediaries | Pass    | `no-store` on the API `apps/api/src/common/http/no-store.ts:11`, on pages and proxy `apps/web/src/lib/cache-policy.ts:39`                                    |
| 8.1.2 | Cached copies purged                        | Pass    | `Clear-Site-Data: "cache"` on logout                                                                                                                         |
| 8.1.4 | Abnormal request volumes detected / limited | Partial | Throttling per IP and per token; unbounded proxy body buffering → #173                                                                                       |
| 8.2.1 | Anti-caching headers                        | Pass    | As 8.1.1                                                                                                                                                     |
| 8.2.2 | No sensitive data in browser storage        | Pass    | Service-worker precache = `/assets/*` + shell files only (pentest/05-web.sh, `apps/web/src/sw/routing.ts`); `localStorage` holds a snooze date and the theme |
| 8.2.3 | Authenticated data cleared after logout     | Pass    | `Clear-Site-Data`, `no-store`, no runtime caching                                                                                                            |
| 8.3.1 | Sensitive data in body or headers, not URLs | Partial | Writes in bodies; read filters and the search text in query strings (no longer logged since #181)                                                            |
| 8.3.2 | Users can delete / export their data        | Pass    | Account deletion; month report CSV                                                                                                                           |
| 8.3.4 | Sensitive data identified and handled       | Pass    | CLAUDE.md Privacy rules; ADR 0002                                                                                                                            |
| 8.3.7 | Data encrypted where required               | Owner   | Backups encrypted by restic; volume encryption of the VPS                                                                                                    |

## V9 Communications

| #     | Requirement (short)                  | Status   | Evidence                                                                                                 |
| ----- | ------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------- |
| 9.1.1 | TLS for all client connections       | Pass     | Caddy, `*.gbodin.cloud`, HSTS `includeSubDomains` (`infra/caddy/Caddyfile`); Owner: verify on the server |
| 9.1.2 | Strong cipher suites                 | Owner    | Caddy defaults; check with `testssl.sh` over the tailnet                                                 |
| 9.1.3 | TLS 1.2+ only                        | Owner    | As 9.1.2                                                                                                 |
| 9.2.1 | Outbound connections use trusted TLS | Pass     | `https://` defaults for CoinGecko, mempool.space, publicnode; Node verifies certificates                 |
| 9.2.2 | Encrypted internal connections       | Accepted | As 1.9.1                                                                                                 |

## V10 Malicious code

| #      | Requirement (short)         | Status | Evidence                                                                                                |
| ------ | --------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| 10.3.2 | Dependencies vetted, pinned | Pass   | Lockfile, `pnpm audit --prod` gate, Dependabot, SHA-pinned actions, base images by digest (SECURITY.md) |
| 10.3.3 | No subdomain takeover       | Owner  | DNS records of `gbodin.cloud` at Cloudflare point only at live tailnet hosts                            |

## V11 Business logic

| #      | Requirement (short)             | Status | Evidence                                                                  |
| ------ | ------------------------------- | ------ | ------------------------------------------------------------------------- |
| 11.1.1 | Steps processed in order        | Pass   | Imports: preview, then commit; month close: computed steps, then close    |
| 11.1.2 | Rate limits on business actions | Pass   | Wallet sync ≤ every 30 s, valuations batched, 20 tokens max, passkeys max |
| 11.1.4 | Anti-automation                 | Pass   | Global 60 / min / IP; tighter on auth                                     |

## V12 Files and resources

| #      | Requirement (short)                       | Status  | Evidence                                                                                                                              |
| ------ | ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 12.1.1 | Large files refused                       | Partial | API: 5 MB, one file, 10 fields `apps/api/src/imports/upload/multipart.ts:14`–`:27` (413); the web proxy buffers any size first → #173 |
| 12.1.2 | Compressed files checked                  | N/A     | No archive input; request bodies are not decompressed                                                                                 |
| 12.1.3 | Per-user quota                            | Pass    | Pending previews expire after 24 h; one owner                                                                                         |
| 12.2.1 | File content matches the expected type    | Pass    | Header detection, random binary → 400 without echoing contents (pentest/04-input.sh)                                                  |
| 12.3.1 | File names not used for paths             | Pass    | Kept in memory and as a DB column only                                                                                                |
| 12.5.1 | Web tier serves only expected files       | Pass    | Nitro serves `public/`; probes 404                                                                                                    |
| 12.6.1 | Outbound requests to allow-listed targets | Pass    | As 5.2.6                                                                                                                              |

N/A: 12.3.2–12.3.6, 12.4.x (no file storage), 12.5.2 (uploads never served).

## V13 API

| #      | Requirement (short)                   | Status  | Evidence                                                                                      |
| ------ | ------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| 13.1.3 | No secrets in URLs                    | Pass    | Tokens in headers, reset tokens in POST bodies (the emailed link carries it to the page only) |
| 13.1.4 | Authorisation per URI and resource    | Pass    | Guard per controller / route                                                                  |
| 13.2.1 | Only valid HTTP methods               | Pass    | Undeclared methods 404; `TRACE` not echoed                                                    |
| 13.2.2 | JSON schema / DTO validation          | Pass    | As 5.1.3                                                                                      |
| 13.2.3 | CSRF protection for cookie-based APIs | Partial | → #179                                                                                        |
| 13.2.5 | Content type checked                  | Partial | `text/plain` bodies reach DTO validation and fail (400); bodiless routes accept them → #179   |

## V14 Configuration

| #      | Requirement (short)                   | Status   | Evidence                                                                                                                                                                    |
| ------ | ------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14.1.1 | Secure, repeatable build              | Pass     | Multi-stage Dockerfiles, CI, `release.yml`                                                                                                                                  |
| 14.1.3 | Server configuration hardened         | Partial  | Non-root `node`, no package manager, no published ports, no privileged mode; no read-only FS, capabilities kept, no memory limit → #183                                     |
| 14.1.4 | Automated deployment                  | Pass     | `deploy/deploy.sh` with health check and rollback                                                                                                                           |
| 14.2.1 | Components up to date                 | Pass     | Audit allow-list empty after #164 / #166 / #167                                                                                                                             |
| 14.2.2 | Unneeded features removed             | Pass     | Swagger UI and live spec served outside production only `apps/api/src/config/swagger.ts` (fixed by #180, was F8)                                                            |
| 14.2.3 | SRI for third-party assets            | Accepted | Only Google Fonts CSS (dynamic, no SRI possible); self-host if CSP work (#174) makes it easier                                                                              |
| 14.2.6 | Sandboxing / attack-surface reduction | Partial  | → #183                                                                                                                                                                      |
| 14.3.2 | Debug modes off in production         | Pass     | `NODE_ENV=production` in the image; no source maps served (pentest/05-web.sh)                                                                                               |
| 14.3.3 | No version-revealing headers          | Pass     | No `X-Powered-By` from the apps; Caddy strips `Server`, `Via`, `X-Powered-By`                                                                                               |
| 14.4.1 | `Content-Type` with charset           | Pass     | JSON and HTML responses                                                                                                                                                     |
| 14.4.3 | Content-Security-Policy               | Pass     | API: helmet CSP `apps/api/src/main.ts:52`; pages: `script-src` by nonce and hashes, no `unsafe-*` for scripts (`apps/web/src/lib/security-headers.ts`, #174)                |
| 14.4.4 | `X-Content-Type-Options: nosniff`     | Pass     | helmet (API), Caddy `?X-Content-Type-Options` (pages)                                                                                                                       |
| 14.4.5 | HSTS                                  | Pass     | Caddy, 1 year, `includeSubDomains`                                                                                                                                          |
| 14.4.6 | Referrer-Policy                       | Pass     | helmet `no-referrer` (API), Caddy `strict-origin-when-cross-origin` (pages)                                                                                                 |
| 14.4.7 | Framing restricted                    | Pass     | Pages and offline page: `frame-ancestors 'none'` + `X-Frame-Options: DENY` (#174); API: helmet                                                                              |
| 14.5.2 | `Origin` not used for authentication  | Pass     | Not used                                                                                                                                                                    |
| 14.5.3 | CORS allow-list                       | Pass     | `origin: env.APP_URL` `apps/api/src/main.ts:98`; a foreign preflight gets the app origin back                                                                               |
| 14.5.4 | Proxy-added headers authenticated     | Partial  | `X-Forwarded-For` believed only from `TRUSTED_PROXIES` (spoofing through an untrusting proxy has no effect); default trusts every private peer of the shared network → #183 |

## Summary

| Status   | Count (rows above) |
| -------- | ------------------ |
| Pass     | 108                |
| Fail     | 15                 |
| Partial  | 15                 |
| Accepted | 9                  |
| Owner    | 4                  |
| N/A      | 2                  |

Every Fail and Partial points to one of the issues #173–#183 (report §2), except 7.1.3: a dedicated sign-in event log is left as a suggestion for #78, when sign-ins can come from outside the tailnet. None is critical or high.
