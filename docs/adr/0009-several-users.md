# ADR 0009 — Several users in one Capi: an owner on every row, row-level security, shared objects

- **Status**: Proposed (the owner accepts it before any code of #555, #557, #558, #559)
- **Date**: 2026-11-27
- **Issue**: #542 (milestone M16, epic #538); implemented by #555, #557, #558, #559; used by #546, #547, #548, #560, #561, #562; public exposure stays behind #554

## Context

The owner wants a few friends to use Capi, and chose (2026-11-26, epic #538) **one instance with real users** over one instance per friend, because the point is **interactions**: a contact linked to a real user (#561), a budget shared with a partner (#562). Later, Capi goes public (#554, milestone M17), still on invitation only (#546).

Today the app is single-user by construction:

- none of the 42 domain tables has an owner; the only tables with `user_id` are the identity ones (sessions, passkeys, tokens, OAuth);
- unique keys are global: `categories.slug`, `deleted_default_categories.slug`, `app_settings.key`, `contacts lower(name)`, `month_closes.month`, `dashboard_widgets.type` and `.position`, `import_profiles (delimiter, headers)`, `crypto_wallet_keys.public_key`;
- the `transaction_lines` view, 24 triggers and every service read all rows;
- the crypto daily close (the only background job) walks every crypto account;
- sign-up closes once one user exists, and deleting the account removes the `users` row only (#547).

A second account would read and change everything. The data is the most sensitive the owner has (§1 of the [threat model](../security/threat-model.md)), so a forgotten `where` in one of ~400 queries must not be enough to leak it.

## Decision

### 1. Every private row names its owner

Every domain table gets `user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE`, **root and child tables alike** (the owner is denormalised onto children), so that one policy shape covers every table and no policy needs a join.

| Group                             | Tables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Private, root**                 | `accounts`, `categories`, `deleted_default_categories`, `categorization_rules`, `contacts`, `envelopes`, `budgets`, `import_profiles`, `imports`, `recurring_items`, `month_closes`, `app_settings`, `dashboard_widgets`                                                                                                                                                                                                                                                                                                                                        |
| **Private, child** (denormalised) | `transactions`, `transaction_splits`, `balance_snapshots`, `crypto_holdings`, `crypto_wallet_keys`, `crypto_bitcoin_scans`, `crypto_bitcoin_scan_addresses`, `crypto_wallet_tokens`, `crypto_imports`, `crypto_movements`, `crypto_transfer_links`, `position_statements`, `position_lines`, `dividends`, `receivables`, `receivable_payments`, `receivable_offsets`, `envelope_movements`, `envelope_split_keys`, `envelope_categories`, `envelope_offer_dismissals`, `dashboard_widget_accounts`, `dashboard_widget_categories`, `dashboard_widget_envelopes` |
| **Global reference data**         | `crypto_prices`, `crypto_price_history`, `crypto_asset_aliases`, `securities`, `security_prices`: public market data, no owner, readable by all, written by the server (price refresh, statement import). The API never lists them on their own: a user sees an asset or a security only through their own holdings or lines.                                                                                                                                                                                                                                   |
| **Identity** (already per user)   | `users`, `refresh_tokens`, `password_reset_tokens`, `email_verification_tokens`, `webauthn_credentials`, `webauthn_challenges`, `personal_access_tokens`, `access_token_audit`, `oauth_clients`, `oauth_grants`, `oauth_authorization_codes`, `oauth_tokens`, `oauth_audit`: read by the auth module before a user is known (a token looked up by its hash), so they stay **outside row-level security**, filtered by user in code and covered by the isolation suite (#558). They hold no financial data.                                                      |

**A link never crosses owners.** Every parent table gets `UNIQUE (id, user_id)`, and every foreign key between private tables becomes composite: `(account_id, user_id) REFERENCES accounts (id, user_id)`. A transaction of user A cannot point to an account, a category, a rule, an import or a contact of user B, whatever the code does. `ON DELETE SET NULL` keys name their column (`ON DELETE SET NULL (counterpart_account_id)`, Postgres ≥ 15; production runs 17, dev 16) so the owner is never nulled.

**The owner is filled in by the database.** `user_id` defaults to `app_user_id()`, a SQL function returning `nullif(current_setting('app.user_id', true), '')::uuid`. Existing insert code keeps working unchanged; an insert made without a request scope is refused (`NOT NULL`, and the policy below) instead of creating an ownerless row.

**Unique keys become per user**: `(user_id, slug)`, `(user_id, key)`, `(user_id, lower(name))`, `(user_id, month)`, `(user_id, type)`, `(user_id, position)`, `(user_id, delimiter, headers)`, `(user_id, public_key)`. Keys already under a private parent (`(account_id, dedupe_hash)`, `(account_id, date)`…) stay as they are. Global data keeps its global keys.

### 2. Two locks: the services filter, and Postgres refuses

1. **In the code**: every service query names the current user (`where user_id = …` on roots, through the parent on children), and an id that belongs to someone else answers **404**, never 403, so ids reveal nothing.
2. **In the database**: every private table has `ENABLE` and `FORCE ROW LEVEL SECURITY` and one policy, `USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id())`. The API connects as a role `capi_app` that **does not own the tables** and has no `BYPASSRLS`; migrations, seed and maintenance run as the owner role (`POSTGRES_USER`). With no user in scope `app_user_id()` is null and every private table reads empty: a forgotten filter returns nothing, never another user's rows.
3. The `transaction_lines` view (and any future view) is `WITH (security_invoker = true)`, otherwise a view runs with its owner's rights and skips the policies. **No `SECURITY DEFINER` function** reads private tables. Triggers run as the caller, so they see the caller's rows only, which is what every existing trigger needs once its links cannot cross owners.
4. A spec (`database/schema/constraints.spec.ts`, like the `timestamptz` check) fails when a `public` table is neither under RLS with a policy nor in the global or identity allow-list above, and another runs every private table as user B after seeding user A and expects zero rows. A new table cannot be forgotten.

### 3. How the user reaches the database

- **HTTP**: an interceptor opens **one database transaction per authenticated request**, runs `select set_config('app.user_id', $1, true)` (local to the transaction), and keeps the transaction in `AsyncLocalStorage`; `DatabaseService.db` returns it while it is set (the same trick as `DatabaseService.within`, #435), so the services' own `db.transaction(...)` become savepoints. The user comes from `@CurrentUser()`: the session cookie, a personal access token (its `user_id`) or a remote MCP OAuth grant (its `user_id`). Public routes (sign-in, health) run without a user and therefore without private data.
- **The pool**: a request holds one connection for its length. With a handful of users and the default pool this is fine; long imports already run in one transaction.
- **Background jobs**: the crypto daily close and any future job list the users (identity table, no RLS), then run each user's work in its own scoped transaction. Price refreshes touch global tables only and run unscoped.
- **CLI**: `db:migrate` and `db:seed` run as the owner role. `db:seed` writes the global reference data only; the default categories become a function, `seedUserDefaults(userId)`, called when a user is created (#559). `db:demo` creates its user, then writes inside that user's scope. `import-history` takes the target user's email.

### 4. Roles in the app

`users.role`: `admin` or `user`. The admin (the owner) invites, suspends and deletes users (#546, #560). **Being admin gives no access to anyone's data through the app**: the admin page reads the identity table only (email, name, dates, role, state), and the admin's own requests are scoped to the admin's own rows like anyone's. There is no impersonation.

### 5. Sharing: private rows stay private, shared objects are copies

No policy ever lets a user read another user's `transactions`, `accounts`, balances or any other private table. Everything two users share lives in **shared tables** of its own:

- `user_connections`: two users who agreed to know each other (asked, accepted, removed). Nothing is shared without one.
- Shared objects, each with its members: a **shared claim** for #561 (amount, title, dates, state: what A noted as owed by B, seen by B in « Je dois »); a **shared budget** for #562 (its lines, its members, per-member monthly totals, and only the operations a member chose to share).
- **Policy**: a shared row is readable by its members only (`exists (select 1 from <object>_members where user_id = app_user_id())`), and **each member writes only the rows that come from their own data**. B's total spent on « Courses » this month is a row B's session writes (recomputed when B's transactions change), not a query over B's transactions run by A. An operation B shares is a copy (date, amount, a title B chooses), never a link to B's row; B's bank label is never copied.
- Leaving a connection or a shared object deletes its shared rows; the private rows on either side stay.

The details of each shared object belong to #561 and #562; this ADR fixes only the rule that a cross-user read hits a shared table, never a private one.

### 6. Access

Friends reach the single instance through Tailscale node sharing (#550): they see Caddy on 443 and nothing else on the tailnet. Public exposure, with the hardening and pentest it needs, stays behind #554 (ADR 0010, #564).

### 7. What the owner, as root on the VPS, can still read

Everything: the database superuser and the backups see all users' rows, and RLS does not stop them. The app never shows the owner another user's data, but the friends must be told plainly (#552, the privacy notice) that the person who runs the server can technically read the database, as with any self-hosted service. Encryption of the most sensitive columns at rest is #569 (M17).

### 8. Migration path

1. **#555** (one migration): `user_id` nullable on every private table, backfilled to the single existing user; the migration stops with a count (`RAISE EXCEPTION`, never the rows) if there are private rows and zero or several users. Then `NOT NULL`, the `app_user_id()` default, `UNIQUE (id, user_id)`, composite keys, per-user unique keys. Every existing spec keeps passing because the one user owns everything (spec fixtures set `app.user_id`).
2. **#557**: the `capi_app` role (created by `deploy.sh` and the dev compose, with its own password in `.env`), policies, `FORCE`, the request interceptor, `security_invoker` on the view, the allow-list spec. The API's `DATABASE_URL` switches to `capi_app`; migrations keep the owner role (`MIGRATION_DATABASE_URL`).
3. **#558**: every service filters by user, tokens and remote MCP carry their user, the two-user isolation suite over every route (seed A, call as B, expect empty lists and 404).
4. **#559**: per-user defaults, the daily close per user, the demo per user.

Production was emptied on 2026-11-26 and is re-imported by the owner (#483). The backfill makes the order between #483 and #555 irrelevant.

### Alternatives rejected

- **One instance per friend** (#549, closed): total isolation with almost no code, but no interaction between users is possible, which is the goal.
- **Owner on root tables only, children reached through their parent**: fewer columns, but every child policy needs a join (`exists (select 1 from accounts …)`), triggers and the view become harder to reason about, and a child linked to a parent of another user is not refused by a foreign key. The denormalised column costs a few bytes per row and one composite key per link.
- **Filtering in the code only**: one forgotten `where` in ~400 queries leaks a friend's bank history. RLS turns that into an empty list.
- **One Postgres schema or database per user**: real isolation, but migrations run N times, shared objects need cross-database queries, and the pool multiplies.
- **A policy that lets connected users read each other's transactions** (for the shared budget): simpler for #562, but one wrong condition shows a friend's whole bank history. Copies written by their owner keep the blast radius to what was chosen.

## Consequences

- Checked on a throwaway Postgres 16 (2026-11-27): as a non-owner role with `FORCE`, user B reads zero rows of A's tables and of a `security_invoker` view, an insert pointing at A's account is refused by the composite key, an insert with no user in scope is refused, and `ON DELETE SET NULL (counterpart)` keeps the owner.
- Every new table follows one rule, written in CLAUDE.md: a private table has `user_id` with the default, composite keys to its parents, RLS with the standard policy, and per-user unique keys; a shared table has a membership policy; anything else is in the global or identity allow-list with a reason. The allow-list spec enforces it.
- Every request runs in a transaction. A route that streams or waits on a third party for long (wallet sync) must keep its outbound calls outside the transaction, as it should already.
- Specs set `app.user_id` in their rolled-back transactions; database specs gain a second user helper for the refusals (missing owner, cross-owner link, same slug for two users).
- `deploy.sh` and the dev compose create the `capi_app` role; the production `.env` gains its password. Infra (`GregoireBDN/infra`) is untouched.
- The threat model gains two actors (another user of the instance, a connected user) and their threats (T23–T26); the multi-user audit (#553) checks them before the first invitation.
- Deleting a user (#547) is `DELETE FROM users`: every private row cascades, shared rows the user wrote go with them.
- What the owner can read as root is said in the privacy notice (#552).
