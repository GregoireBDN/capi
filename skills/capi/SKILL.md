---
name: capi
description: Methods for the MCP tools of Capi, the owner's personal finance app (accounts, transactions, budget, month-end review, bank statement import, investments, shared expenses). Read it as soon as a request touches their money and the Capi tools (accounts_overview, search_transactions, month_close_status…) are available, whatever the language, e.g. « fais le bilan du mois », « importe ce relevé », « combien j'ai dépensé en restaurants », « où en est mon budget », « mets à jour mon PEA ».
---

# Capi

Capi is the owner's personal finance app (one user, euros, Europe/Paris time zone). You reach it through the Capi MCP server: its tools read and write through the app's API, never the database. Depending on the client the tools carry a prefix (`mcp__capi__…`, the connector's name); this Skill names them without it.

The app is in French: its screens and labels are quoted here as they appear (« Bilan du mois », « À revoir »…). Quote them the same way when you send the owner to the app. **Reply in the user's language**, concisely.

## Before anything

If no Capi tool is available in this conversation, or a tool answers that the connection or the token was refused (expired, revoked, disconnected), say so and stop there: the owner reconnects the Capi connector (claude.ai) or updates the token (Claude Desktop, Claude Code) from « Réglages › Claude et accès » in the app. Never answer a question about their money without the tools.

Other answers from a tool: too many requests (429), wait the time it gives, then go on, never a loop of retries; a conflict (409) or an expired import preview, nothing was changed, read the current state again and make a new preview; a write that timed out may or may not be applied, calling it again with the same arguments is safe.

## Standing rules

1. **Figures come from the tools.** Never invent, round or recompute a figure a tool gives. A negative amount is money going out.
2. **Moves between the owner's own accounts are never income or expenses** (checking → Livret A, → PEA…). Their kind is `transfer`; never add them to spending or income.
3. **Preview first, always.** Call every write tool first without `confirm`: it only reads and returns the exact preview of what would change. Show that preview and wait for the owner's explicit agreement (« oui », « vas-y », "yes") before calling the same tool again with the same arguments and `confirm: true`. An agreement covers the preview shown, nothing after it. Calling again changes nothing more (the tools are idempotent).
4. **Amounts as text.** Pass amounts in euros as text (`"12,50"`, `"1 234,56"`) and crypto quantities as exact decimal text (`"0.01234567"`), digit for digit from the document. Never a floating-point number, never rounded.
5. **No deleting.** No tool deletes or reopens anything. Deleting a transaction, a rule, an import or a line, reopening a month, creating an account, ticking a step of the review: tell the owner what to do in the app.
6. **Partial months.** Statements are imported by hand, so the current month is often partial: the tools say how far the data goes and compare like for like. Repeat what they say (« données jusqu'au 18/11 ») instead of drawing conclusions from an incomplete month.
7. **Privacy.** Never copy elsewhere (another tool, a file, a message outside the conversation) an account or contract number, a name, an address or the content of one of the owner's documents. Only the extracted values go to the Capi tools.
8. **Read-only access.** If a write tool answers « lecture seule », say so: it takes a token or a connection allowed to write (« Autoriser les modifications »). Do not retry.

## Getting started

- Names the filters accept: `accounts_overview` (accounts) and `list_categories` (categories). Names are compared ignoring accents and case; an ambiguous name comes back with the choices.
- Months `YYYY-MM`, days `YYYY-MM-DD`, never in the future.
- Transactions have an `id` (in `search_transactions` and `review_queue`) that the write tools take.

## Simple questions

For a plain question, call the read tool that fits, without loading a method file:

| Question                                         | Tool                       |
| ------------------------------------------------ | -------------------------- |
| A month's spending, by category                  | `spending_by_category`     |
| A trend over several months, a monthly average   | `spending_history`         |
| Where the budget stands                          | `budget_status`            |
| Finding transactions (a shop, an amount, a note) | `search_transactions`      |
| Balances, net worth                              | `accounts_overview`        |
| Savings, envelopes, goals                        | `savings_and_goals`        |
| How the month will end                           | `month_end_forecast`       |
| Subscriptions, fixed costs, renewals             | `subscriptions`            |
| Who owes what                                    | `owed_to_me`               |
| Investments                                      | `list_investment_accounts` |
| What was imported, up to when                    | `list_imports`             |

Answer in a few lines: the figure, its period and how far the data goes, and the comparison the tool gives. For example (synthetic figures):

> Restaurants en novembre : 142,30 € (données jusqu'au 16/11), contre 118,00 € sur les 16 premiers jours d'octobre.

## Good to know

- **Envelopes** (« Enveloppes »): money set aside for a goal, spread across accounts. Never a transaction: they change no balance and no statistic; « libre » is the balance minus the envelopes. A balance below its envelopes is reported, never changed. What an envelope paid adds to that month's budget of its categories. They are changed in the app only.
- **Subscriptions**: a confirmed quarterly or yearly debit shows as a prepaid item (term, monthly equivalent, renewal date). Detected items not yet confirmed are flagged: the owner confirms them in « Abonnements »; cancelling is « Résilier », in the app.
- **Money owed**: the owner's spending already counts only their own part of a shared expense; what is owed is never part of net worth; offsetting both sides is « Compenser », in the app.
- **Forecast**: it projects from the day after the imported data ends, not from today; with old data, say it is only indicative and suggest importing the statement.

## Methods

Read the task's file before starting:

| Task                                                                                | File                                                       |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Month-end review (« Bilan du mois »: guided review, then closing the month)         | [references/bilan-du-mois.md](references/bilan-du-mois.md) |
| Importing a bank statement (CIC CSV, another bank, a PDF, a pasted table)           | [references/import-releve.md](references/import-releve.md) |
| Updating investments (PEA, compte-titres, life insurance, employee savings, crypto) | [references/placements.md](references/placements.md)       |
| Entering, filing, splitting a transaction; rules; shared expenses and repayments    | [references/operations.md](references/operations.md)       |
