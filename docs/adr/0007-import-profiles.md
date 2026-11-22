# ADR 0007 — One standard CSV format and import profiles per source

- **Status**: Accepted
- **Date**: 2026-11-22
- **Issue**: #431 (milestone M14 Imports & pages), built on by #432 (BoursoBank PEA) and #433 (« Relevés »)

## Context

Bank rows enter the app through one reader: the CIC CSV export (`parsers/cic-csv.parser.ts`), hard-wired to its column names, Windows-1252, comma decimals and `dd/mm/yyyy` dates. Binance and Coinbase have their own parsers in the crypto pipeline. Life insurance and employee savings go through Claude reading PDF statements and typing values (`add_investment_snapshots`). The owner (21 Nov) wants every current account to have a way in, and rather than a parser written per bank, one documented format and a mapping per source.

A reader's output is already bank-agnostic (`ParsedRow`: date, value date, signed cents, balance, label), and everything after it (dedupe hash, probable duplicates, continuity, reconciliation, rules) depends only on that output. What differs between banks is only how a file maps to it: which column is which, the date layout, the decimal mark, the encoding, the separator, a signed amount or debit and credit columns.

## Decision

1. **A standard CSV format of the app**, documented in [`docs/domain/import-formats.md`](../domain/import-formats.md): one for cash accounts (`date`, `amount`, `label`, optional `balance` and `value_date`) and one for investment movements (`date`, `kind`, `isin` or `asset`, `quantity`, `price`, `fees`, `amount`, `label`). Lenient where it is unambiguous (columns by name in any order, French aliases, `;` `,` or tab, `.` or `,` as decimal mark without thousands separators, ISO or `dd/mm/yyyy` dates, UTF-8 or Windows-1252), strict where a guess could be wrong (no `1.234,56`, a kind's amount sign checked, an unknown kind never guessed). It is what Claude converts any statement into, through the existing MCP preview, so the owner validates the result in the usual preview.
2. **Import profiles** (`import_profiles`): the same reading, but with the column mapping and the settings saved per source, created from an unknown file in the preview and **recognised from the file's exact header** next time. The standard formats are built-in profiles (`standard-format.ts`), so one reader (`parse-with-profile.ts`) serves both. A profile has a **target**, `cash` or `investment`, so #432 reuses the model for a broker's movements export (with `kind_values` mapping its own words to the standard kinds).
3. **Recognition order**: a saved profile, then the CIC export, then the standard format; nothing else is guessed. A header the app reads without a profile cannot get one, so a file has one reader only. A file no reader knows is a `400 Unrecognised CSV format`, never a best effort.
4. **The CIC parser stays**: it is tested against the real export's quirks and its error messages are known to the web and the MCP. It now also reports the columns it ignores.
5. **Every line accounted for**: unknown columns are listed in the preview (`ignoredColumns`), invalid and unrecognised lines are listed with their line number (`issues`), nothing is imported silently. Dedupe and continuity are unchanged: rows of the standard format, of a profile and of the CIC export of the same operations hash the same, so a re-import, or the same month from another reader, inserts nothing.
6. **Database rules** (ADR 0005 R3): the settings are checked against their lists, the mapping by `import_profile_columns_valid` (only fields of the target, only columns of the header, each once, the required fields), the kind values by `import_profile_kind_values_valid`, one profile per header and separator, and `imports.profile_id` only on `csv_profile` imports (`ON DELETE SET NULL`).
7. **Access**: profiles are created, inspected and deleted with the session only; tokens read them (GET). Claude never creates a profile: it converts to the standard format.

### Alternatives rejected

- **A parser per bank** (the CIC way): code and a release for each new source, and the owner cannot add one.
- **Guessing the mapping silently** for any CSV: a wrong guess (a debit column read as a credit, `mm/dd` read as `dd/mm`) would write wrong rows that look right. The guess only pre-fills the form the owner confirms.
- **Recognising a profile by a fuzzy header match**: two sources with similar headers would be read with each other's settings. The header must be the same.
- **Storing profiles as files in the repo**: they describe the owner's banks, are created from the app, and must survive a deploy.

## Consequences

- A new bank is a two-minute form in the app, not a PR; a statement in any shape reaches the app through Claude and the standard format.
- New sources in `import_source`: `standard_csv`, `csv_profile`; `imports.profile_id`; the preview carries `ignoredColumns`, the summaries `profileId` / `profileName`.
- The investment format is parsed and tested, but nothing stores investment movements yet: #432 adds the store and the import into a brokerage account, through this profile model.
- #433 (« Relevés » line by line) can fix a mapping in place by editing the profile and previewing again.
