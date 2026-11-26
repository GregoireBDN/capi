# Transactions, rules and shared expenses

The tools describe their own arguments; this file says when to use which, and what to watch out for.

## Entering a transaction

`add_transaction` for an expense, an income or a transfer the statement does not have yet (« 12,50 € à la boulangerie hier »).

- The category decides the kind (expense, income, transfer): pick the category, not the kind. Without a category the transaction goes to « À revoir ».
- Paid with the meal-voucher card: the meal-voucher account (« Titres-restaurant »), and its monthly credit too (income).
- The date is today in Europe/Paris unless the owner says otherwise, never in the future.
- The preview shows transactions already there on the same day with the same amount: one blocks the entry until the owner confirms it is a different one.
- When the statement is imported, the bank's line replaces the entered one and keeps its category and note.

## Filing

- `categorize_transactions`: filed by hand, a rule will not rewrite it; it leaves « À revoir » and takes the category's kind. To change the kind, choose a category of that kind.
- A move between the owner's accounts: a transfer-kind category, or no category with `kind: transfer`. Never an expense or income category.
- `mark_one_off`: an exceptional expense or income (left out of averages and subscription detection), or back to normal.
- `set_transaction_note`: a free note.

## Rules

`create_rule`: transactions whose label contains the pattern get the category.

- Take the stable part of the label (the merchant's name), never a date, a card number or a mandate reference.
- The most precise rule wins; transactions filed by hand are never rewritten.
- The preview says how many transactions match and the conflicts with existing rules: sum them up.
- By default a rule applies to the next imports only; ask before applying it to existing transactions.

## Splitting a transaction

`split_transaction`: parts by category that add up exactly to the transaction's amount. Each part has its category's kind: an incoming part in an expense category is a refund of that category (e.g. a 60 € transfer received that repays 20 € of restaurant and keeps 40 € of income). A transfer category does not mix with the others. Undoing it: in the app, or `categorize_transactions` with a single category.

## Shared expenses

- **I paid for someone**: `share_expense` (half, equal parts or an amount each). The owner's spending then counts only their part; each share shows in `owed_to_me` until it is repaid. A new name becomes a contact.
- **Someone repays me / I repay someone**: `link_repayment` on the transfer. The linked part is neither income nor an expense; the rest of the transfer keeps its category.
- **Where things stand**: `owed_to_me` (with a contact for the detail and the ids). Offsetting (« Compenser »: the same amount settled on each side without a transfer) and letting a debt go are done in the app.
- What others owe never counts in net worth: it is shown beside it.
