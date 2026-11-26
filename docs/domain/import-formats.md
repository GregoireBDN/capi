# Import formats and profiles

The app's standard CSV formats and the import profiles saved per source (#431, [ADR 0007](../adr/0007-import-profiles.md)). The domain rules of [`CLAUDE.md`](../../CLAUDE.md) apply: amounts become integer cents without a float, dates stay calendar dates, imports are idempotent and go through a preview.

Every bank file reaches the same pipeline (`apps/api/src/imports/`): a **reader** turns it into rows (date, value date, signed cents, running balance, label), then dedupe, continuity check, reconciliation and categorization run unchanged. Three readers exist, told apart by the file's header:

1. a **saved import profile** whose header is exactly the file's;
2. the **CIC export** (`Date;Date de valeur;Débit;Crédit;Libellé;Solde`, see CLAUDE.md);
3. the **standard format** below.

A file none of them reads is refused with `400 Unrecognised CSV format`; on the Relevés page the owner then maps its columns and the mapping is saved as a profile. Through the MCP, Claude converts the statement (another bank's export, a PDF, a pasted table) into the standard format instead.

## Standard cash format

For checking and savings accounts: what Claude writes, and what the owner can write by hand.

```csv
date;amount;label;balance
2026-10-01;-12.50;CARTE 01/10 BOULANGERIE FICTIVE;987.50
2026-10-03;2000.00;VIR SALAIRE EMPLOYEUR FICTIF;2987.50
```

| Column       | Also read as     | Required | Content                                                                                        |
| ------------ | ---------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `date`       |                  | yes      | Booking date, `YYYY-MM-DD` (or `dd/mm/yyyy`). A time after the date is ignored, never shifted. |
| `amount`     | `montant`        | yes      | Signed euros: negative = money out. `.` or `,` as decimal mark, at most 2 decimals.            |
| `label`      | `libelle`        | yes      | The operation's label as the bank prints it (it drives dedupe, merchant and categorization).   |
| `balance`    | `solde`          | no       | Running balance after the line, same layout as `amount`: enables the continuity check.         |
| `value_date` | `date de valeur` | no       | Value date.                                                                                    |

- **Encoding** UTF-8 (a BOM is fine; a file that is not valid UTF-8 is read as Windows-1252). **Separator** `;`, `,` or tab, detected on the header line; quote a field holding it (`"CAFE, FICTIF"`, `""` for a quote).
- Header names are matched without case, accents or `_` (`Value_Date` = `value date`), in any order. A column named twice (`label` and `libelle`) makes it not the standard format.
- **Amounts**: an optional `+` / `-`, digits, spaces only as thousands separator (`-1 234,56`), a currency mark (`€`, `EUR`) ignored. `1.234,56` or `1,234.56` are refused: the decimal mark would be ambiguous.
- **One line per operation as printed**, in the bank's order: two identical card payments on one day are two lines (the dedupe hash counts identical rows, so a re-import still matches).
- **Unknown columns** are listed in the preview (« colonnes ignorées »), never imported. **Invalid lines** (bad date or amount, missing label, too many fields, an unclosed quote) are listed with their line number and the reason, never imported unless typed in place in the preview ([imports.md](imports.md#the-preview-line-by-line-433)); the others go through.
- Rows from the standard format and from the CIC export of the same operations have the same dedupe hash: importing one after the other adds nothing.

## Standard investment format

For a brokerage account's or a life insurance's movements: a buy, a sale, cash in or out, income and costs. It is parsed and checked (`parseInvestmentCsv` in `imports/profiles/parse-with-profile.ts`, tested), and its import into an account comes with the movements store (#432): today a bank account refuses such a file (`This file holds investment movements`).

```csv
date;kind;isin;asset;quantity;price;fees;amount;label
2026-09-01;deposit;;;;;;500.00;Versement
2026-09-02;buy;ZZ00MSCIWD03;ETF Monde fictif;3;120.50;1.99;-363.49;
2026-09-15;dividend;ZZ00MSCIWD03;;;;;2.10;
```

| Column     | Also read as | Required                             | Content                                                                                                                                                                                 |
| ---------- | ------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `date`     |              | yes                                  | `YYYY-MM-DD` (or `dd/mm/yyyy`).                                                                                                                                                         |
| `kind`     |              | yes                                  | `buy`, `sell`, `deposit`, `withdrawal`, `dividend`, `interest`, `fee`, `tax` (or `achat`, `vente`, `versement`, `dépôt`, `retrait`, `dividende`, `intérêts`, `frais`, `impôt`, `taxe`). |
| `isin`     |              | buy, sell, dividend: this or `asset` | Checked (format and check digit).                                                                                                                                                       |
| `asset`    | `actif`      | see `isin`                           | Name or ticker, when there is no ISIN.                                                                                                                                                  |
| `quantity` | `quantite`   | buy, sell                            | Exact decimal > 0, kept as a string (`numeric`), never a float.                                                                                                                         |
| `price`    | `prix`       | no                                   | Exact unit price in euros.                                                                                                                                                              |
| `fees`     | `frais`      | no                                   | Euros; included in `amount`.                                                                                                                                                            |
| `amount`   | `montant`    | yes                                  | The cash effect, signed: negative for `buy`, `withdrawal`, `fee`, `tax`; positive for the others. A sign that contradicts the kind, or 0, is an invalid line.                           |
| `label`    | `libelle`    | no                                   | Free text.                                                                                                                                                                              |

An unknown `kind` is an **unrecognised line**: listed, never guessed. A profile for a broker's export can map its own kind values (`kind_values`, e.g. `coupon` → `interest`).

## Import profiles

How the files of one source are read (`import_profiles`, migration `0047`): the target (`cash`, or `investment` for #432), the header it recognises (names normalized: lower case, no accents), which header column is each field (`columns`), the date layout (`dd/mm/yyyy`, `yyyy-mm-dd`, `dd-mm-yyyy`, `dd.mm.yyyy`, `dd/mm/yy`, `mm/dd/yyyy`), the decimal mark (`,` or `.`; the other mark, spaces and `'` are then thousands separators in groups of three), the encoding (UTF-8 or Windows-1252) and the separator. A profile holds column names only, never a file's rows.

- **Recognised from the header**: a file whose header (trailing blank columns aside) equals a profile's, split with its separator and read with its encoding, is read with it. A header the app already reads without a profile (CIC, standard) cannot get one.
- **Database rules** (ADR 0005 R3): the settings among the known values; `import_profile_columns_valid` (only fields of the target, only columns of the header, each column once, the required fields: `date`, `label` and `amount` or both `debit` and `credit` for cash; `date`, `kind`, `amount` for investments); `kind_values` on investment profiles only, mapped to the standard kinds; one profile per header and separator; `imports.profile_id` only on `csv_profile` imports, set to null when the profile is deleted (the import stays, its history shows « Format enregistré »).
- **Debit / credit columns**: exactly one filled (a `0` counts as empty), a debit is money out whatever its written sign, a negative credit is refused, as for the CIC export.
- **Routes**: `GET /api/import-profiles` (also open to tokens), `POST /api/import-profiles/inspect` (multipart: the file's encoding, separator, header, first 5 lines, line count, the format it is already recognised as, and a guessed mapping; saves nothing), `POST /api/import-profiles`, `PUT /api/import-profiles/:id` (changes a cash profile's mapping with the same rules, from the preview's « Changer le format », #433), `DELETE /api/import-profiles/:id`, all four session only. `POST /api/imports/preview` takes an optional `profileId` (or `source`: `cic_csv`, `standard_csv`, `csv_profile`); without them the format is recognised. The preview answers its `source`, `profileId`, `profileName` and `preview.ignoredColumns`; a preview records the profile's `last_used_at`.
- **The Relevés page** (`components/import/`): an unrecognised file opens « Nouveau format de relevé » (`ProfileMappingForm`) in the upload card: the file's first 3 lines as a table, the format's name (the account's bank by default), Date, Libellé, Montant as « Une colonne » or « Débit et crédit », Solde and Date de valeur (optional), the date layout, the decimal mark and the encoding, all guessed from the file; « Enregistrer et prévisualiser » stays greyed out while a field is missing or a column is chosen twice, then saves the profile and opens the usual preview. « Formats enregistrés » lists the profiles under the drop zone, each deletable after a confirmation. The preview names the format (« CSV CIC », « Format standard », the profile's name) and lists the ignored columns.
- **Privacy**: the inspection's sample goes back to the owner's session only; errors name columns and line numbers, never cells; nothing is logged.
