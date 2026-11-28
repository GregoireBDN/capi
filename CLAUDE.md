# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. Read the **Domain rules** and **Workflow conventions** sections before touching any import, transaction or stats code.

Each feature's details (routes, pages, edge cases, the owner's choices) live in [`docs/domain/`](docs/domain/README.md), one file per domain. Before changing a feature, read its file; when a change adds or alters a feature, update that file, not this one. This file keeps only what every session needs: the product, the non-negotiable domain rules, the workflow, the commands and the architecture in short.

## Product vision

**Capi** (named « Finances » until #464: the packages are `@capi/*` and the images `capi-*`; the compose projects, server folders, URLs and databases still say `finances`, renamed or kept as decided in [`docs/runbooks/rename.md`](docs/runbooks/rename.md)) is a single-user, self-hosted personal finance tracker. The owner imports bank CSV exports and statements; transactions are parsed, deduplicated, normalized and categorized automatically. Dashboards show:

- all accounts and net worth;
- monthly income, expenses and savings;
- budget vs target per category;
- subscriptions and fixed costs (auto-detected recurring transactions);
- savings and investments (PEA, life insurance, employee savings, crypto);
- an end-of-month forecast.

It is prototyped locally first, then deployed on a VPS and used from the phone as a PWA, ideally reachable only through Tailscale. Today there is exactly one user: no public sign-up, no third-party analytics. A few invited users, each seeing only their own data and what they choose to share, are being built (#538, [ADR 0009](docs/adr/0009-several-users.md)); sign-up stays invitation only.

## Domain rules

These rules are non-negotiable. Code, tests and reviews must enforce them.

### Several users (ADR 0009, #538, in progress)

- **Every private row names its owner**: a new domain table gets `user_id` (default `app_user_id()`, `ON DELETE CASCADE`), `UNIQUE (id, user_id)` if other tables point at it, composite foreign keys `(x_id, user_id)` to its parents, unique keys that start with `user_id`, and row-level security with the standard policy. Global reference data (prices, securities) and identity tables are the only exceptions, listed in the ADR.
- **Owner in place** (#555): every private table has `user_id` (`ownerColumn()`, `database/schema/owner.ts`), filled by the database from `app_user_id()`: the transaction's `app.user_id` (`setOwner`, `database/owner-scope.ts`) or, until the request scope of #557, the only user. Database specs give their rolled-back transaction an owner with `asSpecOwner(tx)` (`database/testing/spec-owner.ts`); Links between private tables also have a composite key `(x_id, user_id) → parent (id, user_id)` (migration `0059`, SQL only, beside the Drizzle single-column key, same `ON DELETE`, `SET NULL (x_id)`), so a row can't point at another user's row. `database/schema/owner.spec.ts` fails on a new table without an owner or a new link without its composite key: write it in the migration by hand. Services do not filter by user yet (#558).
- **Request scope** (#557): every request authenticated by `JwtGuard` runs in one transaction as its user (`OwnerScopeInterceptor`, `database/request-scope/`; `DatabaseService.asOwner`): `DatabaseService.db` answers with it for everything the handler awaits, the services' own transactions become savepoints (opened one after the other, even from a `Promise.all`), and a failure rolls the whole request back. A failed query whose error is caught aborts the transaction, so the request then fails (25P02) rather than lose its writes: run a query that may fail and be ignored in its own `db.transaction(...)`. Identity routes opt out (`@WithoutOwnerScope()`); work that outlives the request or writes global rows (wallet syncs, prices, the daily close) runs in `outsideOwnerScope`, and jobs run each owner in `asOwner`.
- **Two locks**: services filter by the current user and answer 404 for someone else's id; Postgres row-level security refuses the rest (the API never connects as the table owner, views are `security_invoker`, no `SECURITY DEFINER` on private tables). In place since #557: every private table has `ENABLE` + `FORCE ROW LEVEL SECURITY` and its `<table>_owner` policy `user_id = (SELECT app_user_id())` (migration `0060`; a new private table writes them in its migration, `owner.spec.ts` fails otherwise); the API connects as `capi_app` (`database/app-role.ts`, created and granted by `migrate.ts`), migrations and seeds as the owner (`MIGRATION_DATABASE_URL`, the compose `migrate` service). Database specs read and write as `capi_app` too (`asSpecOwner` sets the role); one that must break a rule on purpose does it in `asTableOwner(tx, …)`. `app_user_id()` still falls back to the only user until every background path runs as its owner (#559): it can't show anyone else's rows, since it applies only while one user exists. `app.isolation.spec.ts` (#558) proves it route by route: user B has the demo's data, user A calls every route of the OpenAPI document with B's ids and gets 404, the same answer as for ids that never existed, B's rows stay byte for byte the same and no read of A carries B's ids or labels; a new route is covered by default, and a new path parameter needs a row of B in the spec.
- **Private rows are never read by another user**: what users share lives in shared tables, written by each member from their own data.

### Money and dates

- Money is stored as **integer cents** (`bigint` / `integer` columns), never as floats. Currency is **EUR**.
- Parse amounts from strings directly into cents (e.g. `"1 234,56"` → `123456`); never go through `parseFloat`. Convert to a decimal representation only at the display edge (e.g. `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`).
- Transaction dates are **calendar dates** (`date` columns / `YYYY-MM-DD` strings), not timestamps. Never shift them through a time zone conversion.
- The app time zone is **Europe/Paris**. Anything that depends on "today" or "this month" (month boundaries, forecasts) is computed in Europe/Paris.

### Transactions

- Every transaction has a `kind`: `expense`, `income` or `transfer`.
- **A categorized transaction or split part has its category's kind, always** (#368, [ADR 0005](docs/adr/0005-data-model-consolidation.md) R1): an incoming amount in an expense category is a refund of it, an outgoing one in an income category lowers that income. `transactions.kind` is chosen freely only on an uncategorized row; the `transactions_kind_follows_category` trigger keeps it equal to the category's on every write path.
- Moves between the user's own accounts (e.g. checking → Livret A, checking → PEA) are `transfer` and must **never** count as income or expense in any statistic, budget or forecast.
- **Transfer links** (#296, [ADR 0004](docs/adr/0004-transfer-links-and-contributions.md)): `transactions.counterpart_account_id` names the other account of a transfer, only on transfers; a link removed by hand stays removed.

- **The transaction editor saves everything at once** (#435): its steps and option screens (split, shares, repayments, prepaid…) edit one draft, nothing is saved while editing, ✕ with changes asks first; « Enregistrer » sends one `POST /api/transactions/:id/edit` that applies every change through the services of their own routes in **one database transaction** (all or nothing). Manual entry, bulk edits and the MCP keep their routes.

Details (kind rules, transfer links, manual transactions, hand edits, splits, the transaction editor): [`docs/domain/transactions.md`](docs/domain/transactions.md).

### Money owed (Dépenses partagées, #359)

Contacts, receivables (`owed_to_me` / `i_owe`) and their repayments; a receivable's state is computed, never stored. What a contact owes and what the owner owes them stay two lists, offset against each other only by an **offset** (« Compenser », #484: the same amount settled on each side as repayments without a transfer, made and undone as one, a deferred trigger keeps it balanced; proposed, or automatic with « Toujours compenser »). What was let go is an amount (`forgiven_cents`, #437): part of what is left can be let go while the rest is still claimed, and the database keeps repaid + let go ≤ the share. **The counting rule lives in the `transaction_lines` view only** (ADR 0005 R8): an expense counts minus its shares owed to the owner, and the part of a transfer linked as a repayment is neither income nor spending. Net worth is cash only; what is owed is shown beside it, never in it. **A share repaid (even partly) or let go is never removed implicitly** (#438): deleting it, or the manual expense carrying it, is refused (409) until the owner unlinks its repayments or claims it again, and the database refuses deleting a receivable that still has repayments (`receivable_payments.receivable_id` `ON DELETE RESTRICT`); only undoing an import and deleting an account delete them on purpose (`deletePaymentsOfShares`). Details: [`docs/domain/money-owed.md`](docs/domain/money-owed.md).

### Recurring items (Abonnements)

Series found by the detector (`suggested`, `confirmed`, `dismissed`); a detection run refreshes the stats only, never the user's columns. Prepaid subscriptions (paid once for a term, on confirmed debits only) and cancellation (« Résilier », an end date `ended_on`, not a status). A confirmed quarterly or yearly debit **is** a prepaid item of term 3 / 12 (#439): its charges are its payments, out of averages, its renewal reminded; never a cadence rule in `transaction_lines`. Details: [`docs/domain/recurring.md`](docs/domain/recurring.md).

### Envelopes (#429)

Money set aside for a goal, split across accounts ([ADR 0008](docs/adr/0008-envelopes.md)). **Never a transaction**: an envelope's amount on an account is the sum of its `envelope_movements` (ledger: `start`, `move`, `split`, `transfer`, `spend`), « libre » = balance − envelopes, and nothing that reads balances, net worth or statistics reads them. A balance under its envelopes is reported (`shortfallCents`), **never reduced automatically**; savings are split by an account's key only as offers the owner confirms. An attached expense keeps its category and counts once; what the envelope paid **adds to that month's budget** of its categories (`envelopes/paid.ts`). Every write is session only, except creating one and adding to one from « libre » (#518, the MCP's `create_envelope` / `add_to_envelope`, `write` token); the MCP reads them. The screens (#430) replaced the savings goals, converted to envelopes by `db:seed`, whose tables migration `0055` dropped (#493). Details: [`docs/domain/envelopes.md`](docs/domain/envelopes.md).

### Month comparisons

- Statements are imported by hand, so the current month is often empty or partial. Every page that compares months (spending, savings, budget, the dashboard's current month) goes through `apps/api/src/coverage/`: `dataUntil` is the latest booked transaction or committed import end (per account, overall = the latest of them), never after today in Europe/Paris; a month is `complete`, `partial` (first `throughDay` days known) or `empty`.
- A partial month is compared **like for like** (the same first days of the other months); an empty month is not compared at all. The forecast projects from the day after `knownUntil`, never from today. The dashboard follows today, not a month.

Details (month navigation and the month bar, Opérations filters, Mouvements' Revenus · Dépenses · Épargne, the forecast, the dashboard): [`docs/domain/months-and-dashboard.md`](docs/domain/months-and-dashboard.md).

### Budgets

Expense targets and planned income in one `budgets` table (effective-dated, carried over), tracked lines (the dashboard's « Budgets suivis »), the owner's part read from `transaction_lines`, what envelopes paid added to the target. Details: [`docs/domain/budgets.md`](docs/domain/budgets.md).

### Month-end review (closing a month)

The guided « Bilan du mois » computes its steps from existing data; closing freezes the report with its shape's version (`report_version`), read only through `upgradeReport`, never recomputed. Its « Cohérence des chiffres » step (#427, `apps/api/src/integrity/`, `GET /api/integrity?month=`, MCP `integrity_checks`) checks the stored data against itself (bank balances vs running balances and statements, crypto holdings vs the last complete read, money owed never below zero, income − expenses = saved with moves between own accounts excluded); read only, never blocks the app or the close, logs counts only. Details: [`docs/domain/month-close.md`](docs/domain/month-close.md).

### Accounts

- Account types: `checking`, `savings`, `meal_voucher` (« Titres-restaurant »), `brokerage` (PEA), `securities` (« Compte-titres », #414), `life_insurance`, `employee_savings`, `crypto`.
- **Lines by ISIN** (`POSITION_ACCOUNT_TYPES`): a PEA and a compte-titres hold them alike (statements, prices, computed values); only a PEA has a ceiling and a 5-year date, only a compte-titres records dividends (typed, information only: never in a value, an invested amount or a statistic).
- **Transactional accounts** (checking, savings, meal voucher) have their balance from transactions. **Bank accounts** (checking, savings: `BANK_ACCOUNT_TYPES`, `isBankAccount`) are fed by imports; only they take a bank import, are checked for imports up to date (the month review's accounts to update, the month close's import step) and are projected by the forecast.

Details (meal vouchers, archive or delete, a cash account's page, account lists): [`docs/domain/accounts.md`](docs/domain/accounts.md). Investment accounts (dated value snapshots, the lines of a PEA or a compte-titres, a compte-titres' dividends, one invested amount per account, the investment summary, Épargne): [`docs/domain/investments.md`](docs/domain/investments.md).

### Crypto

- Crypto accounts hold **holdings** (`crypto_holdings`: asset, location label such as a wallet or exchange, quantity, optional invested cents). Quantities (`numeric(38, 18)`) and EUR prices (`numeric(38, 12)`) are **exact decimal strings** handled with the BigInt helper in `apps/api/src/common/decimal.ts` (shared with a PEA's lines, #413); never `parseFloat` them. Value = round half to even of quantity × price, in cents.
- Prices come from a key-less public API, **server-side only**, cached and kept as last known price when the API fails (flagged stale, never a 500). The crypto reads answer from the database only; the live step is a separate request.

- **Ledger Live imports** (#426): a wallet takes its Ledger Live operations history like an exchange its export (preview, dedupe hash with occurrence index, nothing written before the commit, session only); its holdings stay the chain's, its observed movements are rewritten around the imported ones so **observed and imported movements never both count**; transfers are matched **by transaction hash** first, then by the rules. Only a SHA-256 of the transaction hash is stored (`tx_hash_digest`), never the hash, an address or the xpub column.

Details (prices, cost basis, observed movements, wallet sync, exchange and Ledger Live imports, daily values, the crypto pages): [`docs/domain/crypto.md`](docs/domain/crypto.md).

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
- **Formats** (#431, [ADR 0007](docs/adr/0007-import-profiles.md)): a bank file is read by a saved **import profile** (`import_profiles`: column mapping, date layout, decimal mark, encoding, separator, recognised from the exact header), the CIC parser, or the app's **standard CSV format** (`date;amount;label;balance`, documented in [`docs/domain/import-formats.md`](docs/domain/import-formats.md), with an investment-movements variant for #432), in that order; anything else is `400 Unrecognised CSV format`, mapped once on the Relevés page, or converted to the standard format by Claude through the MCP. Unknown columns (`ignoredColumns`) and invalid or unrecognised lines (`issues`) are listed in the preview, never imported silently; every reader yields the same `ParsedRow`, so dedupe and continuity are unchanged.

Details (undoing an import, reconciliation with manual transactions, the one-shot spreadsheet history import): [`docs/domain/imports.md`](docs/domain/imports.md); formats and profiles: [`docs/domain/import-formats.md`](docs/domain/import-formats.md).

### Categorization

- Categories are assigned by **ordered rules** first (first matching rule wins).
- Correcting a category can create a new rule, so similar transactions are categorized automatically next time.

Details (computed rule order, the review queue, categories and seed data): [`docs/domain/categorization.md`](docs/domain/categorization.md).

### Privacy

- **No real financial data** in the repo, tests, fixtures, issues, PRs or logs. Use only anonymized or synthetic fixtures (fake labels, amounts and account numbers).
- Real bank exports live in the git-ignored `data/` folder at the repo root. Never commit it and never paste its contents anywhere.
- Do not log transaction labels, amounts or balances. Query strings carry the transactions search text (`?q=`) and filters: the API request log keeps the path only (`req.url` without its query, no `query`, `Referer` without its query; `req` serializer in `config/logger.ts`, `common/logging/safe-url.ts`, #181), and so does the `path` of `AllExceptionsFilter` log lines (its error body keeps the URL). Failed database queries carry their bound values (Drizzle's `Failed query: ... params: ...` message, `params`, the Postgres `detail`): the logger's `err` serializer and `logMethod` hook (`apps/api/src/common/logging/safe-error.ts`, wired in `config/logger.ts`) reduce them to the error class, SQL text, Postgres code and object names, and stack frames. Keep them when changing the logger.
- **No third-party analytics or tracking**, on the API or on the web app.
- **Privacy**: the price API only receives asset ids (and the asset search text), never quantities or values. Never log quantities, prices × quantities or values.
- **CSV exports** (the month report, any future one) are written with `apps/web/src/lib/csv.ts`: `text()` cells starting with `=`, `+`, `-`, `@`, a tab or a carriage return are prefixed with `'` and quoted (CSV / formula injection, #175), `amount()` cells are integer cents written with a decimal comma and keep their minus sign.

## Workflow conventions

- **GitHub Flow**: `main` is always deployable. Never commit or push directly to `main`. The repository is public; the `main` ruleset enforces it: changes only through a squash-merged PR, with the four required checks green (`lint · types · test · build`, `dependency audit`, `SAST (Semgrep)`, `secrets (gitleaks)`), no force-push or deletion, no bypass. A second ruleset lets only admins create, move or delete `v*` tags. Secret scanning and push protection are on.
- One short-lived branch per issue, named `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `chore/<issue>-<slug>` or `docs/<issue>-<slug>` (e.g. `feat/12-cic-csv-parser`).
- **Conventional commits in English**, scoped by app or package when relevant: `feat(api): ...`, `fix(web): ...`, `docs: ...`, `chore(ci): ...`.
- PR descriptions follow `.github/pull_request_template.md` and contain `Closes #<issue>`.
- CI (lint, types, tests, build) must be green before merging. Merge with **squash merge**.
- **Auto-merge** (#600): `.github/workflows/pr-labels.yml` labels a PR `visuel` when it changes `apps/web/**`, `packages/ui/**` or `apps/ui-docs/**` (the owner tests it on the phone), and `à-valider` when it changes `apps/api/drizzle/**`, `apps/api/src/auth/**`, `.github/workflows/**`, `deploy/**` or a `docker-compose*.yml` (the owner reads it). A development session that opens a PR waits for that workflow (a few seconds), then, if the PR has **neither label**, enables auto-merge (squash) with its own GitHub access, never with `GITHUB_TOKEN` (a merge by it would not start staging); the four required checks still gate it. A labelled PR waits for the owner, and the workflow turns auto-merge off on it if anyone enables it or a later push adds a label. Releases to production stay the owner's tag and approval.
- **Morning routine** (#601, [`docs/runbooks/morning-routine.md`](docs/runbooks/morning-routine.md)): each morning at 6:00 Europe/Paris from Wednesday to Sunday (the owner's week starts on Friday, when his weekly limit resets; Monday and Tuesday are rest days) a scheduled task of the Claude project starts the open issues labelled `prêt` (owner only) in roadmap order, one thread each, `prêt` → `en-cours`, at most 3 open `en-cours` issues at once. A thread decides alone how to build its ticket and auto-merges non-visual PRs; it asks the owner by decision card for a visual direction (2–3 mockups), a `visuel` PR (preview link, « Fusionner · Corriger »), an `à-valider` PR, a change of scope or anything irreversible; releases stay the owner's. Follow-up work becomes a new issue without `prêt`. The other routines (the morning brings GitHub up to date first; security audit on Friday, maintainability on Saturday, product proposals on Sunday, at most 6 cards a week; a Thursday review of the week, the artifacts and a release proposal; a month-end reminder on the 1st) file `proposition` issues with one decision card each, « Oui » turning them `prêt`: [`docs/runbooks/routines.md`](docs/runbooks/routines.md).
- **Security checks** ([`SECURITY.md`](SECURITY.md)): `security.yml` (on every PR, push to main, weekly and release: `pnpm audit --prod` gated by `.github/security/audit-allowlist.json` through `scripts/audit-prod.mjs`, Semgrep, gitleaks) and `container-scan.yml` (Trivy on the API, web and MCP adapter images when a Dockerfile changes, weekly, and in `release.yml` before pushing). Every job declares least-privilege `permissions:`; actions are pinned by full commit SHA with the version in a comment, scanner and base images by digest (Dependabot bumps them). An accepted finding needs a `fix` issue and an allow-list entry with its reason. pnpm (`packageManager`, pinned with its sha512) enforces `minimumReleaseAge` (7 days), `trustPolicy: no-downgrade` and `blockExoticSubdeps` from `pnpm-workspace.yaml` whenever it resolves; an exception is an exact `name@version` in `minimumReleaseAgeExclude` / `trustPolicyExclude` with a commented reason (see the file and `SECURITY.md`), never a lowered setting. The manual audit (#102) lives in `docs/security/`: threat model, ASVS 4.0 L2 checklist, dated report and `pentest/stack.sh` (re-runnable checks against a throwaway `capi-audit` stack); re-run it and update the checklist when auth, the proxy or the deployment changes.
- Releases are git tags `vX.Y.Z` on `main`. Pushing one runs `.github/workflows/release.yml`: CI (`ci.yml` as a reusable workflow), then the API, web and MCP adapter images are scanned with Trivy and pushed to GHCR (`ghcr.io/gregoirebdn/capi-{api,web,mcp}`, tags `vX.Y.Z` and `sha-<short>`) and, once the owner approves the `production` environment (required reviewer, `v*` tags and `main` only), deployed over Tailscale with `deploy/deploy.sh` (pull, migrate, seed, `up -d`, health check, automatic rollback to the previous version). Running the workflow manually with an existing tag redeploys it without rebuilding (rollback). Setup, releasing and rollback: [`docs/runbooks/deploy.md`](docs/runbooks/deploy.md). `deploy/test-deploy.sh` tests `deploy.sh` with a fake `docker` (run by the `Deploy checks` workflow, with shellcheck and actionlint).
- **Staging** (#421, [`docs/runbooks/staging.md`](docs/runbooks/staging.md)): every push to `main` runs `.github/workflows/staging.yml`: CI (reusable), the images pushed as `sha-<short>` (Trivy first), then `deploy.sh --staging` in the `staging` environment (no reviewer): project `capi-staging`, its own `.env`, volume and secrets, **demo data only**, seeded on an empty database and kept between deploys, reset only on demand (the manual run's `reset_demo`, `deploy.sh --staging --reset-demo`, #494), yellow on screen (`APP_ENVIRONMENT=staging` on `web`, #454). A merge reaches staging with no manual step; a failed staging deploy never touches production. Details: [`docs/domain/containerisation.md`](docs/domain/containerisation.md#staging-stack).
- **Pull request previews** (#599, [`docs/runbooks/previews.md`](docs/runbooks/previews.md)): every push to a pull request that changes the app builds its images (`preview.yml`, never for a fork) and comments the address `capi-pr-<n>.gbodin.cloud` (tailnet, demo data only); the server pulls them by itself every two minutes (`deploy/preview.sh`, main's copy, at most 3 previews). Test a pull request there, from the phone, instead of a server on the owner's Mac. `gbodin.cloud` lists the running `visuel` ones (they take the slots first); `capi-previews.gbodin.cloud` switches a preview's look, demo sign-in and demo data through an allow-list (#608), and a preview signs in the demo account by itself (`auth/demo-sign-in.ts`: `DEMO_AUTO_SIGN_IN` and the `_staging` database only, never production data).
- Issues use the templates in `.github/ISSUE_TEMPLATE/` (feature, bug, chore — each with Context / Scope / Acceptance criteria / Out of scope), get a type label (`feat`, `fix`, `chore`, `docs`) plus an `area:*` label, and belong to a milestone:
  - **M1** Foundations
  - **M2** Import
  - **M3** Transactions & Dashboard
  - **M4** Subscriptions & Savings
  - **M5** Mobile (PWA)
  - **M6** Deployment
  - **M7** Access & security
  - **M8** Claude (MCP)
  - **M9** Month-end review
  - **M10** Everyday use
  - **M11** UX overhaul & insights
- **Tests are required** for import, parsing, deduplication and categorization logic, using anonymized fixtures only.
- **Every business rule is also a database rule** (#367, ADR 0005 R3). A feature that adds a column or a table writes its invariants as constraints in the same migration (a check, a foreign key with the right `ON DELETE`, a unique index, or a trigger when a check can't say it), never in the services alone: a forgotten write path must fail loudly, not skew a statistic. Before adding a rule to existing data, the migration fixes the rows that break it when the fix is certain and otherwise stops with a count (`RAISE EXCEPTION` with the number of rows, never the rows themselves). Each constraint gets a spec that inserts or updates a row breaking it and expects the refusal (`database/schema/constraints.spec.ts` or the feature's own spec). Every write path that changes a value a rule depends on (a kind, a status, a source) clears what the new value forbids, in the same statement. New tables also get `coreColumns` (`timestamptz`) and their `set_updated_at` trigger (see API architecture › Database).

## Monorepo structure

pnpm + Turborepo monorepo with four apps and three shared packages:

- `apps/api` — NestJS backend (Fastify adapter), port 4000, all routes prefixed with `/api`
- `apps/web` — React 19 + TanStack Start (SSR), port 3000
- `apps/ui-docs` — Storybook v9 for the `@capi/ui` component library, port 6006
- `apps/mcp` — `@capi/mcp`, local MCP server (stdio) for Claude Desktop / Claude Code, see MCP server below
- `packages/shared` — `@capi/shared`, shared Zod schemas used by both apps
- `packages/ui` — `@capi/ui`, the Radix + Tailwind component library consumed by `apps/web` and documented by `apps/ui-docs`
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
pnpm --filter @capi/api dev
pnpm --filter @capi/web dev
pnpm --filter @capi/ui-docs dev   # Storybook

# Database (root shortcuts for the @capi/api scripts)
pnpm db:generate   # generate Drizzle migrations
pnpm db:migrate    # apply migrations
pnpm db:seed       # seed reference data (default categories); idempotent, safe to re-run
pnpm db:demo       # demo account + synthetic data, throwaway databases only (see Demo data)
pnpm db:studio     # Drizzle Studio

# Run a single web test
cd apps/web && pnpm vitest run src/path/to/test.ts

# Run a single API test
cd apps/api && pnpm vitest run src/auth/auth.service.spec.ts
```

Pre-commit hook runs `lint-staged`: ESLint + Prettier on `.ts`/`.tsx`, Prettier on JSON/MD/YAML.

**Demo data** (#219, `apps/api/src/database/seed-demo.ts`, logic in `database/demo/`): `pnpm db:demo [--reset | --if-empty]` seeds the default categories, a verified owner `usertest@finances.test` / `usertest` (hashed directly, so the 12-character sign-up rule doesn't apply; sign-in accepts it) and ~14 months of deterministic synthetic data built through the app's own helpers (CIC-format labels, `normalizeLabel`, ordered rules + `categorize`, `computeDedupeHashes`, running balances, one committed `cic_csv` import per account and month, `RecurringService.detect`, then one subscription cancelled after its last charge and one ending next month, and two prepaid plans declared from their payment: a 24-month VPS and a 12-month antivirus renewing this month), bank data ending 10 days before today (Europe/Paris). It refuses the `finances` database and `NODE_ENV=production`, except on the staging database named by `DEMO_STAGING_DATABASE` (a `…_staging` name, #421) (`demo/guard.ts`), and without `--reset` a database that already has users or accounts (`--if-empty` keeps it and succeeds instead, for staging deploys); `--reset` truncates every `public` table. Prints counts and the credentials only. Use it for manual and UX checks: `createdb finances_demo`, then with `DATABASE_URL=postgres://user:password@localhost:5432/finances_demo` run `pnpm db:migrate && pnpm db:demo --reset` and start the API (`PRICE_API_ENABLED=false` keeps the seeded crypto prices) and the web app against it; `node dist/database/seed-demo.js` where `tsx` is missing. Keep it in step with the schema when a migration adds data the pages rely on.

**Testing note**: both apps use **Vitest**. The API's `vitest.config.ts` runs in a Node environment and picks up `src/**/*.spec.ts`; use `pnpm --filter @capi/api test` (or the single-file form above). The web app uses Vitest + Testing Library (`jsdom`), plus Playwright for E2E (`pnpm --filter @capi/web test:e2e`).

**Test database**: API specs never touch the app database. `apps/api/vitest.config.ts` gives the workers `DATABASE_URL` = `TEST_DATABASE_URL`, or the app database name + `_test` (`finances` → `finances_test`), and refuses to run if both point at the same database. Its global setup (`apps/api/vitest.test-database.ts`) creates that database if missing and applies the migrations, so Postgres must be running (`docker compose up -d`). Database specs run inside transactions that are rolled back; never connect them to another URL. When running servers by hand for manual checks, use a throwaway database too (e.g. `createdb finances_scratch`), never `finances`.

## Typed API client (codegen pipeline)

The web app talks to the API through a **generated, type-safe client** — do not hand-write fetch calls or edit the generated output.

1. `apps/api` generates `apps/api/openapi.json` via `pnpm --filter @capi/api generate` (`src/generate-spec.ts` boots the Nest app in-memory and dumps the Swagger document), built by `createOpenApiDocument` in `src/config/swagger.ts`). The live Swagger UI (`/api/docs`) and document (`/api/docs-json`) are served **outside production only** (`setupSwagger`, #180): production answers 404, and nothing needs them at runtime.
2. `apps/web` consumes that spec via `@hey-api/openapi-ts` (`apps/web/openapi-ts.config.ts`), emitting a typed fetch client into `apps/web/src/api/` (`client.gen.ts`, `sdk.gen.ts`, `types.gen.ts`).
3. Turborepo's `generate` task chains these, so `pnpm generate` from the root runs API spec generation before web client generation. `build` and `check-types` depend on `generate`.

`apps/web/src/api/` is **generated** — regenerate it (`pnpm generate`) after changing API DTOs/controllers rather than editing it by hand. Annotate API endpoints with `@nestjs/swagger` decorators (`@ApiBody`, `@ApiOkResponse`, `@ApiTags`, etc.) so they surface correctly in the generated client.

## API architecture (NestJS)

Standard NestJS module structure: each domain has a `*.module.ts`, `*.controller.ts`, `*.service.ts` and `*.schema.ts` (Drizzle tables). Base modules: `Auth`, `User`, `Email`, `Database`, `Health`. Finance domains (accounts, imports, transactions, categories, budgets, snapshots, ...) follow the same layout, one module per domain.

**Database**: `DatabaseService` exposes `db` (a Drizzle `PostgresJsDatabase`). All tables extend `coreColumns` from `apps/api/src/database/schema/core.schema.ts`, which adds `id` (UUID PK), `createdAt` and `updatedAt`. **Instants are `timestamptz`** (`timestamp(..., { withTimezone: true })`), never `timestamp` without time zone, and `updated_at` is kept by the database: the `set_updated_at()` trigger (migration `0039`) moves it on every update that does not set it itself, raw SQL included; a migration creating a table adds its `<table>_set_updated_at` trigger (`database/schema/constraints.spec.ts` fails otherwise, and when a `timestamp` without time zone appears). **The database enforces what the services guarantee** (#367, ADR 0005 R3): check constraints on `transactions` (`manual` ⇔ no `import_id` ⇔ `manual:` hash, counterpart only on transfers, prepaid link only on expenses, corrections only on bank rows), `recurring_items` (`ended_on` on confirmed items only, so leaving `confirmed` clears it; a term on debits only), `accounts` (sync times on crypto accounts only), `month_closes` (ticks among `recurring`, `budget`, `savings`), `balance_snapshots` (#366: `computed` on crypto accounts, and on a PEA from its first position statement (ADR 0006), `typed` on every other, a trigger since it reads the account's type); one spec each in `constraints.spec.ts`. A write path that changes a row's kind or status clears what the new value forbids. Spec fixtures that insert bank rows by hand give them an import with `bankRows(tx, rows)` (`transactions/testing/bank-rows.ts`). Export every schema from `apps/api/src/database/schema/index.ts` and import from there. Money columns are integer cents and transaction dates are `date` columns (see Domain rules). The model (ER diagrams, each table's invariants, stored vs derived values) is described in [`docs/architecture/data-model.md`](docs/architecture/data-model.md); the consolidation proposed by #362 is [ADR 0005](docs/adr/0005-data-model-consolidation.md).

**Seed data**: `pnpm db:seed` runs `apps/api/src/database/seed.ts` (each user's default categories, idempotent; sign-up seeds the new user's, ADR 0009); categories are referenced by `slug`, never by display name. Details: [`docs/domain/categorization.md`](docs/domain/categorization.md#categories-and-seed-data).

**Auth (single user)**: password auth plus passkeys, no OAuth sign-in, no public sign-up once the owner exists. Use `@UseGuards(JwtGuard)` on every non-public route and read the user with `@CurrentUser()`. Read and set the session cookies only through the helpers of `auth/session-cookies.ts`. Routes that hand over or destroy the account need a fresh session (`FreshAuthGuard`). Personal access tokens and remote MCP OAuth tokens are read-only and deny-by-default for writes: a non-GET route is refused to tokens unless it declares `@TokenAccess('write')` (or `'read'` for a POST that saves nothing); `@TokenAccess('none')` locks a route to the session; never put `@TokenAccess('write')` on deletes, account or auth changes, or imports other than the bank CSV preview and commit; the routes open to tokens are the `TOKEN_MUTATING_ROUTES` allow-list of `app.routes.spec.ts`. Details (sessions, cookies, refresh rotation, passkeys, access tokens, remote MCP OAuth, SSR session renewal): [`docs/domain/auth-and-sessions.md`](docs/domain/auth-and-sessions.md).

**Email**: `EmailModule` renders React Email templates (`apps/api/src/email/templates/*.tsx`) to HTML with `@react-email/render` (not the `react-email` CLI, whose preview server is never used) and sends them with `nodemailer` over SMTP (used for password reset). In dev, SMTP points at **Mailpit** (`localhost:1025`, web UI at `localhost:8025`) started by `docker compose`.

**Request bodies**: the global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) validates every DTO; JSON bodies nested deeper than 32 levels are refused with 400 before it runs (`common/http/json-depth.ts`, a Fastify `preValidation` hook, #182), since the pipe walks bodies recursively.

**Health**: `HealthModule` exposes `GET /api/health` (Terminus), checking the database and, when SMTP is configured, SMTP. The production healthchecks and the deploy script rely on it.

**Path alias**: `#/*` resolves to `./src/*` in both the API and web apps.

## Web architecture (TanStack Start)

File-based routing via TanStack Router — routes live in `apps/web/src/routes/`. `routeTree.gen.ts` is auto-generated; never edit it manually. The root layout is `routes/__root.tsx`.

**UI components**: live in the shared `@capi/ui` package (`packages/ui/src/components/`), Radix UI primitives styled with Tailwind CSS v4. Import them from `@capi/ui`. Use the `cn()` helper (`@capi/ui/lib/utils`, clsx + tailwind-merge) for class merging. App-specific composite components stay under `apps/web/src/components/`.

**Auth state**: client auth context in `apps/web/src/lib/auth-context.tsx`; theme via `apps/web/src/lib/use-theme.ts`.

**API access (same-origin proxy)**: the server route `routes/api/$.ts` (`lib/api-proxy.ts`) forwards every `/api/*` request to `API_URL` (runtime env, default `http://localhost:4000`; `http://api:4000` in the production compose), in dev and in production alike. In the browser the generated client uses a relative base URL (`/api/...` on the web origin, `lib/api-client.ts`); server-side code (SSR, server functions) calls `API_URL` directly (`serverApiUrl()` / `withServerCookies()` in `lib/server-api.ts`). Don't point the browser at the API origin: the session cookies must stay on the web origin for the SSR guard to see them. The proxy reads request bodies only up to the API's own limits and answers 413 itself past them (multipart uploads 5 MB + framing, every other body 1 MiB like the API's Fastify `bodyLimit`, #173, #201): the API closes the connection on an oversized upload, which `fetch` would report as a 502. It drops hop-by-hop headers and `Expect` (undici refuses it).

**Client IP**: per-IP rate limits use the real client IP, believed from `X-Forwarded-For` only from `TRUSTED_PROXIES`; never publish the API port. Details: [`docs/domain/containerisation.md`](docs/domain/containerisation.md#client-ip-trusted-proxies).

**Authenticated layout**: every signed-in page lives under `routes/_app.tsx` (files in `routes/_app/`), guarded during SSR. The shell, page headers, page actions, sheets, month bar and every other web convention: [`docs/domain/web-conventions.md`](docs/domain/web-conventions.md).

**Styling**: Tailwind CSS v4 via `@tailwindcss/vite`. Global styles in `apps/web/src/globals.css`; shared design tokens come from `@capi/ui/globals.css`. Theme (light/dark/auto) is initialized via an inline script in `__root.tsx` before hydration to avoid a flash.

**Mobile**: the app is mainly used from the phone — design mobile-first. It is installable as a PWA (see below); `viewport-fit=cover` is set, and `body` is padded with `env(safe-area-inset-*)` in `globals.css`.

**Mobile layout conventions** (remember the 22px root: `rem` is ~1.4× the usual, while media-query breakpoints stay in 16px units, so `md` is still 768px):

- **Touch targets ≥ 44×44 px.** The `touch-hitbox` utility (`@capi/ui/globals.css`) grows a small, positioned control's hit area with an invisible `::after`; `Button`, `Toggle`, `AlertAction` and chart data `summary`s use it on `pointer: coarse`, `Checkbox`/`Switch`/`RadioGroupItem` always; dropdown items and `size="sm"` native selects are 44px high on touch screens. Keep adjacent targets far enough apart that their hit areas don't overlap (e.g. `min-h-11` rows for radios).
- **No horizontal page scroll down to 320px.** Amounts never break inside (`whitespace-nowrap`); the body's `overflow-wrap: anywhere` lets a squeezed flex item break its words, so labels beside a value keep theirs (`break-normal`, the value cut with « … »: `SettingRow` / `SettingSwitchRow` in `@capi/ui`, #325) and an email wraps only after its `@`; in list rows the amounts go under the label when both don't fit (`flex-wrap`, label `min-w-[7rem] flex-1`, amounts `ml-auto`). Button labels wrap rather than overflow. KPI tiles size their value on the tile (`@container` + `cqi`); they stack one per row on phones (`grid-cols-1 @lg:grid-cols-2 @2xl:grid-cols-4`) and `StatCard` puts its sparkline beside the figures when the tile is at least 260px wide, so a tile stays wider than tall; its value never wraps and is sized on its own column and on the length of the text (#211). Genuinely tabular data scrolls inside its card: `Table` shows a fade on the clipped edge and becomes focusable.
- **Cards in a row keep their own height.** Page grids that put different cards side by side use `items-start` (or stack short cards in one column), so no card is stretched to its neighbour's height with an empty area below its content; only KPI tiles share a row height (#210).
- The rest (month pages, page header and actions, account lists, amounts, single choices, the category picker, one-hand use, safe areas and keyboard, full-screen panels on phones, empty states, the mobile audit): [`docs/domain/web-conventions.md`](docs/domain/web-conventions.md).

### PWA

Installable PWA with a small hand-written service worker that caches only the static app shell: **never** `/api/*`, pages or anything private (do not add runtime caching of pages or API responses). Pages and the API answer `no-store`; every page carries a strict CSP (never `'unsafe-inline'` or `'unsafe-eval'` in `script-src`; a new inline script goes in `lib/inline-scripts.ts`). Staging (#454) is told apart at runtime only, by the web service's `APP_ENVIRONMENT=staging`: yellow header (`env-banner`) with « Staging », its own manifest, yellow icons and `theme-color`; production needs no variable and looks as before. Details: [`docs/domain/pwa.md`](docs/domain/pwa.md).

## MCP server (`apps/mcp`)

Local MCP server for Claude Desktop / Claude Code (official TypeScript SDK, stdio transport, setup in [`apps/mcp/README.md`](apps/mcp/README.md)). Configured with `CAPI_API_URL` and `CAPI_API_TOKEN` (a personal access token: `read` for the read tools, `write` for the write tools); the names before #464, `FINANCES_API_URL` / `FINANCES_API_TOKEN`, are still read when the new ones are unset. Rules:

- **API only**: tools call `/api/*` with `Authorization: Bearer`, never the database or `apps/web` code. Read tools (`GET`, plus the read-only `POST /budgets/suggest`) keep working with a `read` token; write tools get a clear "lecture seule" error with one.
- **Write tools** never change anything without `confirm: true` (a preview first) and there are no delete tools.
- **Privacy**: stdout is the MCP channel (ESLint forbids `console.log`); stderr gets only a tool name and an HTTP status, never arguments, outputs, amounts, labels or the token.
- **Skill** `skills/capi/` (#497): the methods (bilan du mois, statement import, investments…) live there, not in tool descriptions; `src/skill.test.ts` checks the tools it names and keeps the definitions under a size budget.

Details (every tool, imports, month close, money owed, investments, output format, remote transport, tests): [`docs/domain/mcp.md`](docs/domain/mcp.md).

## Component library (`@capi/ui` + `apps/ui-docs`)

`packages/ui` is the single source of truth for primitives. It exports components individually (`@capi/ui/components/*`), the barrel (`@capi/ui`), `./globals.css` and `./lib/utils`. `apps/ui-docs` is a Storybook v9 (react-vite) instance documenting these components, with `@storybook/addon-vitest` for component tests (`pnpm --filter @capi/ui-docs test-storybook`). When adding or changing a primitive, update it in `packages/ui` (not `apps/web`) and add or adjust its story in `apps/ui-docs`.

**Prototypes** (#351): stories written to let the owner choose a direction live in `apps/ui-docs/src/prototypes/` only until the owner chooses. The PR that builds the chosen direction deletes them (and anything used only by them) and puts its screenshots in the PR or the issue instead; code comments and this file name the issue that holds the decision, never a prototype file.

## Containerisation

```bash
# Dev — starts PostgreSQL + Mailpit (apps run on the host)
docker compose up -d

# Production images built from this checkout, stack run locally under a throwaway
# project name (the dev stack is also called `capi`; never omit -p locally) and a DB_VOLUME of its own
CAPI_VERSION=local docker compose -p capi-local --env-file <env> \
  -f docker-compose.prod.yml -f docker-compose.build.yml up --build -d
```

`docker-compose.yml` exposes PostgreSQL on `localhost:5432` and Mailpit (SMTP `localhost:1025`, UI `localhost:8025`) with credentials matching the defaults in `apps/api/.env.example`.

Production stack (`docker-compose.prod.yml`, project `capi` in `/srv/capi`, the database volume named by `DB_VOLUME`, `finances_db_data` since #464 kept the data): no `ports:` on any service, hardened containers that never write outside `/tmp`, migrations and seed on every deploy. Details: [`docs/domain/containerisation.md`](docs/domain/containerisation.md). Staging (#421) is the same file plus the override `docker-compose.staging.yml` (project `capi-staging`, database `finances_staging`, web's `proxy` alias replaced): [`docs/domain/containerisation.md`](docs/domain/containerisation.md#staging-stack).

## Environment setup (API)

Copy `apps/api/.env.example` to `apps/api/.env` and fill in:

- `DATABASE_URL` — PostgreSQL connection string (default targets the dev Docker container)
- `JWT_SECRET` — JWT signing secret; required in production and at least 32 characters (`openssl rand -hex 32`), or the API refuses to boot (#182); outside production an ephemeral one is generated when unset
- `APP_URL` — web app origin (default: `http://localhost:3000`), used in email links and as the CORS origin
- `TRUSTED_PROXIES` — peers allowed to set the client IP through `X-Forwarded-For` (default `loopback,uniquelocal`, see Client IP)
- `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN` — passkeys relying party; empty = `APP_URL`'s host name and origin (see [Passkeys](docs/domain/auth-and-sessions.md#passkeys-webauthn))
- `REMOTE_MCP_ENABLED`, `REMOTE_MCP_PUBLIC_URL`, `REMOTE_MCP_REDIRECT_URIS` — remote MCP OAuth (#78), off by default (see [Remote MCP OAuth](docs/domain/auth-and-sessions.md#remote-mcp-oauth))

The web app reads two runtime variables (see `apps/web/.env.example`), never exposed to the browser: `API_URL`, the API origin as reached from the web server (default `http://localhost:4000`), and `TRUSTED_PROXIES` (see Client IP).

- SMTP config (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`) — defaults target the dev Mailpit container; in production `SMTP_HOST` is optional (unset = no email)
- Crypto prices (`PRICE_API_ENABLED`, `PRICE_API_URL`, `PRICE_CACHE_TTL_SECONDS`) — default to the CoinGecko public API with a 10-minute cache (see [Crypto prices](docs/domain/crypto.md#holdings-and-prices))

Never put real credentials or real financial data in `.env.example`.
