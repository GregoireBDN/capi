# Importing a bank statement

For a checking or savings account (the bank accounts). Two steps, like the app's « Relevés » page: `preview_bank_import` (writes no transaction), then `commit_bank_import` with `confirm: true` once the owner agrees. If the owner does not have the file yet, guide the export first: [export-banque.md](export-banque.md).

## 1. What is missing

`list_imports`: for each account, the last import and the day its statements go up to, plus the pending previews. Work out the period to import.

## 2. The file

- **CIC CSV export** as downloaded: pass it as is. On the local connection (Claude Desktop, Claude Code), `filePath` with the file's path on the machine (`~/Downloads/export.csv`, 5 MB at most). On the remote connection (claude.ai, phone), `content` with the file's text: never `filePath`.
- **CSV in a format already saved** in the app (another bank mapped once on the « Relevés » page): as is, the app recognises its header.
- **Any other statement** (PDF, another bank's export, a table pasted in the conversation): convert it to the **standard format** below and pass it in `content`. The owner checks it in the usual preview.

## 3. The standard format

```csv
date;amount;label;balance
2026-10-01;-12.50;CARTE 01/10 BOULANGERIE FICTIVE;987.50
2026-10-03;2000.00;VIR SALAIRE EMPLOYEUR FICTIF;2987.50
```

- Required header: `date;amount;label`, plus `balance` (the balance after the line; recommended, it allows the continuity check) and `value_date`, both optional. Columns in any order; an unknown column is listed in the preview and ignored.
- `date`: `YYYY-MM-DD`, the transaction date on the statement.
- `amount`: signed euros, **negative = money going out**. `.` or `,` as the decimal mark, at most 2 decimals, no thousands separator except a space (`-1 234,56`). `1.234,56` is refused.
- `label`: the label **as the bank prints it** (it drives deduplication and categorization): do not rephrase or translate it.
- **One line per transaction on the statement, in the statement's order.** Two identical payments on the same day are two lines: merge nothing, drop nothing.
- UTF-8; separator `;` (or `,`, or a tab); quote a label that contains the separator (`"CAFE; FICTIF"`).
- Copy the amounts digit for digit. If a line of a PDF is unreadable, say so rather than guess.

Before sending a conversion, check: first balance − first line's amount = the statement's previous balance, and the sum of the amounts = closing balance − opening balance. Point out any gap.

## 4. The preview

`preview_bank_import` (account, `filePath` or `content`, optional `fileName`) returns a `previewId` and:

- the new lines, the ones already imported (re-importing a file or an overlapping period adds nothing), the conflicting ones (a probable duplicate from another source, e.g. a transaction entered by hand);
- the balance continuity check (a missing line shows here);
- the categories proposed by the rules;
- ignored columns and unreadable lines: never imported.

Show it to the owner, sum up the conflicts and the balance gaps. A « Format non reconnu » answer gives the standard format: convert and send again in `content`.

## 5. Committing

Once the owner agrees: `commit_bank_import` (`previewId`, `confirm: true`). Conflicts stay aside, unless the owner says they are not duplicates (`includeConflicts: true`). The answer lists the transactions that went to « À revoir », with their id: go on with filing them ([operations.md](operations.md)). A preview expires after 24 hours; committing twice changes nothing. Undoing an import is done in the app (« Relevés » page).
