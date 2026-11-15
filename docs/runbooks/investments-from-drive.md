# Importing investment values from Google Drive with Claude

The investment statements (PEA, life insurance, employee savings, crypto exports) live in a Google Drive folder. Claude reads them with **its own Google Drive connector** and records the values in Finances with the MCP server's investment tools (#104). **The app has no Google credentials and makes no call to Google**: only the values Claude extracts (dates, amounts in cents, crypto quantities as exact decimal strings) reach the API, each time through a preview you approve.

```
Google Drive ──(Drive connector, read)──▶ Claude ──(finances MCP, write token, confirm: true)──▶ Finances API
```

## 1. Set up the two connections

**Finances MCP server**: follow [`apps/mcp/README.md`](../../apps/mcp/README.md) (build, then register `finances` in Claude Desktop or Claude Code). Use a token with the **Lecture et écriture** scope: the import tools write snapshots and holdings. A read-only token still lets Claude list accounts and show previews.

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
5. calls `add_investment_snapshots` (one call per account) and `sync_crypto_holdings` (one per wallet) without `confirm`, shows the previews with the effect on net worth, and applies them only after you agree.

Running it again on the same documents changes nothing: the tools skip the values that are already recorded.

## What the tools may change

- `add_investment_snapshots`: dated values (and net contributions) of an investment account, through `POST /api/accounts/:id/snapshots/bulk`; existing days are replaced, nothing is deleted.
- `sync_crypto_holdings`: the **hand-entered** holdings of one location (wallet / exchange label) of a crypto account with the **manual** source ("Saisie manuelle"), through `POST /api/accounts/:id/holdings` and `PUT /api/accounts/:id/holdings/:holdingId`. Lines imported from an exchange export or synced from a wallet are never touched; a hand-entered line missing from the new list is set to quantity 0 and stays until you delete it in the app. Exchange and wallet accounts are refused (their imports and syncs feed them); the API refuses them to tokens too.
- Account creation, deletions, exchange imports, wallet keys and sync stay in the app, signed in.

## Privacy

- Documents never leave Google Drive for the app: Claude reads them in the conversation and sends only numbers and dates to the tools. It is told not to copy contract numbers, names or addresses anywhere.
- The MCP server logs only a tool name and an HTTP status; the API audits token calls by method, route and status, never values.
- Don't put real statements in the repository, issues or test fixtures: tests use invented values.
