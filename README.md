# Finances

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

Prerequisites: Node.js ≥ 20, pnpm 10.11.0 (via `corepack enable`), Docker.

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
pnpm db:studio      # open Drizzle Studio
```

Real bank exports go in the git-ignored `data/` folder. Never commit real financial data.

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

The production build is an installable PWA: open the app over HTTPS (or `localhost`), then **Share → Sur l'écran d'accueil** in Safari (iOS) or **Installer l'application** in Chrome (Android). A service worker caches only the static app shell (code, icons, offline page) — never API responses or rendered pages — and shows an offline page when the server can't be reached. Icons are regenerated from `apps/web/public/logo.svg` with `pnpm --filter @finances/web icons`. Details in [`CLAUDE.md`](./CLAUDE.md#pwa).

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

Architecture, domain rules (money in cents, transfers, import idempotency, privacy) and workflow conventions (GitHub Flow, branch naming, conventional commits, squash merge) are documented in [`CLAUDE.md`](./CLAUDE.md). Issues and PRs use the templates in [`.github/`](./.github/).
