# ADR 0006 — Security positions: an investment account's lines, their prices and its value

- **Status**: Proposed
- **Date**: 2026-11-21
- **Issue**: #413 (milestone M11 UX overhaul & insights), reused by #414 (compte-titres)

## Context

A crypto account shows what it holds, coin by coin: quantity, price, value, cost and result (`crypto_holdings`, `crypto_prices`, #295, #373). A PEA (`brokerage`) shows one figure: a value typed at a date (`balance_snapshots`, `typed`), with the invested amount of #360 / #370 (`invested_base_cents`, or contributions typed on a value, plus the transfers linked to it, #296). The owner holds ETFs in his PEA and wants each **line**: which security, how many shares, at what cost, worth how much, with what result. A compte-titres (#414) will hold the same kind of lines, so nothing here may be PEA-only by name.

What the owner has to work with is the broker's statement (« relevé de portefeuille »): on a day, each line's ISIN, name, quantity, PRU (average cost per share), price and value, plus the cash (« liquidités »). He gets it monthly, the same rhythm as today's typed value. There are no PEA transactions in the app: the bank only sees the transfers into it.

Constraints from the rules already in force: money in integer cents, exact decimals for quantities and prices (`crypto/decimal.ts`, never a float); calendar dates; one value per account and day (`balance_snapshots_account_date_unique`); one invested amount per account (#370, ADR 0005 R2), never written by a valuation; every business rule also a database rule (#367, ADR 0005 R3); nothing about holdings in logs; a price source receives identifiers only.

## Decision

### 1. The model: a security, its prices, an account's dated positions

Four tables, none named after the PEA:

- **`securities`**: one row per ISIN, reference data shared by every account. `isin` (`char(12)`, unique, upper case), `name` (`varchar(200)`), optional `ticker` and `exchange` (MIC, e.g. `XPAR`), both display-only. No amount of the owner's in it.
- **`security_prices`**: `security_id`, `day` (`date`), `price_eur` (`numeric(38, 12)`, exact, > 0), `source` (`manual`, `statement`, `provider`), unique on (security, day). One price per security and day; the latest day is the current price, the earlier ones are the history the account's past values are computed from. A write never replaces a price of a stronger source on the same day: `manual` > `statement` > `provider`.
- **`position_statements`**: what an account held **on a day**, as a whole. `account_id` (`ON DELETE CASCADE`), `as_of` (`date`, unique per account), `cash_cents` (`bigint`, ≥ 0: « Liquidités », not a security), `source` (`typed`: entered or edited in the app; `mcp`: read from a statement through Claude).
- **`position_lines`**: `statement_id` (`ON DELETE CASCADE`), `security_id` (`ON DELETE RESTRICT`), `quantity` (`numeric(38, 18)`, > 0: a line sold is a line absent from the next statement), `unit_cost_eur` (`numeric(38, 12)`, ≥ 0, nullable: the PRU as the broker prints it), unique on (statement, security).

The account holds, on a day, the lines of its **latest statement on or before that day**. A statement is complete by definition: a line missing from it was sold. This keeps the quantities over time (the « Évolution » and any past month end are computed from them) without movements, which the app has no source for.

Positions are allowed on `POSITION_ACCOUNT_TYPES` (`domain-enums.ts`): `brokerage` now, #414's type next, life insurance and employee savings later (same model). A trigger refuses a statement on another type (it reads the account's type, like `balance_snapshots`' source trigger of #366). Deleting an account (#297) cascades its statements and lines; securities and prices stay (public reference data), and `GET /api/accounts/:id/deletion-preview` counts the statements.

**Cost** is the PRU, stored as printed, exact. A line's cost in cents is `round_half_even(quantity × unit_cost_eur × 100)`, its value `round_half_even(quantity × price × 100)` (`valueInCents`), its result the difference, never stored. The decimal helpers move from `crypto/decimal.ts` to `common/decimal.ts` (crypto imports them from there), so crypto and securities share one exact arithmetic.

### 2. ISIN validation, in one place and in the database

An ISIN is 2 letters, 9 letters or digits, then a check digit: letters become numbers (A = 10 … Z = 35) and the Luhn sum of the digits must end in 0. `isValidIsin` / `normalizeIsin` (spaces dropped, upper case) live in `packages/shared` and are used by the API DTOs, the web form (an error under the field, « Ajouter » greyed out) and the MCP tool. The database checks the same with an `IMMUTABLE` SQL function in `securities_isin_valid`, and its spec inserts a wrong check digit. The country prefix is **not** checked against ISO 3166: synthetic fixtures and the demo use `ZZ…` ISINs (`ZZ00MSCIWD03`), which pass the check and can never name a real security.

### 3. How lines come in

- **By hand** (session only): « Ajouter une ligne » (ISIN, then the name, filled in when the security is known; quantity; PRU, optional), edit, delete, « Liquidités ». A hand edit changes the lines **as of today**: today's statement if there is one, else a copy of the latest statement dated today with the change. The past is never rewritten by an edit (like a crypto line typed by hand, #366).
- **From a statement, through the MCP**: `sync_security_positions` (write tool, #77 rules): the account by name, `asOf` (the statement's day), the lines (`isin`, `name`, `quantity` and `unitCost` and `price` as text, parsed exactly, never through a float), `cash`. Without `confirm: true` it reads and previews: new, changed, removed and unchanged lines, the prices written, the account's value on that day before → after, and whether a typed value already holds that day (§ 5). With `confirm: true` it writes the whole statement with `PUT /api/accounts/:id/positions/:asOf` (`@TokenAccess('write')`, added to `TOKEN_MUTATING_ROUTES`; 400 on an account that takes no positions), its prices as `statement` prices of that day, and re-reads: a repeated call changes nothing. A statement older than the latest is accepted (back-filling history). No delete tool: deleting a statement stays in the app.
- **Later, out of scope**: a broker CSV import.

### 4. Prices: manual and from statements; a provider interface, off

- **Manual**: `PUT /api/securities/:isin/prices/:day` (session only), « Mettre à jour le cours » on a line. **From statements**: § 3.
- **A public source by ISIN.** None is both key-less and reliable. Free market-data APIs need a key and mostly look up by ticker; the key-less ways to get a EUR price from an ISIN are undocumented endpoints of trading venues or scrapers of fund sites (justETF, Yahoo), which change without notice, may forbid automated use, and would put the owner's ISINs in requests to them. Portfolio Performance's own key-less service, Portfolio Report, has been announced as discontinued. So #413 ships the seam, not a source: a `SecurityPriceProvider` interface (`fetchEurPrices(isins)` → price and day per ISIN, ISINs only ever sent), `SECURITY_PRICE_API_ENABLED` (default `false`: no provider is built) and the same rules as crypto once one exists (server-side only, all ISINs in one request, cached, the last known price kept when it fails, never a 500, a daily close like #366). Choosing a source is a later issue the owner decides.
- A price's age is shown (« cours du 31 oct. »). A value is computed from the latest price on or before its day, however old; the page says when a line's price is older than its statement.

### 5. The account's value follows its lines, one value per day

An account with statements is **valued by its lines** from its first statement on. Its value on a day `D` = the lines of the latest statement on or before `D`, each at its latest price on or before `D`, plus its cash. It is stored as a `balance_snapshot` with source `computed` (the #366 trigger widened: `computed` on crypto accounts and on accounts with statements), on the days something was recorded (a statement's day, a price day of a security held then), recomputed in the same database transaction as the write that changes it, from the earliest day it touches. Net worth, the account lists, Épargne and the month close read `balance_snapshots` as today and need no change.

- **A day with a line without any price has no computed value**, and the page names the line. Values typed before stay as they are.
- **A typed value wins its day.** A computed value is never written over a `typed` one (the broker's printed total is the truth of its day); typing a value on a day that has a computed one replaces it. So there is never more than one value per day (the existing unique key), and an account without statements is unchanged.
- `contributions_cents` stays null on computed rows (#370).
- No live value without a provider: the latest computed value is the value.

### 6. Invested amount and per-line cost

- The account keeps **one invested amount**, by the rule of #370 (`investedAt`: the invested base or contributions typed on a value, plus the linked transfers). It is what the owner paid in, so it gives the account's « Investi » and « Résultat », and the PEA's versements (§ 7). **It wins** whenever it is known.
- The lines' cost is a detail: each line's « Prix de revient » and result, and their total in « Lignes ». It differs from the invested amount by design (cash not invested yet, fees, reinvested dividends), and the page shows both, never one adjusted to the other.
- **Fallback**: an account with no invested amount at all (no base, no typed contributions, no linked transfers) whose lines all have a PRU takes the lines' cost plus its cash as invested amount, a new `contributionsSource` `lines` (« D’après le prix de revient de vos lignes »). One line without PRU leaves it unknown.

### 7. What is the PEA's own

- `accounts.opened_on` (`date`, nullable, not in the future; set in the account editor): the PEA's **5-year mark** = `opened_on` + 5 years (`addMonths`, clamped), shown as « Retraits possibles sans clôture depuis le … » or « … à partir du … ».
- **Versements against the ceiling**: the invested amount (§ 6) against `PEA_CEILING_CENTS` (150 000 €), as a bar. Neither applies to a compte-titres (#414).

### 8. API, web, MCP

- `GET /api/accounts/:id/positions` (read): the lines as of today with quantity, PRU, cost, price and its day and source, value, share of the account, result; the cash; the statement's day; the lines' totals. `GET /api/accounts/:id/positions/history` gives the statements' days for « Évolution » and the values list.
- Session-only: the hand edits (§ 3), manual prices, deleting a statement. Token `write`: `PUT …/positions/:asOf` only.
- Web: the page of the direction the owner chooses (two prototypes with this ADR). The value editor stays for accounts without lines and for typing a statement's total.
- MCP: `sync_security_positions` (§ 3); `list_investment_accounts` and `savings_and_goals` list each account's lines (name, ISIN, quantity, value, result). Outputs in French, quantities as exact text.
- Demo (`pnpm db:demo`): the PEA gets monthly statements with three `ZZ…` ETFs and cash, so its values become computed.

### 9. Privacy

Logs carry counts only, never a quantity, a price × quantity, a value or a cost. A future provider receives ISINs only. Tests and the demo use synthetic `ZZ…` ISINs and invented names.

## Consequences

- Four tables, one column on `accounts`, the #366 trigger widened, an ISIN check function; each with its constraint spec.
- The PEA's value updates from a statement read by Claude in one call, and its history (values at each statement) follows; the owner stops typing the total by hand, but still can.
- A compte-titres (#414) only adds its type to `POSITION_ACCOUNT_TYPES` and leaves out § 7.
- Prices stay as fresh as the last statement or manual update until a provider is chosen; the page says how old each one is.

## Rejected

- **Current lines only, like `crypto_holdings`.** Quantities over time would be lost, and with them the past values and the month-end values. Statements are how the owner learns his positions anyway.
- **Reusing `crypto_holdings` and `crypto_prices`.** Their asset ids are the price provider's (CoinGecko), their lines have locations and origins (import, sync), their cost follows a replay of movements (#373): none of it fits a security known by ISIN and valued from statements.
- **Computing the value on read, without a snapshot.** Net worth, the lists, Épargne, the month close and the frozen reports all read `balance_snapshots`; a second way of getting a value would have to be taught to each of them.
- **The lines win over a typed value of the same day.** The statement's printed total includes what the lines alone may miss (accrued items, rounding of the broker): it is the better figure for its day.
- **Storing each line's cost in cents.** The statement prints a PRU with up to four decimals; storing it exactly keeps the cost right when the quantity changes on the next statement.
- **An unofficial price source now.** See § 4.

## Decisions for the owner

1. The model of dated statements, with hand edits made as of today (§ 1, § 3).
2. Prices from statements and by hand only for now, no public source (§ 4).
3. A typed value wins its day over the lines' value (§ 5).
4. The invested amount wins; the lines' cost is its fallback (§ 6).
5. The page's direction (prototypes « A » and « B » in Storybook, Prototypes › Lignes du PEA (#413)).
