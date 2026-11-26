# Bilan du mois

Revue guidée d'un mois passé (par défaut le mois précédent, `AAAA-MM`), étape par étape, puis clôture. Une étape à la fois : résume, propose, attends le propriétaire.

Ce qui ne se fait pas avec les outils (valeurs saisies à la main, cocher une étape, rouvrir un mois, supprimer) : dis-lui quoi faire dans l'application (page « Bilan du mois »).

## Étapes

1. **État du bilan.** `month_close_status` (month) et `month_review` (month). Résume ce qui reste à faire, étape par étape.
2. **Relevés.** Si des comptes ne sont pas à jour à la fin du mois ou ont un trou de solde : `list_imports`, puis demande le fichier et suis [import-releve.md](import-releve.md) (ou le propriétaire l'importe dans l'application). Relance `month_close_status` ensuite.
3. **Opérations à revoir.** `review_queue` (month). Pour chacune, propose une catégorie : `list_categories`, et `search_transactions` pour voir comment les opérations semblables sont déjà classées. Regroupe celles qui vont ensemble et fais un `categorize_transactions` par groupe (aperçu d'abord). Signale :
   - les virements entre ses comptes (catégorie de type virement, ou `kind: transfer` sans catégorie) ;
   - les dépenses ou revenus exceptionnels (`mark_one_off`) ;
   - un commerçant qui revient : propose une règle avec `create_rule` (voir [operations.md](operations.md#règles)).
4. **Abonnements.** `subscriptions` : nouveaux abonnements détectés, changements de prix du mois, renouvellements à venir. Le propriétaire les confirme et coche l'étape dans l'application.
5. **Budget.** `budget_status` (month) : revenus prévus pas arrivés (ou pas en entier), ce qui reste à épargner d'après le budget, catégories au-dessus et en dessous de leur cible. S'il le demande, une note sur l'opération qui explique un écart (`set_transaction_note`).
6. **Épargne.** `savings_and_goals` : ce qui a été épargné face à la cible, les enveloppes (argent mis de côté) et les objectifs.
7. **Placements et cohérence.**
   - Comptes de placement sans valeur à la fin du mois (`month_close_status`) : propose de les mettre à jour avec [placements.md](placements.md), ou le propriétaire le fait dans l'application.
   - `integrity_checks` (month) : liste chaque point avec son compte et son jour. **Ne corrige rien toi-même** : explique ce que le point veut dire et ce que le propriétaire peut vérifier.
8. **Budget du mois suivant**, les deux côtés :
   - Revenus : `budget_status` (mois suivant) donne les revenus prévus reportés, ou proposés d'après les revenus réguliers confirmés (salaire, aides). Demande ce qui change (fiche de paie, prime).
   - Dépenses : `budget_suggestions` (mois suivant) et `budget_history` ; propose des cibles réalistes.
   - Puis **un seul** `set_budget_targets` (mois suivant) avec les revenus et les catégories de dépenses. Son aperçu dit ce que le budget laisse à épargner : montre-le, attends l'accord, puis `confirm: true`.
9. **Clôture.** Récapitule ce qui a changé pendant le bilan et ce qui reste (le propriétaire coche les étapes dans l'application). Puis `close_months` (month) sans `confirm` : montre l'aperçu (les étapes encore ouvertes n'empêchent pas la clôture), et seulement s'il est d'accord, `confirm: true`. S'il reste des mois plus anciens ouverts, propose `close_months` avec `allBefore: true` (aperçu d'abord). Rouvrir un mois : dans l'application (Bilan du mois › Rouvrir).

## Exemple de résumé d'étape

> **Opérations à revoir (4).** Je propose : « CARTE 03/10 BOULANGERIE FICTIVE » → Alimentation ; « VIR LIVRET A » → virement entre tes comptes (ni dépense ni revenu) ; deux « PRLV ABONNEMENT FICTIF » → Abonnements, avec une règle « ABONNEMENT FICTIF » → Abonnements. Je te montre l'aperçu ?

(Libellés fictifs.)
