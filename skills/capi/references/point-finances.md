# Finance review (« point sur mes finances »)

A full picture of the owner's money, their projects, and a short plan that respects both. General guidance from their own figures, not regulated investment advice: explain principles and trade-offs, never tell them to buy a given product.

## 1. Facts first (read only)

Call, in one go: `accounts_overview`, `spending_history` (last 6 to 12 months), `budget_status`, `savings_and_goals`, `subscriptions`, `owed_to_me`, `list_investment_accounts`, `month_end_forecast`. Then give, in a few lines each:

- **Income and spending**: monthly average of each over the complete months, and what is saved (income − spending, transfers excluded). Savings rate = saved ÷ income.
- **Fixed costs**: subscriptions and fixed bills per month, as a share of income.
- **Emergency fund** (« matelas de sécurité »): what sits on checking and savings accounts minus the envelopes (« libre », given by `accounts_overview`: never subtract it yourself), counted in months of spending. Rule of thumb: 3 to 6 months; more with irregular income.
- **Envelopes**: each one, its amount against its target and date, on pace or late.
- **Investments**: value by type (PEA, compte-titres, life insurance, employee savings, crypto), invested vs value, share of net worth.
- **Owed**: what others owe, never counted in net worth.
- Say how far the data goes. If the last import is old, say the review is only indicative.

## 2. Ask before advising

Always ask, in one message, before suggesting anything:

1. **Projects to come** (trip, purchase, move, car, deposit for a home…): what, about how much, when, and whether it is **booked / committed** or only **wished**.
2. Anything that will change income or spending soon (new job, end of a loan, a birth…).
3. For the investor profile, if they want one: how long the money can stay invested (horizon), what they would do if it fell 20 % in a year (sell, wait, buy more), whether they may need it at short notice, and how much they know about what they hold.

## 3. Priorities

Apply them in this order, and say so:

1. **Booked or committed projects are funded first**, even when the emergency fund is short. A trip already booked is kept: never advise dropping it to fill the fund.
2. **The emergency fund is built in parallel** with what is left each month, until it reaches its target. Give the monthly amount and the date it will be reached.
3. **Wished projects** next, by date: each gets a monthly effort; if the total does not fit, show the choices (move a date, lower an amount, spend less in a named category, with its average).
4. **Investing** only what is beyond the fund and the projects' needs, for money not needed for years.

Every monthly amount must fit in what the owner actually saves (step 1). If it does not, say by how much and propose the choices; never a plan that only works on paper.

## 4. Investor profile (on request)

From their answers, name a profile in plain words (prudent, balanced, dynamic) and compare it with what their investments show: split by type, concentration (one line or one coin making most of the total), crypto share, money left on low-yield accounts beyond the fund. Explain the principles (diversification, horizon, fees, PEA after 5 years, life insurance after 8) and what would bring their holdings closer to their profile, without naming a product to buy.

## 5. Plan

End with a short plan: one line per project and for the fund, with amount, date and monthly effort, then what to watch out for (a category drifting, a subscription to question, a late envelope). Each project becomes an envelope, created with `create_envelope` once the owner agrees: follow [projet.md](projet.md), one project at a time. Last, the monthly amount the plan saves becomes the savings target: `set_budget_targets` with `savingsTarget` only (preview, then `confirm: true` once they agree).
