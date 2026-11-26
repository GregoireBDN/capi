# Month-end review (« Bilan du mois »)

A guided review of a past month (by default the previous one, `YYYY-MM`), step by step, then closing it. One step at a time: sum up, propose, wait for the owner.

What the tools cannot do (values typed by hand, ticking a step, reopening a month, deleting): tell the owner what to do in the app (page « Bilan du mois »).

## Steps

1. **Where the review stands.** `month_close_status` (month) and `month_review` (month). Sum up what is left, step by step.
2. **Statements.** If accounts are not up to date at the end of the month or have a balance gap: `list_imports`, then ask for the file and follow [import-releve.md](import-releve.md) (or the owner imports it in the app). Run `month_close_status` again afterwards.
3. **Transactions to review.** `review_queue` (month). Propose a category for each: `list_categories`, and `search_transactions` to see how similar transactions are already filed. Group those that go together and make one `categorize_transactions` per group (preview first). Point out:
   - moves between the owner's accounts (a transfer-kind category, or `kind: transfer` without a category);
   - one-off expenses or income (`mark_one_off`);
   - a merchant that comes back: propose a rule with `create_rule` (see [operations.md](operations.md#rules)).
4. **Subscriptions.** `subscriptions`: newly detected subscriptions, price changes in the month, upcoming renewals. The owner confirms them and ticks the step in the app.
5. **Budget.** `budget_status` (month): planned income that did not arrive (or not in full), what the budget leaves to save, categories above and below their target. If the owner asks, a note on the transaction that explains a gap (`set_transaction_note`).
6. **Savings.** `savings_and_goals`: what was saved against the target, the envelopes (money set aside) and the goals.
7. **Investments and consistency.**
   - Investment accounts with no value at the end of the month (`month_close_status`): offer to update them with [placements.md](placements.md), or the owner does it in the app.
   - `integrity_checks` (month): list each point with its account and its day. **Fix nothing yourself**: explain what the point means and what the owner can check.
8. **Next month's budget**, both sides:
   - Income: `budget_status` (next month) gives the planned income carried over, or proposed from the confirmed regular income (salary, benefits). Ask what changes (payslip, bonus).
   - Expenses: `budget_suggestions` (next month) and `budget_history`; propose realistic targets.
   - Then **a single** `set_budget_targets` (next month) with the income and the expense categories. Its preview says what the budget leaves to save: show it, wait for the agreement, then `confirm: true`.
9. **Closing.** Sum up what changed during the review and what is left (the owner ticks the steps in the app). Then `close_months` (month) without `confirm`: show the preview (steps still open do not prevent closing), and only if the owner agrees, `confirm: true`. If older months are still open, offer `close_months` with `allBefore: true` (preview first). Reopening a month: in the app (« Bilan du mois › Rouvrir »).

## Example of a step summary

In the owner's language; synthetic labels:

> **Opérations à revoir (4).** Je propose : « CARTE 03/10 BOULANGERIE FICTIVE » → Alimentation ; « VIR LIVRET A » → virement entre tes comptes (ni dépense ni revenu) ; deux « PRLV ABONNEMENT FICTIF » → Abonnements, avec une règle « ABONNEMENT FICTIF » → Abonnements. Je te montre l'aperçu ?
