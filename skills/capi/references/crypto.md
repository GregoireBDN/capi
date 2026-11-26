# Bringing in all the crypto (exchanges and a Ledger)

Goal: every coin counted once, transfers between the owner's own places never seen as buys or sales, and a cost known for every coin, so the gains (« Résultat », « Plus-value réalisée ») are right. The imports themselves are done **in the app** (session only); this method guides the owner and then checks with the tools.

## 1. Inventory

Ask for every place holding coins: each exchange (Binance, Coinbase, others), each Ledger account (Bitcoin, Ethereum…), any other wallet. `list_investment_accounts` shows what already exists. One Capi crypto account per exchange and one per wallet.

## 2. Order of the imports

1. **Exchanges first, full history.** Binance and Coinbase: the « Transactions » export since the account was opened, imported in the app (« Crypto › Ajouter › Une plateforme »). An exchange Capi does not read: a manual crypto account, its holdings recorded with `sync_crypto_holdings` (see [placements.md](placements.md)).
2. **The Ledger as a wallet**: « Ajouter › Un wallet › Ledger », with each account's **public key** (xpub, or the `0x` address for Ethereum and tokens), never the 24 words. The app reads the balances from the chain.
3. **The Ledger Live history**: in Ledger Live « Paramètres › Comptes › Exporter l'historique des opérations », then « Importer l'historique Ledger Live » in the wallet's « ⋮ ». Transfers are matched by transaction hash, then by amount and date with the exchanges' withdrawals.
4. **« À préciser »** on each account page: answer every arrival or departure left (« Depuis une plateforme », « Achetés ailleurs » with the price paid, « Reçus gratuitement », « Vendus ou donnés »). A coin without an answer has no known cost and stays out of the gains.

## 3. Check that everything matches

With `list_investment_accounts` and `savings_and_goals`:

- **Quantities**: per account and asset, ask the owner the quantity their exchange or Ledger Live shows and compare, digit for digit. A gap: an export that starts too late, a missing exchange, a staking reward not exported.
- **Transfers**: a withdrawal from an exchange should appear once, linked to the Ledger's deposit; the total invested must not have moved with it. Moves left unlinked are in « À préciser ».
- **Cost**: list the coins « sans coût connu » per account; each one is an answer to give in the app.
- `integrity_checks` for the month: crypto holdings against the last complete read.

## 4. Result

Once everything matches, give per asset and per place: quantity, value, invested (cost), result in euros and %, and the realised gain of the year, as the tools give them. Mention the coins still of unknown cost and that the figures exclude them.
