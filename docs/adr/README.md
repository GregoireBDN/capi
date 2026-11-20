# Architecture decision records

Decisions that shape the project beyond a single change. One file per decision, numbered, never rewritten once accepted: factual updates made while implementing it go in a dated **Amendments** section at the end, and a changed decision needs a new ADR that supersedes the old one.

Each ADR states its **status** (Proposed, Accepted, Superseded by NNNN), the **context**, the **decision** with the alternatives rejected and why, and its **consequences**.

| #                                                | Decision                                                    | Status   |
| ------------------------------------------------ | ----------------------------------------------------------- | -------- |
| [0001](0001-multi-app-hosting.md)                | Multi-app hosting on a single VPS                           | Accepted |
| [0002](0002-wallet-sync-privacy.md)              | Reading self-custody wallets from public endpoints          | Accepted |
| [0003](0003-remote-mcp-oauth.md)                 | Remote MCP access with OAuth                                | Accepted |
| [0004](0004-transfer-links-and-contributions.md) | Linking transfers to accounts, contributions from the links | Accepted |
| [0005](0005-data-model-consolidation.md)         | Consolidating the data model before shared costs            | Proposed |
