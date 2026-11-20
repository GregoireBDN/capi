# ADR 0005 — Consolidating the data model before shared costs

- **Status**: Proposed (the owner chooses the refactors and the migration path; one follow-up issue per accepted refactor)
- **Date**: 2026-11-20
- **Issue**: #362 (milestone M11 UX overhaul & insights); affects #357, #358, #359, #360

## Context

The model grew issue by issue to 36 tables, one view and 35 migrations. The audit ([`docs/architecture/data-model.md`](../architecture/data-model.md)) found a model that mostly fits the needs: one ledger table, effective-dated budgets, append-only imports with stable dedupe hashes, holdings kept apart by origin, a frozen report per closed month. What strains is a handful of concepts with several sources of truth, rules that only the services enforce, and two reading conventions (bank values, kind) that every new feature has to remember. Three open issues lean on exactly those places: #357 gives a split part its own kind, #359 subtracts what others owe from the owner's spending, #358 and #360 want one invested amount per account.

The owner said production data matters little and a reset is acceptable. That widens the options; it does not by itself make a rewrite worth it.

## Decision

Keep the shape of the model. Make eight targeted changes, in-place, each its own issue and PR. No new table per account type, no table of lines, no transfer pairs, no merged import pipeline, no `user_id`.

Every refactor below gives what it fixes, its cost, its risk, the issues it touches and its migration. Findings F1–F15 are those of the data-model document.

### R1 — One rule for the kind: a line's kind is its category's

- **Fixes** F1. Today `transactions.kind` may disagree with its category (rule override `categorization_rules.kind`, the editor's « Type », the spreadsheet's `Groupe`), budgets silently drop « income in an expense category », and after #357 a split part follows its category while an unsplit row keeps its own kind.
- **Target**: a categorized transaction or part has its category's kind, always. `transactions.kind` stays as the kind of an uncategorized row (review queue) and as a copy kept equal to the category's by a `BEFORE INSERT OR UPDATE` trigger (so no write path can disagree); `transaction_lines.kind` is `coalesce(category kind, t.kind)` for every line, split or not. A refund stays « a positive amount in an expense category ». `categorization_rules.kind` is dropped (in the demo data every override repeats its category's kind); the editor's « Type » screen picks a category of the new kind instead of setting a kind beside the category. The spreadsheet import files a `Groupe` / category disagreement without a category, in review (it already flags it).
- **Cost**: a migration (trigger, view, column drop), the rules editor's « Avancé » kind field, the transaction editor's « Type » screen, the history mapping, specs that build a mismatch on purpose. Small to medium.
- **Risk**: rows whose kind the owner set on purpose against their category change statistics. The migration does not guess: it counts them, puts them in review (`needs_review = true`) and leaves their category; the owner refiles them from « À revoir ».
- **Issues**: makes #357 a special case of the general rule (no split-only branch in the view), gives #359 one counting rule to build on.
- **Migration**: in place. Before the trigger, `UPDATE transactions … SET needs_review = true` where the kind differs from the category's, then `kind := category.kind` for those rows; split parts need nothing (their kind is read from the category since #357). The migration prints the count only, never the rows.

### R2 — One invested amount per account, never written by a valuation

- **Fixes** F2. Five sources (typed snapshot contributions, linked transfers, holdings' invested, withdrawals' cost, the #358 base) and one column, `balance_snapshots.contributions_cents`, that holds both what the owner typed from a statement and what a crypto valuation computed, so the typed value lasts one day.
- **Target**:
  - `balance_snapshots.contributions_cents` only holds figures **typed** by the owner (or written by the MCP `add_investment_snapshots`); no code path computes into it.
  - The #358 base (`accounts.invested_base_cents`, `invested_base_on`: « Investi jusqu'au … ») applies to **every investment account that is not an exchange** (PEA, life insurance, employee savings, wallet, manual crypto), which is what #360's single « Modifier le montant investi » needs.
  - One function, `investedAt(account, day)` in `investments/`, is the only source for the DTOs (account performance, Crypto page, Épargne, lists, MCP):
    - exchange: the cost of its holdings at that day, replayed from `crypto_movements` (as today);
    - any other investment account: the latest typed point on or before the day (the base, or a snapshot's typed contributions, whichever is later) plus the linked inflows after it: bank transfers (`transactions.counterpart_account_id`) and coins received (`crypto_movements.cost_cents`), counting the known costs and naming the unknown ones (#358's partial rule).
  - `crypto_holdings.invested_cents` stays the per-line detail (gain per asset on manual lines), not an account total.
- **Cost**: medium: `performance.ts`, `crypto/valuation.ts` (`writeSnapshot` writes the value only), the portfolio, the DTOs already reshaped by #358 / #360.
- **Risk**: the crypto history curve becomes computed on read (a replay of a few hundred movements: cheap). Typed contributions on crypto snapshots written before cannot be told from computed ones.
- **Issues**: #358 (keep its columns; widen the check from `crypto_source in ('wallet','manual')` to every non-exchange investment account; do not write the base into snapshots), #360 (one figure everywhere comes for free).
- **Migration**: in place. Widen the check; set `contributions_cents = null` on the snapshots of crypto accounts (computed, now recomputed on read). The owner types one base per wallet or manual crypto account, which #358 asks for anyway.

### R3 — Constraints for what the code already guarantees

- **Fixes** F3, F11, F12. Facts stored twice or valid only under a condition, enforced by every write path separately.
- **Target** (one migration):
  - `transactions`: `manual = (import_id is null)`; `manual = (dedupe_hash like 'manual:%')`; `counterpart_account_id is null or kind = 'transfer'`; `prepaid_item_id is null or kind = 'expense'`; `not manual or (original_amount_cents is null and original_booking_date is null)` (superseded by R4 if taken); a partial index on `needs_review`.
  - `recurring_items`: `ended_on is null or status = 'confirmed'`; `term_months is null or direction = 'debit'`.
  - `accounts`: `crypto_synced_at` and `crypto_sync_failed_at` null unless `type = 'crypto'`.
  - `savings_goals`: `manual_amount_cents` set iff `source = 'manual'` (stale values nulled first).
  - `month_closes`: `acknowledged <@ '{recurring,budget,savings}'`.
  - `crypto_imports.preview` nullable and cleared at commit, like `imports.preview`; `accounts` → `imports` and → `crypto_imports` with the same `ON DELETE` (both `restrict`: the account deletion already deletes them explicitly).
  - Optional: a deferred constraint trigger checking that a split's parts sum to the transaction's amount with its sign.
  - Fix the stale comment of `budgets` (income lines since #315).
- **Cost**: low: one migration, fixtures that build inconsistent rows on purpose.
- **Risk**: the migration fails on a production row that breaks a rule. Each constraint is preceded in the migration by the unambiguous fix (clear a counterpart on a non-transfer, a prepaid link on a non-expense, a stale manual amount) and the others raise with a count.
- **Issues**: none directly; #359's new tables follow the same habit (checks for « at most the expense », `forgiven_at`, direction).
- **Migration**: in place.

### R4 — Bank values as columns

- **Fixes** F4. `bankAmountCents` / `bankBookingDate` (`coalesce(original_*, …)`) are easy to forget and no index serves them.
- **Target**: two generated columns, `bank_amount_cents bigint generated always as (coalesce(original_amount_cents, amount_cents)) stored` and `bank_booking_date date generated always as (coalesce(original_booking_date, booking_date)) stored`; the helpers become plain column references; index `(account_id, bank_booking_date) where not manual` for balances, coverage, dedupe and continuity. Write paths do not change.
- **Rejected alternative**: moving bank rows to their own immutable table with the owner's view on top. Clean on paper, but every read joins two tables, reconciliation and corrections get a second write, and the gain over generated columns is only immutability, which a trigger can give if ever needed.
- **Cost**: low. **Risk**: low (generated columns are computed by Postgres). **Issues**: none; helps every future reader of bank data.
- **Migration**: in place (`ALTER TABLE … ADD COLUMN … GENERATED`, rewrites the table once: a few thousand rows).

### R5 — An import undo says what it deletes

- **Fixes** F5. Undoing an import deletes the owner's edits on its rows and the manual entries they absorbed.
- **Target**: no schema change. `DELETE /api/imports/:id` returns, and the confirmation shows before it, the number of rows edited by hand (category or kind set by hand, note, split, correction, link, one-off) and of manual entries absorbed by reconciliation; those absorbed entries are put back as manual transactions on undo (their fields are on the bank row).
- **Rejected alternative**: owner annotations in a side table keyed by `(account_id, dedupe_hash)`, re-attached on re-import. It makes undo lossless but doubles every write and read of a category; undoing a committed import is rare.
- **Cost**: low (API + one confirmation). **Risk**: low. **Issues**: none. **Migration**: none.

### R6 — A versioned month report

- **Fixes** F6. The frozen `month_closes.report` has no version; compatibility code (`withIcons`, `plan ?? null`) is spread over the reader, and #357 / #359 change what the totals mean while months closed before must keep theirs.
- **Target**: `month_closes.report_version smallint` (not null when a report is set), one `upgradeReport(version, json)` in `month-close/` that turns any stored version into the current DTO (filling what is missing, never recomputing a figure), called once where reports are read. Every change of the report's meaning bumps the version. The report stays jsonb: it is a document frozen on purpose, and tables would copy the live model.
- **Cost**: low. **Risk**: low. **Issues**: #359 (net figures from its close on), #357.
- **Migration**: in place; existing reports get version 1 (with the current upcasters as the 1 → 2 step).

### R7 — Time stamps with time zone, `updated_at` by the database

- **Fixes** F7.
- **Target**: every `timestamp` column becomes `timestamptz` (`USING col AT TIME ZONE 'UTC'`: the stored wall-clock times are UTC, the driver sends ISO instants and the server runs in UTC; checked before migrating with `SHOW TimeZone`). `coreColumns` uses `withTimezone: true`. A `set_updated_at()` trigger on every table maintains `updated_at`, including updates written in raw SQL; `$onUpdate` stays harmless. Calendar dates stay `date`.
- **Cost**: low (one migration touching 29 columns, the core helper). **Risk**: a wrong session time zone would shift instants by the offset: the migration refuses to run unless `current_setting('TimeZone')` is UTC. **Issues**: none; #359's tables are born right.
- **Migration**: in place.

### R8 — `transaction_lines` is the contract for money per category

- **Fixes** F10, and prepares #359.
- **Target**: keep `transactions` plus optional `transaction_splits`, and keep the view as the **only** read model of money per category, defined in one migration-managed SQL with one spec per rule. Every per-category reader (spending, budgets, envelopes, month close, savings flows, dashboard flows, forecast estimate, totals) reads it; none recomputes kind, one-off or shares. #359 extends it:
  - a receivable names `transaction_id` and, when the expense is split, the `split_id` of the part it reduces (required then, refused otherwise; splitting a shared expense asks which part keeps the share);
  - the view subtracts open and repaid receivables from their line, and drops the linked part of a repayment from its line (settlement, neither income nor spending); a debt let go adds back.
- **Rejected alternative**: a primary `transaction_lines` table where every transaction has at least one line. It gives every line a stable id, but every categorizing write path (rule apply, PATCH, bulk update, import commit, reconciliation, manual entry, history import, demo, category deletion) would write it, for about one split in a few hundred rows. Revisit if a third per-line attribute appears (a note or a one-off flag per part, a recurring link per part).
- **Cost**: carried by #359. **Risk**: the view grows (a left join and two aggregates); measured plans stay under 2 ms at 15 000 rows. **Issues**: #359, #357.
- **Migration**: in #359.

### Kept as they are

- **One `accounts` table** (F8): every foreign key points at it and pages list all types together; per-type tables would make ~15 foreign keys polymorphic. Per-type columns are guarded by checks (R3) and the invested base is generic (R2).
- **Transfers linked to an account** (F9): a pair table cannot model a transfer to a PEA (one side only). An optional `counterpart_transaction_id` can be added when a feature needs the pair.
- **Two import pipelines** (F11): same life cycle, different targets and dedupe; R3 aligns their details.
- **Recurring items** (F12), **rules, budgets, categories** (F13): they work; budgets' effective dating is the pattern R2 follows.
- **Single user** (F15): no `user_id` on finance tables. There is one owner, sign-up closes after the first account, and the filter would always be the same. Multi-user would need `user_id` on the roots and row-level security: a new ADR if it ever comes.

## Migration path

**In-place migrations, one per refactor. No baseline squash, no reset.**

- Every refactor above is a schema migration plus at most an unambiguous data fix, so nothing the owner typed is lost. Each migration that adds a rule first counts the rows that break it and either fixes them (only when the fix is certain) or stops with the count; nothing logs rows.
- **What the owner enters again**: one invested base per wallet or manual crypto account (R2, asked by #358 anyway), and the refiling of the rows R1 puts in review because their kind disagreed with their category (zero in the demo data; the count on production is printed by R1's migration on the server, never written in the PR).
- `pnpm db:demo` follows on its own for most changes, since it writes through the services; it gets an invested base on its Ledger (R2) and loses its rules' kind overrides (R1). Spec fixtures that insert rows directly (20 spec files insert `transactions`) need nothing for R4 / R7 and get fixed where they build an inconsistency R1 / R3 now refuse.

**Rejected: a fresh baseline (squash of the 35 migrations) with an export / reload script.**

- What it would take: export everything typed by hand (categories with icons and archives, `deleted_default_categories`, rules, budgets, savings goals and target, recurring decisions keyed by account + merchant key + direction, manual transactions in full, every annotation of a bank row keyed by account + dedupe hash: category, kind, note, one-off, review, splits, corrections, links, prepaid links; typed snapshots; month closes with their frozen reports; crypto accounts with sources, wallet keys, tokens, manual lines, manual prices, aliases and movement links; the owner, passkeys and tokens or a new sign-up), reset, re-import every bank CSV, the spreadsheet history and every exchange export, sync the wallets, then re-attach the annotations.
- Why not: the in-place path loses nothing and costs less; the reload script would be as large as the refactors themselves and tested once; re-attaching by dedupe hash fails wherever the label normalizer changed since a row was imported (the hash is computed from the normalized label), so some edits would be lost silently; the original files must all still exist; and squashing needs hand surgery on Drizzle's `__drizzle_migrations` journal in production for a cosmetic gain (only the latest snapshot in `drizzle/meta` is read when generating). If the owner still prefers a reset, it should come after these refactors, not instead of them.

## Order with the open issues

1. **#357** as built (PR #363): the view reads a part's category kind. Merge first.
2. **R3 + R4 + R7** (hygiene: constraints, bank columns, time stamps): independent of every feature; best before #359 so its tables are born with the conventions.
3. **R1 + R6** (kind rule, report version): before #359, which counts on lines and changes the report.
4. **#359** on top, with **R8** as its design: receivables and repayments as tables, the view extended.
5. **#358** as being built (keeps its columns), then **R2 with #360**: one invested figure everywhere.
6. **R5** any time (app only).

Follow-up issues (milestone M11, listed in the epic #301): #367 (R3, R4, R7), #368 (R1), #369 (R6), #370 (R2, after #358 and #366, which marks each snapshot `typed` or `computed`), #371 (R5). R8 is written on #359.

## Consequences

- One rule per concept: a line's kind is its category's, an account's invested amount comes from one function, a bank value is a column.
- The database refuses the inconsistencies the code guards against today, so a forgotten write path fails loudly instead of skewing a statistic.
- #359 adds tables and branches of the view instead of reshaping the ledger.
- The cost is spread over small PRs that each ship on their own; nothing has to be re-imported.

## Decisions for the owner

1. Which refactors to take (R1–R8), each becoming a follow-up issue.
2. R1: is it fine that a categorized row can no longer carry a kind different from its category (the « Type » screen picks a category instead)?
3. R2: the invested amounts computed today on crypto snapshots are dropped and one base is typed per crypto account.
4. The migration path: in place (proposed) or a reset with a reload script.
