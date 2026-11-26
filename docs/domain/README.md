# Domain details

Each feature's details, moved out of [`CLAUDE.md`](../../CLAUDE.md) by #422 so that the file every agent session loads keeps only the product, the domain rules, the workflow, the commands and the architecture in short. Read the file of the feature you change, and keep it up to date in the same PR.

| File                                                 | What it holds                                                                                                  |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`transactions.md`](transactions.md)                 | Kind follows category, transfer links, manual transactions, hand edits, splits, the transaction editor         |
| [`money-owed.md`](money-owed.md)                     | Contacts, receivables, repayments, the counting rule, shared recurring items, « Dépenses partagées »           |
| [`recurring.md`](recurring.md)                       | Detection, prepaid subscriptions, cancellation                                                                 |
| [`months-and-dashboard.md`](months-and-dashboard.md) | Partial months, the month bar and navigator, Opérations filters, the end-of-month forecast, the dashboard      |
| [`budgets.md`](budgets.md)                           | Planned income, tracked budget lines, shared expenses in budgets                                               |
| [`envelopes.md`](envelopes.md)                       | Envelopes: allocations per account, « libre », split keys, offers, spending and the budget                     |
| [`month-close.md`](month-close.md)                   | « Bilan du mois », closing and reopening, frozen reports and their versions                                    |
| [`accounts.md`](accounts.md)                         | Meal vouchers, archive or delete, a cash account's page, account lists                                         |
| [`investments.md`](investments.md)                   | Value snapshots, a PEA's lines, one invested amount per account, the investment summary, Épargne               |
| [`crypto.md`](crypto.md)                             | Prices, cost basis, observed movements, loading, daily values, wallet sync, the crypto pages, exchange imports |
| [`imports.md`](imports.md)                           | Undoing an import, reconciliation, the spreadsheet history import                                              |
| [`import-formats.md`](import-formats.md)             | The standard CSV formats (cash, investments), import profiles per source, unknown files                        |
| [`categorization.md`](categorization.md)             | Rule order, the review queue, categories and seed data                                                         |
| [`auth-and-sessions.md`](auth-and-sessions.md)       | Sessions and cookies, passkeys, personal access tokens, remote MCP OAuth, SSR session renewal                  |
| [`web-conventions.md`](web-conventions.md)           | The app shell, page headers and actions, month pages, sheets, pickers, mobile layout                           |
| [`pwa.md`](pwa.md)                                   | Manifest, icons, service worker, HTTP cache policy, security headers                                           |
| [`mcp.md`](mcp.md)                                   | The MCP tools, prompts, output, remote transport, tests                                                        |
| [`containerisation.md`](containerisation.md)         | Client IP and trusted proxies, the production stack, images                                                    |
