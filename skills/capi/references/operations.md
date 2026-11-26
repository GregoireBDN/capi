# Opérations, règles et dépenses partagées

## Saisir une opération

`add_transaction` pour une dépense, un revenu ou un virement que le relevé n'a pas encore (« 12,50 € à la boulangerie hier »).

- `amount` en texte, sans signe : une sortie, sauf pour un revenu. Un signe force le sens (`"+20"` pour un remboursement classé en dépense).
- `category` : son type (dépense, revenu, virement) est celui de l'opération ; `kind` seulement sans catégorie. Sans catégorie, l'opération part dans « À revoir » et a besoin d'un libellé.
- `account` : par défaut le compte courant principal. Un paiement avec la carte titres-restaurant va sur le compte Titres-restaurant, son crédit mensuel aussi (revenu, catégorie Titres-restaurant).
- `date` : par défaut aujourd'hui (Europe/Paris), jamais dans le futur.
- L'aperçu montre les opérations du même jour et du même montant déjà là : une telle opération bloque la création, sauf `allowDuplicate: true` quand le propriétaire confirme que c'en est une autre.
- À l'import du relevé, la ligne de la banque remplace l'opération saisie et garde sa catégorie et sa note.

## Classer

- `categorize_transactions` (ids, category) : classée à la main, une règle ne la réécrira pas ; elle sort de « À revoir » et prend le type de la catégorie. Pour changer de type, choisis une catégorie de ce type. `"uncategorized"` enlève la catégorie (et seulement alors `kind`).
- Un virement entre ses comptes : catégorie de type virement, ou `uncategorized` avec `kind: transfer`. Jamais une catégorie de dépense ou de revenu.
- `mark_one_off` : exceptionnel (hors moyennes et détection d'abonnements), ou retour à la normale avec `oneOff: false`.
- `set_transaction_note` : une note libre (`""` l'efface).

## Règles

`create_rule` (pattern, category, account facultatif) : les opérations dont le libellé contient `pattern` reçoivent `category`.

- Prends la partie stable du libellé (le nom du commerçant), jamais une date, un numéro de carte ou de mandat.
- La règle la plus précise gagne (regex, puis motif le plus long, puis conditions de compte / montant). Les opérations classées à la main ne sont jamais réécrites.
- L'aperçu dit combien d'opérations correspondent et les conflits avec les règles existantes : résume-les.
- `applyToExisting: true` réapplique aussi les règles aux opérations existantes (non classées ou classées par une règle) ; par défaut, seulement les prochains imports.

## Répartir une opération

`split_transaction` (id, parts) : 2 à 20 parts par catégorie, montants en texte sans signe, qui font exactement le montant de l'opération. Chaque part a le type de sa catégorie : une part entrante dans une catégorie de dépense est un remboursement de cette catégorie. Une catégorie de virement ne se mélange pas aux autres. Ex. : un virement reçu de 60 € qui rembourse 20 € de restaurant et garde 40 € de revenu. Défaire : dans l'application, ou `categorize_transactions` avec une seule catégorie.

## Dépenses partagées

- **J'ai payé pour quelqu'un** : `share_expense` (id de la dépense, contacts, share = « moitié », « parts égales » ou un montant chacun). Ses dépenses ne comptent alors que sa part ; chaque part apparaît dans `owed_to_me` jusqu'au remboursement. Un nouveau nom devient un contact.
- **On me rembourse / je rembourse** : `link_repayment` (id du virement, `items: "auto"` ou des ids d'`owed_to_me` avec `contact`). La part liée n'est ni un revenu ni une dépense ; le reste du virement garde sa catégorie.
- **Où on en est** : `owed_to_me` (avec `contact` pour le détail et les ids). Les compensations (« Compenser » : le même montant soldé de chaque côté sans virement) et ce qui est laissé tomber se font dans l'application.
- Ce qu'on lui doit n'entre jamais dans le patrimoine : c'est montré à côté.
