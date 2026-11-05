# Roadmap

Work is tracked as GitHub issues grouped into milestones: <https://github.com/GregoireBDN/finances/milestones>.

- **M1 — Foundations**: clean single-user base (project rename, password-only auth, no analytics), docs and contribution templates, CI green.
- **M2 — Import**: accounts, CIC CSV parser (Windows-1252, `;` separator, comma decimals), idempotent imports with preview, deduplication and balance continuity checks.
- **M3 — Transactions & Dashboard**: transaction list and editing, `kind` (expense / income / transfer), rule-based categorization and review queue, monthly dashboard, budgets per category.
- **M4 — Subscriptions & Savings**: recurring transaction detection and fixed costs, investment accounts with value snapshots, net worth, end-of-month forecast.
- **M5 — Mobile (PWA)**: mobile-first UI, installable PWA (manifest, service worker).
- **M6 — Deployment**: production compose stack on a VPS, reachable only through Tailscale, backups, release tags `vX.Y.Z`.

Domain rules and workflow conventions: see [`CLAUDE.md`](../CLAUDE.md).
