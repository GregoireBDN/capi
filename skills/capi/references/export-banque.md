# Getting a statement out of a bank

The owner names their bank; give a short step-by-step guide to download a statement Capi can read, then import it with [import-releve.md](import-releve.md).

## What to ask the bank for

In order of preference:

1. **CSV** (or « Excel / tableur », often a CSV): one line per transaction with date, amount (or debit and credit), label, and the balance after each line if offered. Separator and encoding do not matter: Capi recognises the CIC export, a format already mapped once in « Relevés », or the standard format `date;amount;label;balance`; anything else, Claude converts.
2. **OFX / QIF**: not read directly; Claude can convert its lines to the standard format.
3. **PDF statement**: last resort, read and converted by Claude, longer to check.

Period: from the day after the last import (`list_imports` gives it per account) to the latest booked day; one file per account.

## CIC

On the website, the account's transactions page has a download (« Télécharger ») action: choose the account, the period and the **CSV** format, then download. The phone app may not offer it: say so. Menu names change: if they differ, follow « Other banks ».

## Other banks

Screens change too often to be written here. If web search is available, look up the bank's current procedure (« export opérations CSV » plus the bank's name) and give the steps it shows, saying they come from the bank's help pages. Otherwise ask the owner what they see (website or app, menu names) and guide them screen by screen. Most banks put it under the account's transactions page, in a « Télécharger », « Exporter » or « Export » action, website more often than app.

## The guide

Keep it to 4 to 6 numbered steps, each one action, quoting the bank's own words. When the client can show artifacts or a visual page (claude.ai), make it one short page: the steps, the format to pick, the period to choose, and « ensuite, envoie-moi le fichier ». Otherwise a plain numbered list. Never ask for or keep their bank login.
