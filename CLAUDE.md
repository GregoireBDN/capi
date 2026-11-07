# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. Read the **Domain rules** and **Workflow conventions** sections before touching any import, transaction or stats code.

## Product vision

**Finances** is a single-user, self-hosted personal finance tracker. The owner imports bank CSV exports and statements; transactions are parsed, deduplicated, normalized and categorized automatically. Dashboards show:

- all accounts and net worth;
- monthly income, expenses and savings;
- budget vs target per category;
- subscriptions and fixed costs (auto-detected recurring transactions);
- savings and investments (PEA, life insurance, employee savings, crypto);
- an end-of-month forecast.

It is prototyped locally first, then deployed on a VPS and used from the phone as a PWA, ideally reachable only through Tailscale. There is exactly one user: no public sign-up, no multi-tenancy, no third-party analytics.

## Domain rules

These rules are non-negotiable. Code, tests and reviews must enforce them.

### Money and dates

- Money is stored as **integer cents** (`bigint` / `integer` columns), never as floats. Currency is **EUR**.
- Parse amounts from strings directly into cents (e.g. `"1 234,56"` → `123456`); never go through `parseFloat`. Convert to a decimal representation only at the display edge (e.g. `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`).
- Transaction dates are **calendar dates** (`date` columns / `YYYY-MM-DD` strings), not timestamps. Never shift them through a time zone conversion.
- The app time zone is **Europe/Paris**. Anything that depends on "today" or "this month" (month boundaries, forecasts) is computed in Europe/Paris.

### Transactions

- Every transaction has a `kind`: `expense`, `income` or `transfer`.
- Moves between the user's own accounts (e.g. checking → Livret A, checking → PEA) are `transfer` and must **never** count as income or expense in any statistic, budget or forecast.

### Accounts

- Account types: `checking`, `savings`, `brokerage` (PEA), `life_insurance`, `employee_savings`, `crypto`.
- **Transactional accounts** (checking, savings) are fed by imports; their balance comes from transactions.
- **Investment accounts** (brokerage, life_insurance, employee_savings, crypto) are tracked by **dated value snapshots**. For crypto, the value can also be derived from holdings × price.

### Crypto prices

- Crypto accounts hold **holdings** (`crypto_holdings`: asset, location label such as a wallet or exchange, quantity, optional invested cents). Quantities (`numeric(38, 18)`) and EUR prices (`numeric(38, 12)`) are **exact decimal strings** handled with the BigInt helper in `apps/api/src/crypto/decimal.ts`; never `parseFloat` them. Value = round half to even of quantity × price, in cents.
- Prices come from a key-less public API (CoinGecko `simple/price`, behind the `PriceProvider` interface), **server-side only**, all assets batched in one request, cached in `crypto_prices` for `PRICE_CACHE_TTL_SECONDS` (default 600) and kept as last known price when the API fails (flagged stale, never a 500). `PRICE_API_ENABLED=false` disables it: only manual prices (`PUT /api/crypto/prices/:assetId`) are used.
- **Privacy**: the price API only receives asset ids (and the asset search text), never quantities or values. Never log quantities, prices × quantities or values.
- Valuing an account upserts **today's** `balance_snapshot` (Europe/Paris), so balances and net worth use the normal snapshot path; there is no separate crypto net-worth path.

### CIC CSV import format

The first supported bank is CIC. Its CSV export:

- uses `;` as separator;
- is encoded in **Windows-1252** (decode explicitly, do not assume UTF-8);
- uses a comma as decimal separator;
- uses `dd/mm/yyyy` dates;
- has the columns `Date` / `Date de valeur` / `Débit` / `Crédit` / `Libellé` / `Solde`, where `Solde` is the running balance after the row.

The running balance is used to **check continuity** (previous balance + amount = new balance, within a file and across imports) and to rank probable duplicates between sources; it is not part of the dedupe hash.

### Imports

- Imports are **idempotent**: re-importing a file, or a file whose period overlaps a previous import, must not create duplicates.
- Legitimate identical transactions on the same day (same date, amount and label, e.g. two identical card payments) must be **kept**. The dedupe hash includes an occurrence index among identical (date, amount, normalized label) rows in file order, so they stay distinct and a re-imported file still matches. Rows from different sources (e.g. the spreadsheet history vs a CSV export) are compared by a fuzzy probable-duplicate check and shown as conflicts in the preview, never dropped automatically. See `apps/api/src/imports/dedupe/dedupe.ts`.
- Every import goes through a **preview** (new / duplicate / conflicting rows, continuity check) before it is committed. Nothing is written until the user confirms.

### Spreadsheet history import (one-shot)

The owner's pre-app history (a Google Sheet, ~3,250 categorized rows since 07/2023) is imported once from its CSV exports with `pnpm --filter @finances/api import:history` (code in `apps/api/src/imports/history/`, entry `apps/api/src/database/import-history.ts`; `node dist/database/import-history.js` where `tsx` is missing).

- **Dry run by default**: everything runs in one DB transaction that is rolled back unless `--commit` is passed. It prints counts only; `--report <path>` writes a detailed JSON report (merchant keys, line numbers, conflicts) and refuses any path inside the repo outside `data/`.
- **Inputs**: `Transactions` tab (`Date,Mois,Compte,Libellé,Montant (€),Catégorie,Groupe,Relevé,Ponctuel`, UTF-8, `,`-separated, `-1 234,56 €` amounts) and optionally the `Soldes` tab (`Fin de mois` + one column per account) → `balance_snapshots` on the last day of each month, upserted on (account, date). Columns are matched by name; bad rows are reported, never fatal.
- **Mapping** (`history/mapping.ts`): sheet category slugs → seeded slugs; the kind comes from `Groupe` (`Mouvement` → transfer, `Revenu` → income, `Dépense` → expense) and wins over the category's kind. Unknown/ambiguous slugs (`paypal`, `virement_emis` outside `Mouvement`, ...) get no or a best-effort category and `needsReview = true`. Account codes `CC`/`LA`/`LJ` → Compte courant / Livret A / Livret Jeune (found by name or created, institution CIC); override with `--accounts <file.json>` and `--categories <file.json>`.
- **Dedupe**: same hashes as bank imports (`computeDedupeHashes`, `classifyRows`), so a re-run inserts nothing. Probable duplicates of rows from another source (CIC CSV) are conflicts: counted and **not inserted** unless `--include-conflicts` (then flagged for review). One `imports` row (`source = 'spreadsheet'`) per account that received rows.
- **Rules**: merchants seen ≥ 3 times and ≥ 90 % in one category and kind get a proposed `contains` rule on their merchant key (skipped when an existing rule already covers them or the pattern would also catch rows filed differently); created at the end of the rule order only with `--create-rules`.

### Categorization

- Categories are assigned by **ordered rules** first (first matching rule wins).
- Uncategorized or flagged transactions go to a **review queue**.
- Correcting a category can create a new rule, so similar transactions are categorized automatically next time.

### Privacy

- **No real financial data** in the repo, tests, fixtures, issues, PRs or logs. Use only anonymized or synthetic fixtures (fake labels, amounts and account numbers).
- Real bank exports live in the git-ignored `data/` folder at the repo root. Never commit it and never paste its contents anywhere.
- Do not log transaction labels, amounts or balances.
- **No third-party analytics or tracking**, on the API or on the web app.

## Workflow conventions

- **GitHub Flow**: `main` is always deployable. Never commit or push directly to `main`. Branch protection is not available on this plan, so this is a rule, not a setting.
- One short-lived branch per issue, named `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `chore/<issue>-<slug>` or `docs/<issue>-<slug>` (e.g. `feat/12-cic-csv-parser`).
- **Conventional commits in English**, scoped by app or package when relevant: `feat(api): ...`, `fix(web): ...`, `docs: ...`, `chore(ci): ...`.
- PR descriptions follow `.github/pull_request_template.md` and contain `Closes #<issue>`.
- CI (lint, types, tests, build) must be green before merging. Merge with **squash merge**.
- Releases are git tags `vX.Y.Z`.
- Issues use the templates in `.github/ISSUE_TEMPLATE/` (feature, bug, chore — each with Context / Scope / Acceptance criteria / Out of scope), get a type label (`feat`, `fix`, `chore`, `docs`) plus an `area:*` label, and belong to a milestone:
  - **M1** Foundations
  - **M2** Import
  - **M3** Transactions & Dashboard
  - **M4** Subscriptions & Savings
  - **M5** Mobile (PWA)
  - **M6** Deployment
- **Tests are required** for import, parsing, deduplication and categorization logic, using anonymized fixtures only.

## Monorepo structure

pnpm + Turborepo monorepo with three apps and three shared packages:

- `apps/api` — NestJS backend (Fastify adapter), port 4000, all routes prefixed with `/api`
- `apps/web` — React 19 + TanStack Start (SSR), port 3000
- `apps/ui-docs` — Storybook v9 for the `@finances/ui` component library, port 6006
- `packages/shared` — `@finances/shared`, shared Zod schemas used by both apps
- `packages/ui` — `@finances/ui`, the Radix + Tailwind component library consumed by `apps/web` and documented by `apps/ui-docs`
- `packages/config-typescript` — shared TypeScript configs (`base.json`, `nestjs.json`, `react.json`)

## Commands

```bash
# From repo root — runs all apps via Turborepo
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm check-types
pnpm generate        # regenerate OpenAPI spec + typed web client (see "Typed API client")

# Scoped to a single app
pnpm --filter @finances/api dev
pnpm --filter @finances/web dev
pnpm --filter @finances/ui-docs dev   # Storybook

# Database (root shortcuts for the @finances/api scripts)
pnpm db:generate   # generate Drizzle migrations
pnpm db:migrate    # apply migrations
pnpm db:seed       # seed reference data (default categories); idempotent, safe to re-run
pnpm db:studio     # Drizzle Studio

# Run a single web test
cd apps/web && pnpm vitest run src/path/to/test.ts

# Run a single API test
cd apps/api && pnpm vitest run src/auth/auth.service.spec.ts
```

Pre-commit hook runs `lint-staged`: ESLint + Prettier on `.ts`/`.tsx`, Prettier on JSON/MD/YAML.

**Testing note**: both apps use **Vitest**. The API's `vitest.config.ts` runs in a Node environment and picks up `src/**/*.spec.ts`; use `pnpm --filter @finances/api test` (or the single-file form above). The web app uses Vitest + Testing Library (`jsdom`), plus Playwright for E2E (`pnpm --filter @finances/web test:e2e`).

**Test database**: API specs never touch the app database. `apps/api/vitest.config.ts` gives the workers `DATABASE_URL` = `TEST_DATABASE_URL`, or the app database name + `_test` (`finances` → `finances_test`), and refuses to run if both point at the same database. Its global setup (`apps/api/vitest.test-database.ts`) creates that database if missing and applies the migrations, so Postgres must be running (`docker compose up -d`). Database specs run inside transactions that are rolled back; never connect them to another URL. When running servers by hand for manual checks, use a throwaway database too (e.g. `createdb finances_scratch`), never `finances`.

## Typed API client (codegen pipeline)

The web app talks to the API through a **generated, type-safe client** — do not hand-write fetch calls or edit the generated output.

1. `apps/api` generates `apps/api/openapi.json` via `pnpm --filter @finances/api generate` (`src/generate-spec.ts` boots the Nest app in-memory and dumps the Swagger document).
2. `apps/web` consumes that spec via `@hey-api/openapi-ts` (`apps/web/openapi-ts.config.ts`), emitting a typed fetch client into `apps/web/src/api/` (`client.gen.ts`, `sdk.gen.ts`, `types.gen.ts`).
3. Turborepo's `generate` task chains these, so `pnpm generate` from the root runs API spec generation before web client generation. `build` and `check-types` depend on `generate`.

`apps/web/src/api/` is **generated** — regenerate it (`pnpm generate`) after changing API DTOs/controllers rather than editing it by hand. Annotate API endpoints with `@nestjs/swagger` decorators (`@ApiBody`, `@ApiOkResponse`, `@ApiTags`, etc.) so they surface correctly in the generated client.

## API architecture (NestJS)

Standard NestJS module structure: each domain has a `*.module.ts`, `*.controller.ts`, `*.service.ts` and `*.schema.ts` (Drizzle tables). Base modules: `Auth`, `User`, `Email`, `Database`, `Health`. Finance domains (accounts, imports, transactions, categories, budgets, snapshots, ...) follow the same layout, one module per domain.

**Database**: `DatabaseService` exposes `db` (a Drizzle `PostgresJsDatabase`). All tables extend `coreColumns` from `apps/api/src/database/schema/core.schema.ts`, which adds `id` (UUID PK), `createdAt` and `updatedAt`. Export every schema from `apps/api/src/database/schema/index.ts` and import from there. Money columns are integer cents and transaction dates are `date` columns (see Domain rules).

**Seed data**: `pnpm db:seed` runs `apps/api/src/database/seed.ts`. The default categories (English snake_case `slug`, French display `name`, `kind` = group, hex `color`) live in `apps/api/src/categories/default-categories.ts`; `seedDefaultCategories` inserts the missing slugs with `ON CONFLICT (slug) DO NOTHING`, so it is idempotent and never overwrites a category the user renamed or recoloured. Rules and imports should reference categories by `slug`, never by display name. Where `tsx` is not installed (production image), run the compiled script instead: `node dist/database/seed.js` from `apps/api`.

**Auth (single user)**: password auth only — no OAuth. The owner account is created through the normal sign-up form on first launch; as soon as one user exists, `POST /api/auth/register` returns 403 (re-checked under a Postgres advisory lock so concurrent sign-ups can't create a second account) and `GET /api/auth/registration-status` returns `{ open: false }`, which the web app uses to hide sign-up. Email verification (`verify-email`, `resend-verification`) is kept. Cookie-based JWT (`httpOnly`, `sameSite: lax`, `Secure` in production): the `token` cookie holds a short-lived (15 min) access JWT, and a rotating `refresh_token` cookie (path `/`, 30 days) renews it via `POST /api/auth/refresh`; presenting an already-rotated refresh token revokes the whole family (reuse detection). **The browser never calls the API origin directly**: the web server proxies `/api/*` to the API (see Web architecture), so both cookies are first-party to the web origin. `refresh_token` is scoped to `/` (not `/api/auth`) so page requests carry it to the web SSR guard, which renews an expired access token server-side; the API also clears any leftover cookie at the old `/api/auth` path whenever it sets or clears the session. Passwords are hashed with `bcryptjs`; password reset goes through `forgot-password` / `reset-password` (tokens handled in `apps/api/src/email/tokens.ts`). Use `@UseGuards(JwtGuard)` on every non-public route — `JwtGuard` verifies the cookie and attaches `{ sub: userId }` to `request.user`; read it with the `@CurrentUser()` decorator (`apps/api/src/auth/decorators/`).

**Email**: `EmailModule` renders React Email templates (`apps/api/src/email/templates/*.tsx`) to HTML via `react-email` and sends them with `nodemailer` over SMTP (used for password reset). In dev, SMTP points at **Mailpit** (`localhost:1025`, web UI at `localhost:8025`) started by `docker compose`.

**Health**: `HealthModule` exposes `GET /api/health` (Terminus), checking the database and SMTP. The production compose healthcheck relies on it.

**Path alias**: `#/*` resolves to `./src/*` in both the API and web apps.

## Web architecture (TanStack Start)

File-based routing via TanStack Router — routes live in `apps/web/src/routes/`. `routeTree.gen.ts` is auto-generated; never edit it manually. The root layout is `routes/__root.tsx`.

**UI components**: live in the shared `@finances/ui` package (`packages/ui/src/components/`), Radix UI primitives styled with Tailwind CSS v4. Import them from `@finances/ui`. Use the `cn()` helper (`@finances/ui/lib/utils`, clsx + tailwind-merge) for class merging. App-specific composite components stay under `apps/web/src/components/`.

**Auth state**: client auth context in `apps/web/src/lib/auth-context.tsx`; theme via `apps/web/src/lib/use-theme.ts`.

**API access (same-origin proxy)**: the server route `routes/api/$.ts` (`lib/api-proxy.ts`) forwards every `/api/*` request to `API_URL` (runtime env, default `http://localhost:4000`; `http://api:4000` in the production compose), in dev and in production alike. In the browser the generated client uses a relative base URL (`/api/...` on the web origin, `lib/api-client.ts`); server-side code (SSR, server functions) calls `API_URL` directly (`serverApiUrl()` / `withServerCookies()` in `lib/server-api.ts`). Don't point the browser at the API origin: the session cookies must stay on the web origin for the SSR guard to see them.

**Client IP (trusted proxies)**: per-IP rate limits and request logs use the real client IP. The proxy rebuilds `X-Forwarded-For` with only the client IP (`lib/client-ip.ts`): the incoming header is believed only when the TCP peer is in `TRUSTED_PROXIES` (Caddy in production), otherwise the socket address is used. The API sets Fastify `trustProxy` from its own `TRUSTED_PROXIES` (`apps/api/src/config/trusted-proxies.ts`), so it believes the header only from `web`. Both default to `loopback,uniquelocal` (localhost in dev, private Docker ranges in production; `none` trusts no one), which is only safe because no port of the production stack is published: never publish the API port. A client sending its own `X-Forwarded-For` can't leave its rate-limit bucket (`trust-proxy.spec.ts`, `client-ip.test.ts`). SSR calls made by the web server itself (loaders, the deduplicated refresh) carry no client IP and count against the web server's address.

**SSR session renewal**: `getMe` (`lib/auth.ts`) resolves the user with `resolveServerSession` (`lib/server-session.ts`): with a valid `token` it just calls `/api/auth/me`; when the access token is missing/expired and a `refresh_token` is present it calls `POST /api/auth/refresh` server-side, appends the rotated `Set-Cookie` headers to the page response, and makes later loaders in the same request use the new cookies. Refreshes are deduplicated per refresh token inside the web process (in-flight calls share one rotation, and a successful one is replayed for 10 s), and the proxied `POST /api/auth/refresh` goes through the same path, so concurrent reloads/tabs or a client refresh racing a reload never trip the API's reuse detection. This assumes a single web instance; the API's rotation and reuse detection are unchanged.

**Authenticated layout**: every signed-in page lives under the pathless layout route `routes/_app.tsx` (files in `routes/_app/`). Its `beforeLoad` guard (`requireUser` in `apps/web/src/lib/auth-guard.ts`) redirects anonymous visitors to `/auth` during SSR, before any protected markup renders (after trying to renew an expired access token, see SSR session renewal), and exposes `user` through the route context. The shell (`apps/web/src/components/app-shell/`) is the `@finances/ui` sidebar (a sheet below `md`, opened from a top bar); add a section by creating `routes/_app/<name>.tsx` and an entry in `app-shell/nav-items.ts`. `/` only redirects (dashboard or login); there is no public landing page.

**Styling**: Tailwind CSS v4 via `@tailwindcss/vite`. Global styles in `apps/web/src/globals.css`; shared design tokens come from `@finances/ui/globals.css`. Theme (light/dark/auto) is initialized via an inline script in `__root.tsx` before hydration to avoid a flash.

**Mobile**: the app is mainly used from the phone — design mobile-first. It is installable as a PWA (see below); `viewport-fit=cover` is set, and `body` is padded with `env(safe-area-inset-*)` in `globals.css`.

**Mobile layout conventions** (remember the 22px root: `rem` is ~1.4× the usual, while media-query breakpoints stay in 16px units, so `md` is still 768px):

- **Touch targets ≥ 44×44 px.** The `touch-hitbox` utility (`@finances/ui/globals.css`) grows a small, positioned control's hit area with an invisible `::after`; `Button`, `Toggle`, `AlertAction` and chart data `summary`s use it on `pointer: coarse`, `Checkbox`/`Switch`/`RadioGroupItem` always; dropdown items and `size="sm"` native selects are 44px high on touch screens. Keep adjacent targets far enough apart that their hit areas don't overlap (e.g. `min-h-11` rows for radios).
- **No horizontal page scroll down to 320px.** Amounts never break inside (`whitespace-nowrap`); in list rows the amounts go under the label when both don't fit (`flex-wrap`, label `min-w-[7rem] flex-1`, amounts `ml-auto`). Button labels wrap rather than overflow. KPI tiles size their value on the tile (`@container` + `cqi`). Genuinely tabular data scrolls inside its card: `Table` shows a fade on the clipped edge and becomes focusable.
- **One-hand use.** Primary actions sit in sticky bottom bars (`bottom-[calc(1rem+env(safe-area-inset-bottom))]`), kept to one sideways-scrolling row on short screens with the `short-screen:` variant (≤ 600px tall, `apps/web/src/globals.css`); editors open as bottom sheets on phones. The mobile top bar is `h-12`: sticky headers under it use `top-12`.
- **Safe areas and keyboard.** `Sheet` pads its edge-to-edge sides with `env(safe-area-inset-*)`, the fixed sidebar (≥ md, e.g. a phone in landscape) is offset from the notch, toasts are offset too. Bottom sheets follow the on-screen keyboard through `--keyboard-inset` (visual viewport, iOS) and `interactive-widget=resizes-content` (Android); size them with `max-h-[calc(90svh-var(--keyboard-inset,0px))]`.
- **Audit.** `apps/web/e2e/mobile-layout.spec.ts` (run with `playwright.mobile.config.ts`, never in CI) visits every page at 320/375/390/412/414px and 844×390 in light and dark, and fails on horizontal scroll, hit areas < 44px, form fonts < 16px and text sticking out of its box. It needs a running stack on a throwaway database with data and the owner's credentials in `MOBILE_AUDIT_EMAIL`/`MOBILE_AUDIT_PASSWORD`; the API's global rate limit (60 requests/min per IP) throttles a full run, so run it a page or project at a time (`-g`, `--project`) or against a throwaway API instance whose limit is raised.

### PWA

- **Manifest** `apps/web/public/manifest.json` (`start_url: /dashboard`, shortcuts to Tableau de bord / Opérations / À revoir / Import), linked from `__root.tsx` with the iOS meta tags and light/dark `theme-color` (light `--background` `#f4f7fc`, dark `#090c1a`; update them, the manifest and `offline.html` together if the theme changes).
- **Icons** (`public/icons/*.png`, `public/favicon.ico`) are generated from `public/logo.svg` by `pnpm --filter @finances/web icons` (`apps/web/scripts/generate-icons.mjs`, `sharp`) and committed; re-run it when the logo changes.
- **Service worker**: a small hand-written worker (`src/sw/worker/service-worker.ts`, decisions in `src/sw/routing.ts`, unit tested), bundled into `/sw.js` by the Vite plugin `apps/web/plugins/service-worker.ts` in **production client builds only** (not `vite dev`), and registered by `components/pwa/ServiceWorkerUpdates.tsx` only when `import.meta.env.PROD` and on a secure context (HTTPS or localhost). `vite-plugin-pwa` was not used: the plugin only touches the client environment, so the Nitro SSR bundle and the `/api` server route are unaffected.
  - **Cached** (precache, cache-first): the hashed client assets (JS/CSS) of the build and the shell files listed in `src/sw/precache.ts` (`offline.html`, manifest, icons, favicon, logo). The cache is named `finances-shell-<content hash>`; a new build gets a new name and older caches are deleted when it activates.
  - **Never cached**: `/api/*` (not even intercepted), non-GET and cross-origin requests (Google Fonts included), any other same-origin URL, and server-rendered pages: navigations go network-first and fall back to the static `offline.html` ("Hors ligne", no data) only when the network fails. Requests made by the worker carry no cookies. So nothing sensitive is ever in Cache Storage, before or after logout. Keep it that way: do not add runtime caching of pages or API responses.
  - **Updates**: a new worker waits; the app shows a "Nouvelle version disponible" toast and, on "Recharger", the worker skips waiting and open pages reload. Waiting (rather than `skipWaiting` on install) keeps an open old page from lazy-loading chunks that the new deploy no longer serves. Installed apps re-check for updates when brought back to the foreground (at most hourly).
- **HTTP cache policy**: the API sends `Cache-Control: no-store` (+ `Pragma: no-cache`, `Expires: 0`) on every `/api` response (`onSend` hook, `apps/api/src/common/http/no-store.ts`). On the web server, a global request middleware in `apps/web/src/start.ts` applies `lib/cache-policy.ts` to everything the Start handler answers: `/api/*` (proxy) gets the same headers, every page and server function (signed-in pages, `/auth`, `/`, redirects, errors) gets `private, no-store`, so nothing private lands in the HTTP or back/forward cache. Static files are served by Nitro before that handler: `/assets/*` keeps `public, max-age=31536000, immutable`, `sw.js` and `manifest.json` get `no-cache` (Nitro `routeRules` in `vite.config.ts`) so deploys are picked up. Logout answers `Clear-Site-Data: "cache"` only: `"storage"` would unregister the service worker and wipe its non-sensitive shell cache and the theme preference, and the session cookies are already cleared explicitly. `src/start.ts` replaces Start's default request middleware, so it restates the CSRF middleware for server functions: keep it.
- **Testing**: unit tests cover the routing/precache logic. To check the worker itself, `pnpm --filter @finances/web build` and run `node .output/server/index.mjs` against a throwaway database, open `http://localhost:3000` (secure context), then in DevTools > Application inspect the manifest, the service worker and Cache Storage (only `finances-shell-*` with `/assets/*` and shell files), and tick "Offline" to see the offline page.

## Component library (`@finances/ui` + `apps/ui-docs`)

`packages/ui` is the single source of truth for primitives. It exports components individually (`@finances/ui/components/*`), the barrel (`@finances/ui`), `./globals.css` and `./lib/utils`. `apps/ui-docs` is a Storybook v9 (react-vite) instance documenting these components, with `@storybook/addon-vitest` for component tests (`pnpm --filter @finances/ui-docs test-storybook`). When adding or changing a primitive, update it in `packages/ui` (not `apps/web`) and add or adjust its story in `apps/ui-docs`.

## Containerisation

```bash
# Dev — starts PostgreSQL + Mailpit (apps run on the host)
docker compose up -d

# Production — builds and starts all services
docker compose -f docker-compose.prod.yml up --build -d
```

`docker-compose.yml` exposes PostgreSQL on `localhost:5432` and Mailpit (SMTP `localhost:1025`, UI `localhost:8025`) with credentials matching the defaults in `apps/api/.env.example`.

`docker-compose.prod.yml` expects these variables (from a root `.env` file or the shell environment): `POSTGRES_USER`, `POSTGRES_PASSWORD`, optionally `POSTGRES_DB`, `JWT_SECRET`, `APP_URL` (the public web origin, used in email links and as the CORS origin), and the SMTP configuration.

The browser only talks to the `web` service: it proxies `/api/*` to the `api` service (`API_URL=http://api:4000`, set in the compose file) and calls it directly during SSR. A future reverse proxy (Caddy) in front of the stack should forward everything, `/api` included, to `web`; routing `/api` straight to `api` would also work but would bypass the web process's refresh deduplication for client-side refreshes.

The Dockerfiles (`apps/api/Dockerfile`, `apps/web/Dockerfile`) use multi-stage builds with the monorepo root as context. The API uses `pnpm deploy --prod` to produce a slim image. The web image copies only the Nitro `.output/` directory (self-contained SSR bundle).

Target deployment (M6): a VPS running the production compose stack, reachable only through Tailscale. The hosting decisions (Compose per app + one server-level Caddy on a shared `proxy` network, server config in a separate `infra` repo, own domain on the tailnet, one Postgres per app, GHCR images, deploys over Tailscale, restic backups) are in [`docs/adr/0001-multi-app-hosting.md`](docs/adr/0001-multi-app-hosting.md).

## Environment setup (API)

Copy `apps/api/.env.example` to `apps/api/.env` and fill in:

- `DATABASE_URL` — PostgreSQL connection string (default targets the dev Docker container)
- `JWT_SECRET` — JWT signing secret
- `APP_URL` — web app origin (default: `http://localhost:3000`), used in email links and as the CORS origin
- `TRUSTED_PROXIES` — peers allowed to set the client IP through `X-Forwarded-For` (default `loopback,uniquelocal`, see Client IP)

The web app reads two runtime variables (see `apps/web/.env.example`), never exposed to the browser: `API_URL`, the API origin as reached from the web server (default `http://localhost:4000`), and `TRUSTED_PROXIES` (see Client IP).

- SMTP config (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`) — defaults target the dev Mailpit container
- Crypto prices (`PRICE_API_ENABLED`, `PRICE_API_URL`, `PRICE_CACHE_TTL_SECONDS`) — default to the CoinGecko public API with a 10-minute cache (see Crypto prices)

Never put real credentials or real financial data in `.env.example`.
