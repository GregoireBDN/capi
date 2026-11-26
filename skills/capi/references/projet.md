# Budgeting a project, then its envelope

A trip, a purchase, a deposit: a target amount by a date, set aside in an envelope (« Enveloppes »).

## 1. The project

Ask only what is missing: what, where or which, when, for how many people, and what is already set aside. For a trip, build the budget **line by line** with the owner, in euros, and show the total:

| Line                             | Basis                        |
| -------------------------------- | ---------------------------- |
| Transport                        | return tickets × people      |
| Accommodation                    | nights × price per night     |
| Food                             | days × people × daily amount |
| Activities, visits               | list                         |
| Local transport, insurance, visa | if any                       |
| Margin                           | about 10 % of the above      |

Use what their own data says when it helps: `search_transactions` or `spending_history` for a past trip or the usual restaurant spending. With web search available, check typical prices and say they are estimates. For a purchase: the price, the costs around it (delivery, fees, insurance), the margin.

## 2. Does it fit?

Read `savings_and_goals` (envelopes already planned and what is « libre »), `budget_status` and `month_end_forecast`, and the monthly savings of the complete months (`spending_history`).

- Monthly effort = (target − already set aside) ÷ months left.
- Add it to the efforts of the other envelopes. If the total goes beyond what is saved each month, say by how much and offer the choices: a later date, a lower amount, a category to cut (with its average), or taking part of the amount from « libre » now.
- A booked project comes before the emergency fund ([point-finances.md](point-finances.md), Priorities).

## 3. The envelope

Once the owner agrees on the amount, the date and the monthly effort, give what to create, ready to copy:

> Enveloppe « Voyage Japon » · objectif 2 400,00 € pour le 15/06 · départ 300,00 € sur le Livret A · 300,00 € par mois

Envelopes are created and topped up in the app only (« Épargne », « Nouvelle enveloppe »): no tool writes them. After the owner created it, check it with `savings_and_goals`. Every month after, `budget_status` tells whether it is on pace.
