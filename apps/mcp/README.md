# @finances/mcp — local MCP server

Lets Claude (Claude Desktop or Claude Code, on the owner's machine) answer questions about the finances by calling the app's API with a **read-only personal access token**. It runs locally over **stdio**: the MCP client starts it as a child process; nothing listens on a port.

- It only calls the public API (`GET /api/...`) with `Authorization: Bearer <token>`; it never opens the database.
- Tools are read-only. A `read` token can't write anyway: the API refuses every non-GET route to tokens unless the route opts in.
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

Account and category filters take names (case- and accent-insensitive, a unique partial match works) or slugs; ambiguous or unknown names come back with the list of choices. Months are `YYYY-MM`, dates `YYYY-MM-DD`. A partial current month is stated and compared like for like, as in the app.

API errors come back as readable tool errors: 401 (token invalid, expired or revoked), 403 (route not open to tokens), 429 (rate limit: 60 requests per minute per token, with the wait), API unreachable or too slow.

## Setup

### 1. Build the server

```bash
pnpm install
pnpm --filter @finances/mcp build
```

The entry point is `apps/mcp/dist/index.js` (Node ≥ 22). Rebuild after pulling changes. `pnpm build` from the root builds it too (it first regenerates the API types from `apps/api/openapi.json`).

### 2. Create a read token

In the app, open **Profil → Jetons d’accès**, create a token with the **Lecture seule** scope and, ideally, an expiry. It is shown once: copy it into your MCP client configuration (below), nowhere else. Revoke it from the same card if it leaks; its calls are listed under **Derniers appels**.

### 3. Configuration

Two environment variables:

| Variable             | Example                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `FINANCES_API_URL`   | `http://localhost:4000` (local API) or the app URL on the tailnet |
| `FINANCES_API_TOKEN` | `fin_pat_…` (read scope)                                          |

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
- One file per tool group in `src/tools/`; `src/format.ts` formats cents and calendar dates (no time zone conversion; "today" is Europe/Paris).
- Tests use synthetic fixtures only and go through a real MCP client over an in-memory transport (`src/test/mock-api.ts`).
- For a manual run, start an API on a throwaway database (never `finances`), sign up, create a read token (`POST /api/access-tokens` with the session cookie, or the profile page) and point the inspector at it.
