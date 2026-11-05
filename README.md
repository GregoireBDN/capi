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

# 5. Start all apps
pnpm dev
```

| Service         | URL                       |
| --------------- | ------------------------- |
| Web             | http://localhost:3000     |
| API             | http://localhost:4000/api |
| Storybook (UI)  | http://localhost:6006     |
| Mailpit (mails) | http://localhost:8025     |
| PostgreSQL      | localhost:5432            |

Common commands (from the repo root):

```bash
pnpm dev            # start all apps
pnpm build          # production build
pnpm test           # tests (Vitest)
pnpm lint           # ESLint
pnpm check-types    # tsc --noEmit
pnpm generate       # regenerate the OpenAPI spec + typed web client
pnpm db:generate    # generate a Drizzle migration
pnpm db:studio      # open Drizzle Studio
```

Real bank exports go in the git-ignored `data/` folder. Never commit real financial data.

## Project structure

```
apps/
  api/       NestJS (Fastify), port 4000, routes prefixed with /api
  web/       React 19 + TanStack Start (SSR), port 3000
  ui-docs/   Storybook v9 for @finances/ui, port 6006
packages/
  shared/              @finances/shared — shared Zod schemas
  ui/                  @finances/ui — Radix + Tailwind components
  config-typescript/   shared TS configs (base / nestjs / react)
docs/                  project documentation (roadmap, ...)
```

## Contributing

Architecture, domain rules (money in cents, transfers, import idempotency, privacy) and workflow conventions (GitHub Flow, branch naming, conventional commits, squash merge) are documented in [`CLAUDE.md`](./CLAUDE.md). Issues and PRs use the templates in [`.github/`](./.github/).
