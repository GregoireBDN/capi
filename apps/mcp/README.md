# @capi/mcp — MCP server (local stdio, remote HTTP)

Lets Claude (Claude Desktop or Claude Code, on the owner's machine) answer questions about the finances, and help with the month-end routine, by calling the app's API with a **personal access token** (read-only, or write for the write tools). It runs locally over **stdio**: the MCP client starts it as a child process; nothing listens on a port. A remote HTTP transport with OAuth exists for claude.ai and the Claude apps, **disabled** (see [Remote access](#remote-access-claudeai-claude-apps--78-disabled)).

- It only calls the public API (`/api/...`) with `Authorization: Bearer <token>`; it never opens the database.
- Read tools work with a `read` token. Write tools need a `write` token and **never change anything without `confirm: true`**: called without it they return a preview of exactly what would change. The API refuses every non-GET route to tokens unless the route opts in, and no route that deletes or touches accounts or sign-in ever does: there are **no delete tools**. Of the import routes, only the bank CSV preview and commit are open to `write` tokens (#103).
- Outputs are French text: euros formatted from integer cents, dates as `dd/mm/yyyy`, months as `novembre 2026`. Negative amounts are money out; internal transfers are never counted as income or expenses.
- Nothing about the data is logged. stdout carries the MCP protocol; the few log lines go to stderr and hold only a tool name and an HTTP status.

## Tools

| Tool                   | API                                               | What it answers                                                                                                     |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `accounts_overview`    | `GET /api/dashboard/overview`                     | Net worth (cash / investments, change since the last month end), accounts with their latest balance, stale ones.    |
| `search_transactions`  | `GET /api/transactions`, `/summary`               | Transactions by month or dates, category, account, text, kind; totals over every match. Paged (30 rows by default). |
| `list_categories`      | `GET /api/categories`                             | Category names and slugs accepted by the filters.                                                                   |
| `spending_by_category` | `GET /api/spending/by-category`                   | One month by category vs the previous month, the average of past months and the budget target.                      |
| `spending_history`     | `GET /api/spending/trend`                         | Month-by-month spending per category (up to 36 months), with the average of complete months.                        |
| `budget_status`        | `GET /api/budgets`, `/api/budgets/envelopes`      | Spent vs target per budgeted category, unbudgeted spending; tracked envelopes and pace for the current month.       |
| `budget_history`       | `GET /api/budgets/history`                        | Spent / target per category, month by month (up to 24 months).                                                      |
| `subscriptions`        | `GET /api/recurring`, `/api/recurring/summary`    | Subscriptions and fixed costs (monthly / yearly), recurring income, debits expected in the next days.               |
| `month_end_forecast`   | `GET /api/forecast`                               | Projected checking balance at the month end, lowest point, first day under a threshold.                             |
| `savings_and_goals`    | `GET /api/savings/overview`, `/api/savings/goals` | Saved per month and on average, savings stock (accounts, investments, gains), goals and their projection.           |
| `month_review`         | `GET /api/dashboard/review`                       | Month-end review (default: previous month): accounts not up to date, net worth change, budget gaps.                 |

Read tools added with the write tools: `month_close_status` (`GET /api/month-close/:month`: steps of the "Bilan du mois" and what is left in each), `review_queue` (`GET /api/transactions?needsReview=true`, with ids), `budget_suggestions` (`POST /api/budgets/suggest`, saves nothing: average spending of past months per category). `integrity_checks` (#427, `GET /api/integrity?month=`: the review's « Cohérence des chiffres », each finding with its account and day, nothing fixed). Transactions are listed with their `id`, which the write tools take.

### Write tools (write token)

| Tool                      | API                                                                 | What it changes                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add_transaction`         | `POST /api/transactions/manual`                                     | A transaction entered by hand (expense, income or internal transfer), e.g. "12,50 € à la boulangerie hier". Replaced by the bank row when the statement is imported.                                                                                                                                |
| `categorize_transactions` | `PATCH /api/transactions/:id`, `POST /api/transactions/bulk-update` | Category of 1 to 100 transactions, filed by hand, with its kind (#368); "uncategorized" removes it (a kind only then).                                                                                                                                                                              |
| `mark_one_off`            | same                                                                | One-off flag of 1 to 100 transactions (or back to regular).                                                                                                                                                                                                                                         |
| `set_transaction_note`    | `PATCH /api/transactions/:id`                                       | The note of one transaction (replaced, or cleared with `""`).                                                                                                                                                                                                                                       |
| `create_rule`             | `POST /api/categorization-rules` (+ `/preview`, `/apply`)           | A categorization rule ("label contains …" → category), last in order; optionally re-applies the rules to existing transactions.                                                                                                                                                                     |
| `set_budget_targets`      | `PUT /api/budgets/:categoryId`                                      | Monthly targets of one or several expense categories from a month on, in one call (e.g. next month's budget prepared from `budget_suggestions`).                                                                                                                                                    |
| `close_months`            | `GET /api/month-close`, `POST /api/month-close/:month/close`        | Closes past months of the « Bilan du mois » (freezes their report): one `month`, or `allBefore: true` for every month left open since the first one ever closed (« clôture tous les anciens mois »; `from` when none was ever closed). Reopening stays in the app.                                  |
| `split_transaction`       | `PUT /api/transactions/:id/splits`                                  | Splits one transaction between 2 to 20 categories (amounts in euros, without sign). Each part counts with its category's kind: an incoming part in an expense category is a refund of it (« remboursement de Restaurants »), one in an income category is income. Undoing a split stays in the app. |

### Investment tools (#104)

For values Claude reads in the owner's statements (see [Importing investment values from Google Drive](../../docs/runbooks/investments-from-drive.md)): the app never sees the documents, only the extracted dates, cents and quantities.

| Tool                        | API                                                                                                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_investment_accounts`  | `GET /api/investments/summary`, `GET /api/accounts`                                                | Read. Investment accounts with type, institution, crypto source, last value and date, net contributions, stale ones.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `add_investment_snapshots`  | `GET /api/accounts/:id/snapshots`, `POST /api/accounts/:id/snapshots/bulk`                         | Write. Dated values (and optional net contributions) of an investment account, upserted per day; the preview shows new / replaced / unchanged days and the effect on the current value and net worth.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `sync_crypto_holdings`      | `GET /api/accounts/:id/holdings`, `POST` / `PUT …/holdings[/:holdingId]`, `GET /api/crypto/assets` | Write. The quantities held at one location (wallet / exchange label) of a crypto account, as exact decimal strings. Only on crypto accounts with the **manual** source (exchange accounts are fed by their imports, wallets by their sync, in the app; the API also refuses those to tokens with 403). It owns only the **hand-entered** lines of that location: imported and synced lines are never touched (an asset held through one is refused), and hand-entered lines missing from the list are set to quantity 0, not deleted: the preview and the result say so, and the owner deletes them in the app. |
| `set_invested_amount`       | `POST /api/accounts/:id/invested-base/preview`, `PUT /api/accounts/:id/invested-base`              | Write (#358, #360). What the owner invested in an investment account up to a day: a PEA, a life insurance, employee savings, a crypto wallet or manual crypto account. The invested amount is that base plus what is linked to the account after that day (transfers, or the cost of coins sent from a followed exchange); it wins over the amounts typed on the values from its day. The preview gives the invested amount, result and rate now → after; a repeated call changes nothing. Not for exchange accounts. Removing the base is done in the app.                                                     |
| `create_investment_account` | `GET /api/accounts`                                                                                | Read. Tokens cannot create accounts: it checks the name (open or archived duplicate) and gives the fields to enter in the app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Contributions are carried by the snapshots (`contributionsCents`), so there is no separate contributions tool. The tickers are resolved against the account's holdings first, then the app's asset search (only the ticker is sent to the price provider); an ambiguous ticker asks for the CoinGecko id.

How they behave:

- **Preview, then confirm.** Without `confirm: true` a write tool only reads: it resolves names, loads the current state (`GET /api/transactions?ids=…` for a selection) and shows each change (current → new). Claude shows it to you and calls again with `confirm: true` only after you agree. Amounts are typed as text (`"12,50"`) and converted to cents without floats.
- **Idempotent.** On confirm the tool re-reads and applies only what still differs: transactions already in the category, targets already set, a note already there, an identical rule are skipped, so a repeated call changes nothing more. `add_transaction` refuses a second transaction with the same day, amount and account unless `allowDuplicate: true` (after you confirm it is another one).
- **Undo.** Results list exactly what changed and how to undo it: the same tool with the previous values (category, one-off flag, note, targets). A created transaction, a created rule or a target where there was none are removed in the app (no delete tools).
- Errors: a `read` token gets "token en lecture seule" (403), a conflict (409) or rate limit (429) says that nothing was changed; a write that timed out may or may not have been applied, and calling it again does no harm.

### Bank statement imports (write token, #103)

| Tool                  | API                                                    | What it does                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preview_bank_import` | `POST /api/imports/preview` (multipart)                | Uploads a statement for a checking or savings account (the CIC export, the app's standard format, or a format saved in the app): new / already imported / conflicting rows, continuity of the running balance, proposed categories, a `previewId`. **Writes no transaction.** |
| `commit_bank_import`  | `GET /api/imports/:id`, `POST /api/imports/:id/commit` | Without `confirm`: what the preview would write. With `confirm: true`: writes the new rows (conflicts only with `includeConflicts: true`), then lists the import's rows in the review queue with their ids.                                                                   |
| `list_imports`        | `GET /api/imports` (read token)                        | Last import, its period and how far the statements go per checking / savings account; previews waiting to be committed.                                                                                                                                                       |

- The file is either a path on your machine (`filePath`, absolute or `~/…`, a `.csv` of at most 5 MB, sent as is: CIC exports are Windows-1252) or its text (`content`, sent as UTF-8 with a BOM, which every reader recognizes). Nothing else on the disk is read.
- **Any other statement** (another bank's export, a PDF, a table pasted in the chat; #431): Claude converts it into the app's **standard cash format** and passes it as `content`, so you validate it in the usual preview. A header line `date;amount;label;balance` (`balance` and `value_date` optional, any order), dates `YYYY-MM-DD`, signed amounts in euros (negative = money out, `.` or `,` decimals, no thousands separator but a space), one line per operation as printed. Full spec: [`docs/domain/import-formats.md`](../../docs/domain/import-formats.md). The API recognises the format from the header (a format saved in the app, the CIC export, then the standard one); an unknown header answers « Format non reconnu » with the standard format to use. The preview names the format read and lists the columns it ignored and the lines it could not read: neither is imported.
- Formats for other banks' CSV exports are saved in the app (Relevés page, from the first file), not through the MCP; the next file with the same header is then recognised here too. The standard investment-movements format is documented for #432; no tool imports it yet.
- Same flow as the Import page: the API parses the file, dedupes it against what is stored (re-importing a file or an overlapping period adds nothing; identical rows of one file stay distinct), shows probable duplicates from another source as conflicts, checks the running balance and proposes categories with the rules. Nothing is written until `commit_bank_import` with `confirm: true`; a pending preview expires after 24 hours.
- Committing a preview that is already committed changes nothing and says so. Rows that went to the review queue come back with their ids, for `categorize_transactions` and `create_rule`. Undoing an import is done in the app (page Import).
- A `read` token gets "lecture seule" on both write tools. Neither the file, its path, labels nor amounts are logged.

### Prompt "Bilan du mois"

`revue_du_mois` (optional `month`, default the previous month) starts a guided month-end review: `month_close_status` and `month_review`, statements to import (`list_imports`, then `preview_bank_import` / `commit_bank_import` with your file, or the app), the review queue (categorize, one-offs, rules), subscriptions, budget, savings, investment values and `integrity_checks`, then next month's budget with `budget_suggestions` and one `set_budget_targets`. It ends with `close_months` once you approve its preview. Every change goes through a preview you approve; investment values, ticking steps and reopening a month stay in the app. In Claude Code it shows as `/mcp__finances__revue_du_mois`.

### Prompt "Importer mes investissements"

`importer_mes_investissements` (optional `folder`, default `Finances`) walks the owner's Google Drive folder **with the client's own Google Drive connector**: one sub-folder per vehicle, files named `<Vehicle>_<Document>_<YYYY-MM[-DD]>`, only documents newer than each account's last value, the date a statement's value belongs to (valuation date, else the end of the quarter or year), accounts created by the owner in the app after asking, a summary table before any write, unreadable or scanned documents flagged for the owner to type. Then `add_investment_snapshots` / `sync_crypto_holdings` previews, and `confirm: true` after approval. Setup: [`docs/runbooks/investments-from-drive.md`](../../docs/runbooks/investments-from-drive.md). The MCP server and the API make no call to Google.

Account and category filters take names (case- and accent-insensitive, a unique partial match works) or slugs; ambiguous or unknown names come back with the list of choices. Months are `YYYY-MM`, dates `YYYY-MM-DD`. A partial current month is stated and compared like for like, as in the app.

API errors come back as readable tool errors: 401 (token invalid, expired or revoked), 403 (route not open to tokens, or a write with a read token), 409 (conflict), 429 (rate limit: 60 requests per minute per token, with the wait), API unreachable or too slow.

## Setup

### 1. Build the server

```bash
pnpm install
pnpm --filter @capi/mcp build
```

The entry point is `apps/mcp/dist/index.js` (Node ≥ 22). Rebuild after pulling changes. `pnpm build` from the root builds it too (it first regenerates the API types from `apps/api/openapi.json`).

### 2. Create a token

In the app, open **Réglages → Claude et accès → Claude sur ce Mac**, choose **Lire seulement** (questions only) or **Lire et classer** (also the write tools), then a duration. The last step shows the token once, already inside a ready-to-paste `claude_desktop_config.json` and `claude mcp add` command (with the app's URL; give the path of `apps/mcp/dist/index.js` once, it is remembered on that device): copy one of them, nowhere else. Revoke it from its row in **Accès actifs** if it leaks; its detail lists what it did in plain words.

### 3. Configuration

Two environment variables:

| Variable         | Example                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `CAPI_API_URL`   | `http://localhost:4000` (local API) or the app URL on the tailnet |
| `CAPI_API_TOKEN` | `fin_pat_…` (read scope, or write for the write tools)            |

The names these variables had before the app was renamed Capi (#464), `FINANCES_API_URL` and `FINANCES_API_TOKEN`, are still read when the new ones are unset, so an older configuration keeps working.

`CAPI_API_URL` can be the API origin or the web origin (the web server proxies `/api/*` with the `Authorization` header); a trailing `/api` is ignored. In production use the app's address on the tailnet: the API port is never published.

### Claude Code

Register it for your user (outside any repository, so the token never lands in a project file):

```bash
claude mcp add finances --scope user \
  -e CAPI_API_URL=http://localhost:4000 \
  -e CAPI_API_TOKEN=fin_pat_REPLACE_ME \
  -- node /absolute/path/to/finances/apps/mcp/dist/index.js
```

Or with a project `.mcp.json` that reads the token from your shell environment (`export CAPI_API_TOKEN=…` in a file that is not committed), so the file itself holds no secret:

```json
{
  "mcpServers": {
    "finances": {
      "command": "node",
      "args": ["/absolute/path/to/finances/apps/mcp/dist/index.js"],
      "env": {
        "CAPI_API_URL": "${CAPI_API_URL:-http://localhost:4000}",
        "CAPI_API_TOKEN": "${CAPI_API_TOKEN}"
      }
    }
  }
}
```

Check it with `claude mcp list`, or `/mcp` inside Claude Code.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (Settings → Developer → Edit Config) and restart Claude Desktop:

```json
{
  "mcpServers": {
    "finances": {
      "command": "node",
      "args": ["/absolute/path/to/finances/apps/mcp/dist/index.js"],
      "env": {
        "CAPI_API_URL": "http://localhost:4000",
        "CAPI_API_TOKEN": "fin_pat_REPLACE_ME"
      }
    }
  }
}
```

Claude Desktop doesn't expand variables, so the token sits in that file: keep it private (`chmod 600`). If `node` isn't found, put its absolute path in `command` (`which node`). Server logs (stderr) are in `~/Library/Logs/Claude/mcp-server-finances.log`.

## Remote access (claude.ai, Claude apps) — #78, #328

`node dist/index.js --http` (`pnpm --filter @capi/mcp start:http`) runs the same tools as a **remote MCP server** over Streamable HTTP, for claude.ai and the Claude mobile and desktop connectors, authorized with **OAuth 2.1**. It is **off by default**: it refuses to start unless `REMOTE_MCP_ENABLED=true`, and the API mounts no OAuth route without it. In production it is the `capi-mcp` service of `docker-compose.prod.yml` (image `ghcr.io/gregoirebdn/capi-mcp`, built by `apps/mcp/Dockerfile`, started only with the `remote-mcp` compose profile, #328); design in [ADR 0003](../../docs/adr/0003-remote-mcp-oauth.md), enabling in [the runbook](../../docs/runbooks/remote-mcp.md).

- **Public surface, nothing else**: `POST /mcp` (stateless: one MCP server per request, JSON responses; `GET` / `DELETE` → 405), `/.well-known/oauth-protected-resource[/mcp]`, and `/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/token`, `/oauth/revoke` relayed to the API's `/api/oauth/*` (form bodies converted to JSON, 16 KB at most). Any other path is 404: the API stays private.
- **Tokens**: `/mcp` takes only OAuth access tokens (`fin_oat_…`) issued by the API for this resource, checked with `GET /api/oauth/token-info` (cached 30 s) and forwarded to the API, which applies the same scope rules as a personal access token. Without a valid token: `401` with `WWW-Authenticate: Bearer resource_metadata="…"`, which starts Claude's OAuth flow. A personal access token never works here.
- **Consent** happens on the web app (`/oauth/authorize`, on the tailnet), in the owner's browser; read only unless "Autoriser les modifications" is ticked. Connections are listed with the tokens in **Réglages → Claude et accès → Accès actifs** and disconnected from their detail.
- **Differences with stdio**: `preview_bank_import` takes the CSV text (`content`) only, never a `filePath` (the server would read its own disk); error messages talk about reconnecting the connector.
- **Limits and logs**: 120 requests/min per client IP and per token here, plus the API's own limits; `Origin` other than the public origin → 403; the client IP comes from `X-Forwarded-For` only through `MCP_TRUSTED_PROXIES` (host names such as `caddy` are resolved every 30 s; one that doesn't resolve trusts nobody). Logs hold the method, a fixed route label and the status.

| Variable                | Example                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `REMOTE_MCP_ENABLED`    | `true` (anything else: refuses to start)                                                         |
| `CAPI_API_URL`          | `http://api:4000` (the API, from this process)                                                   |
| `REMOTE_MCP_PUBLIC_URL` | `https://capi-mcp.example.com` (origin, https)                                                   |
| `MCP_HTTP_HOST`         | `127.0.0.1` (default), `0.0.0.0` in a container                                                  |
| `MCP_HTTP_PORT`         | `4100` (default)                                                                                 |
| `MCP_TRUSTED_PROXIES`   | `loopback` (default; `caddy` in production); IPs, CIDR ranges, host names, `uniquelocal`, `none` |

## Development

```bash
pnpm --filter @capi/mcp test          # Vitest, mocked API (no database)
pnpm --filter @capi/mcp generate      # API types from apps/api/openapi.json
npx @modelcontextprotocol/inspector -e CAPI_API_URL=http://localhost:4000 \
  -e CAPI_API_TOKEN=fin_pat_REPLACE_ME node apps/mcp/dist/index.js
```

- `src/api/generated/` holds types generated from `apps/api/openapi.json` (git-ignored, like the web client); `src/api/client.ts` is the small fetch client (bearer token, timeouts, error messages).
- One file per tool group in `src/tools/` (write tools in `*-writes.ts`, shared preview/confirm helpers in `write.ts`); `src/prompts.ts` and `src/investments-prompt.ts` hold the prompts; `src/quantity.ts` checks crypto quantities as exact decimal strings; `src/format.ts` formats cents and calendar dates (no time zone conversion; "today" is Europe/Paris) and parses typed euros into cents.
- Tests use synthetic fixtures only and go through a real MCP client over an in-memory transport (`src/test/mock-api.ts`); `src/http/server.test.ts` drives the remote adapter with a real Streamable HTTP client on an ephemeral port.
- `src/http/`: the remote adapter (`server.ts`), its configuration, client IP and rate limiter.
- For a manual run, start an API on a throwaway database (never `finances`), sign up, create a token (`POST /api/access-tokens` with the session cookie, or the profile page; `write` scope to try the write tools) and point the inspector at it.
