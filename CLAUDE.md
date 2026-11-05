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

### CIC CSV import format

The first supported bank is CIC. Its CSV export:

- uses `;` as separator;
- is encoded in **Windows-1252** (decode explicitly, do not assume UTF-8);
- uses a comma as decimal separator;
- uses `dd/mm/yyyy` dates;
- has the columns `Date` / `Date de valeur` / `Débit` / `Crédit` / `Libellé` / `Solde`, where `Solde` is the running balance after the row.

The running balance is used to **check continuity** (previous balance + amount = new balance, within a file and across imports) and to **disambiguate duplicates**.

### Imports

- Imports are **idempotent**: re-importing a file, or a file whose period overlaps a previous import, must not create duplicates.
- Legitimate identical transactions on the same day (same date, amount and label, e.g. two identical card payments) must be **kept**. Use the running balance to tell them apart from re-imported rows.
- Every import goes through a **preview** (new / duplicate / conflicting rows, continuity check) before it is committed. Nothing is written until the user confirms.

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

**Auth (single user)**: password auth only — no OAuth. The owner account is created through the normal sign-up form on first launch; as soon as one user exists, `POST /api/auth/register` returns 403 (re-checked under a Postgres advisory lock so concurrent sign-ups can't create a second account) and `GET /api/auth/registration-status` returns `{ open: false }`, which the web app uses to hide sign-up. Email verification (`verify-email`, `resend-verification`) is kept. Cookie-based JWT (`httpOnly`, `sameSite: lax`, `Secure` in production): the `token` cookie holds a short-lived access JWT, and a rotating `refresh_token` cookie (scoped to `/api/auth`) renews it via `POST /api/auth/refresh`. Passwords are hashed with `bcryptjs`; password reset goes through `forgot-password` / `reset-password` (tokens handled in `apps/api/src/email/tokens.ts`). Use `@UseGuards(JwtGuard)` on every non-public route — `JwtGuard` verifies the cookie and attaches `{ sub: userId }` to `request.user`; read it with the `@CurrentUser()` decorator (`apps/api/src/auth/decorators/`).

**Email**: `EmailModule` renders React Email templates (`apps/api/src/email/templates/*.tsx`) to HTML via `react-email` and sends them with `nodemailer` over SMTP (used for password reset). In dev, SMTP points at **Mailpit** (`localhost:1025`, web UI at `localhost:8025`) started by `docker compose`.

**Health**: `HealthModule` exposes `GET /api/health` (Terminus), checking the database and SMTP. The production compose healthcheck relies on it.

**Path alias**: `#/*` resolves to `./src/*` in both the API and web apps.

## Web architecture (TanStack Start)

File-based routing via TanStack Router — routes live in `apps/web/src/routes/`. `routeTree.gen.ts` is auto-generated; never edit it manually. The root layout is `routes/__root.tsx`.

**UI components**: live in the shared `@finances/ui` package (`packages/ui/src/components/`), Radix UI primitives styled with Tailwind CSS v4. Import them from `@finances/ui`. Use the `cn()` helper (`@finances/ui/lib/utils`, clsx + tailwind-merge) for class merging. App-specific composite components stay under `apps/web/src/components/`.

**Auth state**: client auth context in `apps/web/src/lib/auth-context.tsx`; theme via `apps/web/src/lib/use-theme.ts`.

**Styling**: Tailwind CSS v4 via `@tailwindcss/vite`. Global styles in `apps/web/src/globals.css`; shared design tokens come from `@finances/ui/globals.css`. Theme (light/dark/auto) is initialized via an inline script in `__root.tsx` before hydration to avoid a flash.

**Mobile**: the app is mainly used from the phone — design mobile-first. The PWA (manifest, service worker) is planned for M5.

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

`docker-compose.prod.yml` expects these variables (from a root `.env` file or the shell environment): `POSTGRES_USER`, `POSTGRES_PASSWORD`, optionally `POSTGRES_DB`, `JWT_SECRET`, `APP_URL`, and the SMTP configuration.

The Dockerfiles (`apps/api/Dockerfile`, `apps/web/Dockerfile`) use multi-stage builds with the monorepo root as context. The API uses `pnpm deploy --prod` to produce a slim image. The web image copies only the Nitro `.output/` directory (self-contained SSR bundle).

Target deployment (M6): a VPS running the production compose stack, reachable only through Tailscale.

## Environment setup (API)

Copy `apps/api/.env.example` to `apps/api/.env` and fill in:

- `DATABASE_URL` — PostgreSQL connection string (default targets the dev Docker container)
- `JWT_SECRET` — JWT signing secret
- `APP_URL` — web app origin (default: `http://localhost:3000`)
- SMTP config (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`) — defaults target the dev Mailpit container

Never put real credentials or real financial data in `.env.example`.
