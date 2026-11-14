# @finances/mcp — local MCP server

Lets Claude (Claude Desktop or Claude Code, on the owner's machine) answer questions about the finances, and help with the month-end routine, by calling the app's API with a **personal access token** (read-only, or write for the write tools). It runs locally over **stdio**: the MCP client starts it as a child process; nothing listens on a port.

- It only calls the public API (`/api/...`) with `Authorization: Bearer <token>`; it never opens the database.
- Read tools work with a `read` token. Write tools need a `write` token and **never change anything without `confirm: true`**: called without it they return a preview of exactly what would change. The API refuses every non-GET route to tokens unless the route opts in, and no route that deletes, imports or touches accounts or sign-in ever does: there are **no delete tools**.
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

Read tools added with the write tools: `month_close_status` (`GET /api/month-close/:month`: steps of the "Revue du mois" and what is left in each), `review_queue` (`GET /api/transactions?needsReview=true`, with ids), `budget_suggestions` (`POST /api/budgets/suggest`, saves nothing: average spending of past months per category). Transactions are listed with their `id`, which the write tools take.

### Write tools (write token)

| Tool                      | API                                                                 | What it changes                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add_transaction`         | `POST /api/transactions/manual`                                     | A transaction entered by hand (expense, income or internal transfer), e.g. "12,50 € à la boulangerie hier". Replaced by the bank row when the statement is imported. |
| `categorize_transactions` | `PATCH /api/transactions/:id`, `POST /api/transactions/bulk-update` | Category (and kind) of 1 to 100 transactions, filed by hand; "uncategorized" removes it.                                                                             |
| `mark_one_off`            | same                                                                | One-off flag of 1 to 100 transactions (or back to regular).                                                                                                          |
| `set_transaction_note`    | `PATCH /api/transactions/:id`                                       | The note of one transaction (replaced, or cleared with `""`).                                                                                                        |
| `create_rule`             | `POST /api/categorization-rules` (+ `/preview`, `/apply`)           | A categorization rule ("label contains …" → category), last in order; optionally re-applies the rules to existing transactions.                                      |
| `set_budget_targets`      | `PUT /api/budgets/:categoryId`                                      | Monthly targets of one or several expense categories from a month on, in one call (e.g. next month's budget prepared from `budget_suggestions`).                     |

How they behave:

- **Preview, then confirm.** Without `confirm: true` a write tool only reads: it resolves names, loads the current state (`GET /api/transactions?ids=…` for a selection) and shows each change (current → new). Claude shows it to you and calls again with `confirm: true` only after you agree. Amounts are typed as text (`"12,50"`) and converted to cents without floats.
- **Idempotent.** On confirm the tool re-reads and applies only what still differs: transactions already in the category, targets already set, a note already there, an identical rule are skipped, so a repeated call changes nothing more. `add_transaction` refuses a second transaction with the same day, amount and account unless `allowDuplicate: true` (after you confirm it is another one).
- **Undo.** Results list exactly what changed and how to undo it: the same tool with the previous values (category, one-off flag, note, targets). A created transaction, a created rule or a target where there was none are removed in the app (no delete tools).
- Errors: a `read` token gets "token en lecture seule" (403), a conflict (409) or rate limit (429) says that nothing was changed; a write that timed out may or may not have been applied, and calling it again does no harm.

### Prompt "Revue du mois"

`revue_du_mois` (optional `month`, default the previous month) starts a guided month-end review: `month_close_status` and `month_review`, statements to import, the review queue (categorize, one-offs, rules), subscriptions, budget, savings, investment values, then next month's budget with `budget_suggestions` and one `set_budget_targets`. Every change goes through a preview you approve; imports, investment values, ticking steps and closing the month stay in the app. In Claude Code it shows as `/mcp__finances__revue_du_mois`.

Account and category filters take names (case- and accent-insensitive, a unique partial match works) or slugs; ambiguous or unknown names come back with the list of choices. Months are `YYYY-MM`, dates `YYYY-MM-DD`. A partial current month is stated and compared like for like, as in the app.

API errors come back as readable tool errors: 401 (token invalid, expired or revoked), 403 (route not open to tokens, or a write with a read token), 409 (conflict), 429 (rate limit: 60 requests per minute per token, with the wait), API unreachable or too slow.

## Setup

### 1. Build the server

```bash
pnpm install
pnpm --filter @finances/mcp build
```

The entry point is `apps/mcp/dist/index.js` (Node ≥ 22). Rebuild after pulling changes. `pnpm build` from the root builds it too (it first regenerates the API types from `apps/api/openapi.json`).

### 2. Create a token

In the app, open **Profil → Jetons d’accès**, create a token with the **Lecture seule** scope (questions only) or the **Lecture et écriture** scope (also the write tools) and, ideally, an expiry. It is shown once: copy it into your MCP client configuration (below), nowhere else. Revoke it from the same card if it leaks; its calls are listed under **Derniers appels**.

### 3. Configuration

Two environment variables:

| Variable             | Example                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `FINANCES_API_URL`   | `http://localhost:4000` (local API) or the app URL on the tailnet |
| `FINANCES_API_TOKEN` | `fin_pat_…` (read scope, or write for the write tools)            |

`FINANCES_API_URL` can be the API origin or the web origin (the web server proxies `/api/*` with the `Authorization` header); a trailing `/api` is ignored. In production use the app's address on the tailnet: the API port is never published.

### Claude Code

Register it for your user (outside any repository, so the token never lands in a project file):

```bash
claude mcp add finances --scope user \
  -e FINANCES_API_URL=http://localhost:4000 \
  -e FINANCES_API_TOKEN=fin_pat_REPLACE_ME \
  -- node /absolute/path/to/finances/apps/mcp/dist/index.js
```

Or with a project `.mcp.json` that reads the token from your shell environment (`export FINANCES_API_TOKEN=…` in a file that is not committed), so the file itself holds no secret:

```json
{
  "mcpServers": {
    "finances": {
      "command": "node",
      "args": ["/absolute/path/to/finances/apps/mcp/dist/index.js"],
      "env": {
        "FINANCES_API_URL": "${FINANCES_API_URL:-http://localhost:4000}",
        "FINANCES_API_TOKEN": "${FINANCES_API_TOKEN}"
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
        "FINANCES_API_URL": "http://localhost:4000",
        "FINANCES_API_TOKEN": "fin_pat_REPLACE_ME"
      }
    }
  }
}
```

Claude Desktop doesn't expand variables, so the token sits in that file: keep it private (`chmod 600`). If `node` isn't found, put its absolute path in `command` (`which node`). Server logs (stderr) are in `~/Library/Logs/Claude/mcp-server-finances.log`.

## Development

```bash
pnpm --filter @finances/mcp test          # Vitest, mocked API (no database)
pnpm --filter @finances/mcp generate      # API types from apps/api/openapi.json
npx @modelcontextprotocol/inspector -e FINANCES_API_URL=http://localhost:4000 \
  -e FINANCES_API_TOKEN=fin_pat_REPLACE_ME node apps/mcp/dist/index.js
```

- `src/api/generated/` holds types generated from `apps/api/openapi.json` (git-ignored, like the web client); `src/api/client.ts` is the small fetch client (bearer token, timeouts, error messages).
- One file per tool group in `src/tools/` (write tools in `*-writes.ts`, shared preview/confirm helpers in `write.ts`); `src/prompts.ts` holds the prompt; `src/format.ts` formats cents and calendar dates (no time zone conversion; "today" is Europe/Paris) and parses typed euros into cents.
- Tests use synthetic fixtures only and go through a real MCP client over an in-memory transport (`src/test/mock-api.ts`).
- For a manual run, start an API on a throwaway database (never `finances`), sign up, create a token (`POST /api/access-tokens` with the session cookie, or the profile page; `write` scope to try the write tools) and point the inspector at it.
