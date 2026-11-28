# Updating investments

Recording the values of the investments (PEA, compte-titres, life insurance « assurance vie », employee savings « épargne salariale », crypto) from the owner's statements. Their documents are often in a Google Drive folder (by default « Finances ») read with the client's Google Drive connector; they may also paste a statement or attach a PDF.

## Rules for investments

- The Google Drive connector is **for reading only**: create, move, change or share no file.
- Only the extracted values (dates, amounts, quantities) go to the Capi tools: never a contract or account number, a name, an address, the content of a document.
- Copy digit for digit; do not round, convert, or compute a value the document does not give.
- Never create an account: `create_investment_account` checks the name and says what to create in the app; the owner creates it.

## Steps

1. **Current state**: `list_investment_accounts`. Note each account's last value date.
2. **Documents**: one sub-folder per vehicle (PEA, compte-titres, life insurance, employee savings, crypto exchanges and wallets). Match each to an account (name, institution). A vehicle without an account: `create_investment_account`, then ask the owner to create it and resume once it shows in `list_investment_accounts`.
3. **Which documents**: named `<Support>_<Document>_<AAAA-MM[-JJ]>` (vehicle, document, date; e.g. `PEA_Releve_2026-09-30.pdf`). Handle only those dated after the account's last value, unless the owner asks to fill in the history. A name outside the convention: read the date in the document.
4. **The value's date**: the valuation date printed (« valorisation au… », « situation au… »). Failing that, the statement's date; for a quarterly statement without a date, the last day of the quarter; for a yearly life insurance statement, 31/12. If the file name and the document disagree, say so and take the document's. Never a future date.
5. **What to record**: the vehicle's total value on that date and, if given, the cumulative net contributions (payments in − withdrawals). Trade confirmations, switches and order confirmations give no account value: ignore them.
6. **PEA or compte-titres with its lines** (« relevé de portefeuille »): record every line (ISIN, name, quantity, average cost « PRU », the statement's price) and the cash, for `sync_security_positions` on the statement's date. **Every** line: a missing line is taken as sold. The account's value then follows its lines: no `add_investment_snapshots` needed for that day.
7. **Crypto**: a Binance or Coinbase export is better imported in the app (an exchange-type crypto account): say so rather than copy it. A Ledger wallet is synced or imported in the app. For another statement, record the quantity held per asset; if the file only gives transactions, add them up per asset without rounding and show the calculation. Then `sync_crypto_holdings` (manual crypto accounts only) with the wallet's name as `location`, always written the same way. The euro value is computed in the app. Bringing in every exchange and a Ledger at once: [crypto.md](crypto.md).
8. **Unreadable documents** (scanned PDF, cut page, doubtful figure): try reading the image; if you are not sure of every digit, do not record it: list the document and ask the owner to type the value.
9. **Summary before writing**: a table | Account | Document | Value date | Value | Invested | Action (new, replaced, already there) |, plus the documents ignored or unreadable and why.
10. **Previews**: one `add_investment_snapshots` per account (all its dates in one call), one `sync_security_positions` per statement with lines, one `sync_crypto_holdings` per wallet, without `confirm`. Show the previews (including the effect on net worth), then, once the owner agrees, the same calls with `confirm: true`.
11. **End**: `list_investment_accounts` again, and what is left (accounts to create, unreadable documents, accounts not up to date). Running again on the same documents changes nothing.

## Invested amount: contributions or a base?

- The statement gives **net contributions** next to each value: pass them with the value (`contributions` of `add_investment_snapshots`).
- The statement gives a value **without contributions** (many PEAs and employee savings plans): `set_invested_amount` once, with what was invested up to the day the owner knows it. Transfers linked to the account after that day add up on their own.
- **Transfers paid in** from a bank account (checking → PEA, life insurance…) count in the invested amount once linked to it: find them with `search_transactions`, then `categorize_transactions` with `counterpart` (the account's name) on those not linked yet. The preview gives what the amount gains; transfers dated on or before the base's day are already in it. A link is removed in the app.
- Not for crypto: a crypto account's invested amount is the cost of its coins, set in the app.
- An unreadable figure is never copied: ask, or leave the invested amount unknown.
