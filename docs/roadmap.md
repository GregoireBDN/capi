# Roadmap

Work is tracked as GitHub issues grouped into milestones: <https://github.com/GregoireBDN/finances/milestones>.

- **M1 — Foundations**: clean single-user base (project rename, password-only auth, no analytics), docs and contribution templates, CI green.
- **M2 — Import**: accounts, CIC CSV parser (Windows-1252, `;` separator, comma decimals), idempotent imports with preview, deduplication and balance continuity checks.
- **M3 — Transactions & Dashboard**: transaction list and editing, `kind` (expense / income / transfer), rule-based categorization and review queue, monthly dashboard, budgets per category.
- **M4 — Subscriptions & Savings**: recurring transaction detection and fixed costs, investment accounts with value snapshots, net worth, end-of-month forecast.
- **M5 — Mobile (PWA)**: mobile-first UI, installable PWA (manifest, service worker).
- **M6 — Deployment**: production compose stack on a VPS, reachable only through Tailscale, backups, release tags `vX.Y.Z`.
- **M7 — Access & security**: passkey sign-in (WebAuthn), personal access tokens with scopes, automated security scanning in CI, full security audit and penetration test (gate for any public exposure).
- **M8 — Claude (MCP)**: MCP server for Claude (read tools, then write tools: manual transactions, categorization, rules), bank CSV imports and investment values from the owner's Google Drive documents through MCP, then remote access with OAuth.
- **M9 — Month-end review**: guided month-end review replacing the spreadsheet routine, closed-month reports.
- **M10 — Everyday use**: owner feedback from daily use on the phone: readable dashboard, spending and savings pages, like-for-like monthly comparisons, easy setup of accounts, investments and crypto (exchange imports, wallet sync), configurable categories and rules.

Domain rules and workflow conventions: see [`CLAUDE.md`](../CLAUDE.md).
