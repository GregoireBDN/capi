# ADR 0004 — Linking transfers to accounts, contributions from the links

- **Status**: Accepted
- **Date**: 2026-11-19
- **Issue**: #296 (milestone M11 UX overhaul & insights)

## Context

Money moves from the checking account to the owner's other accounts: livrets, the PEA, life insurance, a crypto exchange, then from the exchange to a wallet. On the bank side these rows are `transfer` (never income or expense), but nothing said **which** account they went to. On the investment side the invested amount (`balance_snapshots.contributions_cents`) was typed on each statement, or derived from exchange exports for crypto. There was no reliable total invested vs current value, per account and in total.

## Decision

1. **A transfer names the owner's other account.** `transactions.counterpart_account_id` (nullable, `ON DELETE SET NULL`, never the transaction's own account: check constraint) is the account the money goes to (amount < 0) or comes from (amount > 0). Only transfers carry one: any change of kind away from `transfer` clears it (hand edits, bulk edits, rules, manual transactions). It is set:
   - **by hand**: `PATCH /api/transactions/:id` with `counterpartAccountId` (« Vers » / « Depuis » in the transaction editor);
   - **by a rule**: `categorization_rules.counterpart_account_id` (« Compte de destination », only on a rule whose outcome is a transfer) is given to the transfers the rule files when they have none, on import and when the rules are re-applied; a link set earlier is never overwritten;
   - **by matching** the two sides of a transfer between two of the owner's open cash accounts (checking, savings): same amount with the opposite sign, booked at most **3 days** apart, both unlinked transfers; the closest wins and two candidates as close on different accounts leave the row unlinked rather than guess. Both sides are linked. Matching only looks at the rows an import (bank CSV, spreadsheet history, demo) just inserted, so a link removed by hand is never put back.
2. **Contributions come from the links.** For a brokerage, life insurance or employee savings account with linked transfers, the net contributions at a snapshot are those **typed on the last snapshot before the first linked transfer** (0 without one: the bank history starts later than the account) **plus the linked transfers booked after it**, up to the snapshot's day. Snapshots before the first transfer keep what was typed. The typed value stays the fallback for accounts fed from elsewhere (employee savings paid by the employer). When the latest typed contributions since the first transfer differ from the linked ones, the account page says so (a transfer is probably missing or unlinked). Transfers booked after the latest value are reported apart (`linkedAfterValueCents`), not counted in the gain until the next value.
3. **The crypto chain: bank → exchange → wallet.** An exchange's invested amount stays the EUR cost of the coins it holds (from its exports), not the euros sent to it: euros not spent yet are fiat, left out of the holdings. Linking checking → exchange shows where the euros went. Coins then follow their cost: each exchange `withdrawal` stores the cost it took out (`crypto_movements.cost_cents`: its quantity's share of the holding's cost at that moment, **average cost**, computed with the holdings, null when that cost is unknown) and names the account it went to (`crypto_movements.counterpart_account_id`): set at import when one open wallet or manual crypto account alone holds the asset, else by hand (`PATCH /api/crypto-movements/:id`, session only; deposits back to the exchange are linked the same way, with no cost). A crypto account that received linked withdrawals gets as contributions the cost of what it received (no typed base: the holdings' invested amounts are not dated); one withdrawal of unknown cost leaves them unknown. The exchange's cost goes down by the same amount, so exchange + wallet add up to what the coins cost. Indicative gains only: no tax computation (the French global portfolio method is out of scope).
4. **Where the money went.** `GET /api/investments/flows` sums the transfers linked to investment accounts over the last 12 months (configurable), per account and per month; `GET /api/investments/movements` lists the movements one by one (bank transfers to investments, coins between an exchange and the other crypto accounts, with their cost). The Épargne page shows both with the invested / value / gain recap, and each crypto account page its own movements.

Linked transfers stay `transfer`: they never count as income or expense in any statistic, budget or forecast.

## Consequences

- One nullable column on `transactions` and on `categorization_rules`; deleting an account unlinks its transfers (`SET NULL`), never deletes them.
- The invested amount of a PEA or life insurance follows the bank data without typing it on each statement; the typed value remains for the part before the bank history and for accounts fed from elsewhere.
- The demo seed (`pnpm db:demo`) links its checking ↔ Livret A transfers by matching, its PEA and Binance transfers by rules, and its Binance → Ledger withdrawals at import.

## Rejected

- **A separate link table (pairs of transactions).** Most transfers to investments have one side only (the PEA has no transactions); a column on the transaction covers both cases, and a matched pair is simply two rows pointing at each other's account.
- **Automatic links shown as suggestions to accept.** A transfer between two cash accounts with the same amount within 3 days is almost always the same money; asking for each would make the owner tick dozens of rows per month. Ambiguous cases are left unlinked instead, and any link can be changed in the editor.
- **Replacing typed contributions entirely.** Bank history starts years after the accounts were opened; without the typed baseline the gain would be absurd.
