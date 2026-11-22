# Capi

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/capi-nom-clair.svg">
  <img src="apps/web/public/brand/capi-nom.svg" alt="Capi" height="64">
</picture>

A single-user, self-hosted personal finance tracker. Import your bank CSV exports and statements; transactions are parsed, deduplicated, normalized and categorized automatically, and dashboards give you a clear view of where your money is and where it goes.

Prototyped locally first, then deployed on a VPS and used from the phone as a PWA, reachable only through Tailscale. No third-party analytics, no public sign-up.

## Features (planned)

- **Bank imports** — CIC CSV first; idempotent imports with a preview before commit, balance continuity checks and duplicate detection.
- **Automatic categorization** — ordered rules, a review queue for uncategorized transactions, and rules created from your corrections.
- **Accounts and net worth** — checking, savings, PEA, life insurance, employee savings and crypto.
- **Monthly overview** — income, expenses and savings, with internal transfers excluded.
- **Budgets** — spending vs target per category.
- **Subscriptions and fixed costs** — auto-detected recurring transactions.
- **Savings and investments** — dated value snapshots (and holdings × price for crypto).
- **End-of-month forecast.**
- **Mobile** — installable PWA.

See the [roadmap](./docs/roadmap.md) for the milestones.

## Stack

- **Monorepo**: pnpm + Turborepo
- **API**: NestJS (Fastify), Drizzle ORM, PostgreSQL, cookie-based JWT auth (single user, password only)
- **Web**: React 19, TanStack Start (SSR) + TanStack Router, Tailwind CSS v4
- **UI**: `@finances/ui` (Radix + Tailwind), documented in Storybook
- **Typed API client**: OpenAPI spec generated from the API, fetch client generated with `@hey-api/openapi-ts`
- **Tests**: Vitest, Testing Library, Playwright
- **Infra**: Docker Compose (dev: PostgreSQL + Mailpit; prod: multi-stage builds), GitHub Actions CI

## Quick start

Prerequisites: Node.js ≥ 20, pnpm 10.34.9 (via `corepack enable`, version from `packageManager`), Docker.

```bash
# 1. Install dependencies
corepack enable
pnpm install

# 2. Start dev services (PostgreSQL + Mailpit)
docker compose up -d

# 3. Configure the API (defaults target the Docker containers)
cp apps/api/.env.example apps/api/.env

# 4. Apply database migrations
pnpm db:migrate

# 5. Seed the default categories (idempotent, safe to re-run)
pnpm db:seed

# 6. Start all apps
pnpm dev
```

| Service         | URL                       |
| --------------- | ------------------------- |
| Web             | http://localhost:3000     |
| API             | http://localhost:4000/api |
| Storybook (UI)  | http://localhost:6006     |
| Mailpit (mails) | http://localhost:8025     |
| PostgreSQL      | localhost:5432            |

The browser reaches the API through the web origin: the web server proxies `/api/*` to `API_URL` (default `http://localhost:4000`, see `apps/web/.env.example`), so the session cookies are first-party. To run the web app against an API on another port: `API_URL=http://localhost:4100 pnpm --filter @finances/web dev`.

Common commands (from the repo root):

```bash
pnpm dev            # start all apps
pnpm build          # production build
pnpm test           # tests (Vitest; API specs use the finances_test database, needs Postgres running)
pnpm lint           # ESLint
pnpm check-types    # tsc --noEmit
pnpm generate       # regenerate the OpenAPI spec + typed web client
pnpm db:generate    # generate a Drizzle migration
pnpm db:migrate     # apply migrations
pnpm db:seed        # seed the default categories (idempotent)
pnpm db:demo        # test account + synthetic data, throwaway databases only (see below)
pnpm db:studio      # open Drizzle Studio
```

Real bank exports go in the git-ignored `data/` folder. Never commit real financial data.

## Demo data (manual testing)

`pnpm db:demo` fills a **throwaway** database with a ready-made account and about 14 months of synthetic data (fake labels and amounts): checking and Livret A fed by committed CIC imports, PEA, life insurance, employee savings and a manual crypto account with value snapshots, subscriptions, transfers, one-offs, rows to review, a split, a manual transaction, budgets, savings goals, rules and recurring items. Bank data stops 10 days before today, so the current month is partial. It refuses `NODE_ENV=production` and the `finances` database.

```bash
docker compose exec db createdb -U user finances_demo   # or: createdb finances_demo
export DATABASE_URL=postgres://user:password@localhost:5432/finances_demo
pnpm db:migrate
pnpm db:demo --reset          # --reset wipes the database first; re-run it to start over

# API and web against it (the shell's DATABASE_URL wins over apps/api/.env)
PRICE_API_ENABLED=false pnpm --filter @finances/api dev   # keeps the seeded crypto prices, no network
pnpm --filter @finances/web dev                           # in another terminal
```

Then sign in on http://localhost:3000 with `usertest@finances.test` / `usertest` (printed by the command). Cookies ignore ports: if another local stack is signed in on `localhost` in the same browser, open the demo at http://demo.localhost:3000 instead so the two sessions don't overwrite each other. Where `tsx` is missing, run `node dist/database/seed-demo.js --reset` from `apps/api`.

## Importing the spreadsheet history

The pre-app history kept in a Google Sheet is imported once from its CSV exports (File → Download → CSV, one file per tab). Put the files in the git-ignored `data/` folder, then, from the repo root:

```bash
# Dry run: prints counts only, writes nothing
pnpm --filter @finances/api import:history -- \
  --transactions data/transactions.csv --balances data/soldes.csv \
  --report data/history-report.json

# Review the counts and data/history-report.json, then write for real
pnpm --filter @finances/api import:history -- \
  --transactions data/transactions.csv --balances data/soldes.csv \
  --commit --create-rules
```

Re-running is safe (nothing is inserted twice). `--help` lists the options, including `--accounts`/`--categories` mapping files and `--include-conflicts`.

## Installing on the phone (PWA)

The production build is an installable PWA: open the app over HTTPS (or `localhost`), then **Share → Sur l'écran d'accueil** in Safari (iOS) or **Installer l'application** in Chrome (Android). A service worker caches only the static app shell (code, icons, offline page) — never API responses or rendered pages — and shows an offline page when the server can't be reached. Icons are regenerated from `apps/web/public/logo.svg` with `pnpm --filter @finances/web icons`. Details in [`docs/domain/pwa.md`](./docs/domain/pwa.md).

## Asking Claude about your finances (MCP)

`apps/mcp` is a local MCP server for Claude Desktop and Claude Code: read-only tools (accounts and net worth, transactions, spending, budget, subscriptions, forecast, savings, month-end review) that call the API with a read personal access token. Setup in [`apps/mcp/README.md`](./apps/mcp/README.md).

## Project structure

```
apps/
  api/       NestJS (Fastify), port 4000, routes prefixed with /api
  web/       React 19 + TanStack Start (SSR), port 3000
  ui-docs/   Storybook v9 for @finances/ui, port 6006
  mcp/       local MCP server (stdio) for Claude, read-only, over the API
packages/
  shared/              @finances/shared — shared Zod schemas
  ui/                  @finances/ui — Radix + Tailwind components
  config-typescript/   shared TS configs (base / nestjs / react)
docs/                  project documentation (roadmap, ...)
```

## Contributing

Architecture, domain rules (money in cents, transfers, import idempotency, privacy) and workflow conventions (GitHub Flow, branch naming, conventional commits, squash merge) are documented in [`CLAUDE.md`](./CLAUDE.md), each feature's details in [`docs/domain/`](./docs/domain/README.md). Issues and PRs use the templates in [`.github/`](./.github/).
