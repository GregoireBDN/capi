# Importing investment values from Google Drive with Claude

The investment statements (PEA, life insurance, employee savings, crypto exports) live in a Google Drive folder. Claude reads them with **its own Google Drive connector** and records the values in Capi with the MCP server's investment tools (#104). **The app has no Google credentials and makes no call to Google**: only the values Claude extracts (dates, amounts in cents, crypto quantities as exact decimal strings) reach the API, each time through a preview you approve.

```
Google Drive ──(Drive connector, read)──▶ Claude ──(finances MCP, write token, confirm: true)──▶ Capi API
```

## 1. Set up the two connections

**Capi MCP server**: follow [`apps/mcp/README.md`](../../apps/mcp/README.md) (build, then register `finances` in Claude Desktop or Claude Code). Use a token with the **Lecture et écriture** scope: the import tools write values, a PEA's lines and holdings. A read-only token still lets Claude list accounts and show previews.

**Google Drive**:

- **Claude Desktop / claude.ai**: Settings → Connectors → Google Drive → Connect, and sign in with the Google account that holds the folder. Enable it in the conversation (the tools menu under the message box) together with `finances`.
- **Claude Code**: Google Drive connectors set up on claude.ai are available in Claude Code when you are signed in with the same account (check with `/mcp`); otherwise add a Google Drive MCP server of your choice with `claude mcp add`. Grant it read access only if it offers scopes.

Neither connection knows about the other: Claude passes values from one to the other in the conversation, and you see each write before it happens.

## 2. Organise the folder

One folder (default name `Finances`), one sub-folder per vehicle, files named `<Vehicle>_<Document>_<YYYY-MM[-DD]>`:

```
Finances/
  PEA/                 PEA_Releve_2026-09-30.pdf, PEA_AvisOpere_2026-10-02.pdf
  AssuranceVie/        AssuranceVie_Releve_2025-12.pdf
  EpargneSalariale/    PEE_Releve_2026-06-30.pdf (some are scans)
  Crypto-Ledger/       Ledger_Operations_2026-10-31.csv
  Crypto-Binance/      Binance_Transactions_2026-10.csv
```

The date in the name lets Claude skip documents older than an account's last value; the date printed in the document wins when they differ. Trade confirmations (`AvisOpere`) carry no account value and are skipped. Binance and Coinbase exports are better imported in the app (exchange crypto account → Import); Claude says so instead of copying them.

## 3. Run it

Pick the prompt **Importer mes investissements** (`/mcp__finances__importer_mes_investissements` in Claude Code; in Claude Desktop, the "+" menu → finances), optionally with another folder name. Claude then:

1. lists the investment accounts and their last value dates (`list_investment_accounts`);
2. matches each sub-folder to an account and, for a vehicle without one, tells you what to create in the app (`create_investment_account` never creates: tokens can't create accounts);
3. reads only the documents newer than each account's last value, and picks the date each value belongs to (valuation date on the statement, else the end of the quarter or year it covers);
4. shows a summary table (account, document, date, value, net contributions, new / replaced / already there) and lists unreadable documents (scans it is not sure about): type those values yourself;
5. calls `add_investment_snapshots` (one call per account), `sync_security_positions` (one per PEA statement that lists its lines) and `sync_crypto_holdings` (one per wallet) without `confirm`, shows the previews with the effect on net worth, and applies them only after you agree.

Running it again on the same documents changes nothing: the tools skip the values that are already recorded.

## What the tools may change

- `add_investment_snapshots`: dated values (and net contributions) of an investment account, through `POST /api/accounts/:id/snapshots/bulk`; existing days are replaced, nothing is deleted.
- `sync_crypto_holdings`: the **hand-entered** holdings of one location (wallet / exchange label) of a crypto account with the **manual** source ("Saisie manuelle"), through `POST /api/accounts/:id/holdings` and `PUT /api/accounts/:id/holdings/:holdingId`. Lines imported from an exchange export or synced from a wallet are never touched; a hand-entered line missing from the new list is set to quantity 0 and stays until you delete it in the app. Exchange and wallet accounts are refused (their imports and syncs feed them); the API refuses them to tokens too.
- `sync_security_positions`: the lines of a **PEA** read from a « relevé de portefeuille », on the statement's day (never after today): each security by ISIN with its quantity, PRU, the statement's price and the cash (« liquidités »). The statement is the whole account that day, so a line left out is a sale. It previews through `POST /api/accounts/:id/positions/statements/:asOf/preview` (new / changed / removed / unchanged lines, the cash, the account's value before → after) and writes through `PUT /api/accounts/:id/positions/statements/:asOf` only with `confirm: true`; a price typed by hand that day is kept. **The PEA's value then follows its lines** (priced lines plus cash), so such a statement needs no `add_investment_snapshots` call for that day; a value typed by hand on a day still wins that day. Other account types are refused. Deleting a statement, editing one line, the cash or a price afterwards stay in the app.
- `set_invested_amount`: what you invested in a **PEA, life insurance or employee savings** up to a day (« Investi au … »), through `POST /api/accounts/:id/invested-base/preview` and `PUT /api/accounts/:id/invested-base` with `confirm: true`; the preview shows the invested amount, result and rate now → after. The invested amount is then this base plus the bank transfers linked to the account after that day, until a value is typed later with its own invested amount. Crypto accounts are refused (their invested amount is the cost of their coins; coins of unknown cost are answered in the app, account page › « À préciser »). Removing the base stays in the app.
- Account creation, deletions, exchange imports, wallet keys and sync stay in the app, signed in.

### An invested base, or contributions on a value?

- The statement prints the **net contributions** (payments minus withdrawals) next to each value: pass them with the value in `add_investment_snapshots`; the latest typed point (these or a base) is the one that counts, with the transfers linked after it added on top.
- The statement prints a value but **no contributions** (many PEA and employee savings statements): use `set_invested_amount` once, with the amount you invested up to the date you know it. The bank transfers you link to the account after that date are added to it by themselves, so there is no need to retype it on each later value.
- Do not copy a figure you cannot read on the document: the tools take it as given and never compute it. Ask, or leave the invested amount unknown (the app then says it is not filled in).

## Privacy

- Documents never leave Google Drive for the app: Claude reads them in the conversation and sends only numbers and dates to the tools. It is told not to copy contract numbers, names or addresses anywhere.
- The MCP server logs only a tool name and an HTTP status; the API audits token calls by method, route and status, never values.
- Don't put real statements in the repository, issues or test fixtures: tests use invented values.
