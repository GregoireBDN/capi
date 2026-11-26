# ADR 0008 — Envelopes: money set aside, split across accounts

- **Status**: Accepted
- **Date**: 2026-11-26
- **Issue**: #429 (milestone M13 Envelopes), from the owner's decisions on #428; screens in #430

## Context

The owner (#428, 21–22 Nov) wants one object for money set aside for a goal (a trip, an item to buy, a loan deposit, a large purchase): the **envelope**. It has an optional target and due date and the categories it will pay for. Each account splits its balance between its envelopes and « libre »; a split key in percent shares each new saving between them; the owner moves money by hand; a transfer out of an account can carry an envelope with it; an envelope's expenses count in the month's budget and the envelope adds what it paid to that budget. When a balance falls under its envelopes, the app warns and never reduces anything by itself.

Savings goals (`savings_goals`, #142) are the closest thing today: a target, a date, and an amount read from linked accounts' **whole balances** or typed by hand. Two goals on the same Livret A both count its whole balance, and nothing records what was set aside where.

## Decision

1. **An envelope is a label on money, never a transaction.** Allocations live in their own tables and are never read by balances, net worth, statistics, the month report or the forecast. Net worth is identical before and after any envelope change.
2. **Tables** (all with `coreColumns` and `set_updated_at`):
   - `envelopes`: `name`, `icon`, `color`, optional `target_cents` (> 0) and `due_date`, `archived_at`.
   - `envelope_categories`: the expense categories it pays for (optional; offers only, attaching stays possible in any expense category).
   - `envelope_movements`: **the ledger** of an envelope on an account. An envelope's amount on an account is the sum of its rows there; its total, the sum over accounts. Each row has an `amount_cents` (≠ 0, signed), a calendar day `on_date`, a `reason` and its links:
     - `start`: money taken from « libre » when the envelope is created (or by the goals conversion), positive;
     - `move`: a hand move on one account between an envelope and « libre » or another envelope; a move between two envelopes is two rows naming each other (`counter_envelope_id`);
     - `split`: an envelope's share of a saving (`transaction_id`), positive, on the saving's account;
     - `transfer`: an outgoing transfer carrying the envelope (`transaction_id`): one negative row on the transfer's account and one positive row on its counterpart, summing to 0;
     - `spend`: what the envelope paid of an expense (`transaction_id`), on the expense's account, with the expense's sign.
   - `envelope_split_keys`: per account and envelope, `basis_points` (1–10 000); what is left to 10 000 is « libre ».
   - `envelope_offer_dismissals`: the « Non » given to an offer on a transaction.
3. **« Libre » is computed**: an account's balance − its envelopes. Below 0 it is the **gap** (`shortfallCents`), reported on the account and in the list, never reduced automatically.
4. **Amounts are stored, not derived from the transaction.** A transfer of 1 000 € may carry only the 300 € the envelope held there, and an expense of 1 200 € may be paid 1 000 € by the envelope and 200 € by the month's budget. So the amount moved or paid is the ledger row's, at most the transaction's own amount.
5. **Spending and the budget.** An expense keeps its category and counts once in the month's spending (`transaction_lines` is untouched). What an envelope paid is attributed to the transaction's expense lines in their order, each at most its owner's part, and **adds to that month's budget** of those categories: a budget line gains `envelopePaidCents` and its remainder and status compare spending with the target **plus** what envelopes paid. The month close's frozen report is unchanged.
6. **Split key.** Applied as a **proposal** to each saving that enters the app on an account with a key (an incoming income or transfer row created after the key, not the arriving side of a transfer that already carries an envelope): each envelope's share is rounded down to the cent, the rest stays « libre ». The owner confirms it (as is or changed) or says « Non ».
7. **Offers** (`GET /api/envelopes/offers`): savings to split, outgoing transfers from an account where envelopes hold money (listing them, plus « Non »), and expenses in an envelope's categories on an account where it holds money. Nothing is attached without the owner.
8. **After the due date** the envelope says so (`targetDatePassed`); what is left goes back to « libre » or to another envelope by a move. Nothing moves by itself.
9. **Database rules** (#367, ADR 0005 R3):
   - checks: a positive target, a non-empty name, a non-zero amount, the links of each reason (`transaction_id` exactly on `split`, `transfer`, `spend`; `counter_envelope_id` on `move` only, never the envelope itself), the sign of `start` and `split`, basis points in 1–10 000;
   - unique indexes: one envelope per attached expense or transfer and account, one split row per saving and envelope, one key row per account and envelope;
   - triggers: a category of an envelope is an expense category (and its kind cannot change while an envelope names it); a split key sums to at most 10 000 per account; a movement agrees with its transaction (a `split` on an incoming income or transfer of the same account, all splits at most the saving; a `spend` on an expense of the same account, same sign, at most its amount; a `transfer` on an outgoing transfer with a counterpart, its two legs on those accounts, summing to 0, at most its amount);
   - every write path that changes a transaction clears what its new values forbid, in the same statement: a trigger on `transactions` deletes the movements its new kind, account, counterpart or amount no longer allows.
10. **Never below zero** is a rule of the owner's moves: a move, a start or an attachment never takes more than the envelope (or « libre ») holds on that account (400). Undoing an import or deleting an account can still leave an envelope below zero on an account (the transfer that brought it there is gone); that is reported (`negativeAccounts`), like the gap, and not refused, since those deletions are deliberate.
11. **Deleting** a transaction deletes its movements (cascade): the expense or transfer did not happen, so the money is back where it was. Reconciliation moves them from the manual expense to its bank row, and undoing an import moves them back to the manual expense it restores, as splits and shares already are. Deleting an account deletes its key, its movements and both legs of the transfers that touched it. Deleting an envelope deletes its ledger (its money goes back to « libre »); a move's other side then shows « libre ».
12. **Access**: tokens and the MCP read envelopes (`savings_and_goals`, read only); every write is session only (no `@TokenAccess('write')`).
13. **Savings goals** are converted by #430, which replaces the Épargne page's goals section (the owner, 26 Nov: the page still edits goals until then). The conversion is written and tested here (`envelopes/convert-goals.ts`): each goal becomes an envelope with the same name, colour, target, due date and archive state; an `accounts` goal takes, as `start`, what its linked accounts still have « libre » (goals by due date first, so a shared account is never over-allocated); a `manual` goal's amount is placed on the bank account with the most « libre », or reported when none can hold it. The goals' tables are dropped by #430 once converted.

### Alternatives rejected

- **Envelopes as transactions** (moves between sub-accounts): every statistic, balance and continuity check would have to skip them, and a forgotten reader would count them as transfers.
- **One allocation column per envelope and account** (`amount_cents`, edited in place): no history per account (« Évolution »), and an attached transfer would have to update two rows with nothing tying them together.
- **Deriving spend and transfer amounts from the transaction**: an envelope could not pay part of an expense nor carry part of a transfer, and an edited transaction would silently change past allocations.
- **Percentages applied automatically to every saving**: the owner wants to confirm, and a refund or a salary on a keyed account is not always a saving.
- **A database rule that no envelope is ever below zero on an account**: it would make undoing an import or deleting an account fail on a deferred trigger with no way out for the owner.

## Consequences

- New module `apps/api/src/envelopes/`, routes under `/api/envelopes` and `/api/accounts/:id/envelopes`, migration `0053_envelopes`.
- `GET /api/budgets` lines and totals gain `envelopePaidCents` and the envelopes that paid; `remainingCents`, `percentUsed` and `status` read target + paid by envelopes.
- The dashboard's current « Enveloppes » card (tracked budget lines, `GET /api/budgets/envelopes`) becomes « Budgets suivis » in #430; its route keeps its name until then.
- #430 builds the screens (account split, envelope page, budget line, creation in six steps), runs the goals conversion and deletes the prototypes of #456.
