## Summary

<!-- What does this PR change, and why? -->

Closes #

## À tester

<!-- Visual PRs (`visuel`): 2 to 5 steps for the owner on the preview, each « screen › action → what he should see ». Delete for other PRs. -->

## How tested

<!-- Commands run, scenarios checked manually, screenshots for UI changes. -->

## Checklist

- [ ] Tests added or updated (required for import / parsing / dedup / categorization logic)
- [ ] New rules on data are enforced by the database too (check / foreign key / unique / trigger in the migration, existing rows fixed or counted, one spec per constraint); new tables have their `set_updated_at` trigger
- [ ] `pnpm lint` passes
- [ ] `pnpm check-types` passes
- [ ] `pnpm test` passes
- [ ] No real financial data (CSV rows, labels, amounts, balances, account numbers) in code, fixtures, logs or this description
- [ ] Docs updated if behaviour or conventions changed (`CLAUDE.md`, `docs/domain/`, `README.md`)
