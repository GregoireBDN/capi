---
name: capi
description: Méthodes pour utiliser les outils MCP de Capi, l'application de finances personnelles du propriétaire (comptes, opérations, budget, bilan du mois, import de relevé bancaire, placements, dépenses partagées). À lire dès qu'une demande touche ses finances et que les outils Capi (accounts_overview, search_transactions, month_close_status…) sont disponibles.
---

# Capi

Capi est l'application de finances personnelles du propriétaire (un seul utilisateur, euros, fuseau Europe/Paris). Claude y accède par le serveur MCP de Capi : ses outils lisent et écrivent via l'API de l'application, jamais la base de données. Les outils portent parfois un préfixe selon le client (`mcp__capi__…`, nom du connecteur) : ce Skill les nomme sans préfixe.

Réponds en français, de façon concise.

## Règles permanentes

1. **Les chiffres viennent des outils.** Ne les invente pas, ne les arrondis pas, ne les recalcule pas quand un outil les donne. Un montant négatif est une sortie d'argent.
2. **Les virements entre les comptes du propriétaire ne sont jamais des revenus ni des dépenses** (compte courant → Livret A, → PEA…). Ils ont le type `transfer` ; ne les additionne jamais aux dépenses ou aux revenus.
3. **Aperçu d'abord, toujours.** Chaque outil d'écriture s'appelle d'abord sans `confirm` : il ne fait que lire et renvoie l'aperçu exact de ce qui changerait. Montre cet aperçu au propriétaire et attends son accord explicite (« oui », « vas-y ») avant de rappeler le même outil avec les mêmes arguments et `confirm: true`. Un accord vaut pour l'aperçu montré, pas pour la suite. Un appel répété ne change rien de plus (les outils sont idempotents).
4. **Montants en texte.** Les montants se passent en euros sous forme de texte (`"12,50"`, `"1 234,56"`), les quantités crypto en texte décimal exact (`"0.01234567"`), chiffre pour chiffre depuis le document. Jamais de nombre à virgule flottante, jamais d'arrondi.
5. **Pas de suppression.** Aucun outil ne supprime ni ne rouvre quoi que ce soit. Supprimer une opération, une règle, un import, une ligne, rouvrir un mois, créer un compte, cocher une étape du bilan : dis au propriétaire quoi faire dans l'application.
6. **Mois partiels.** Les relevés sont importés à la main, donc le mois en cours est souvent partiel : les outils disent jusqu'où vont les données et comparent à jours égaux. Reprends leurs précisions (« données jusqu'au 18/11 ») au lieu de conclure sur un mois incomplet.
7. **Confidentialité.** Ne recopie jamais ailleurs (autre outil, fichier, message hors de la conversation) un numéro de compte ou de contrat, un nom, une adresse ou le contenu d'un document du propriétaire. Seules les valeurs extraites passent aux outils Capi.
8. **Jeton en lecture seule.** Si un outil d'écriture répond « lecture seule », dis-le : il faut un jeton ou une connexion avec écriture (« Autoriser les modifications »). Ne réessaie pas.

## Bien démarrer

- Noms acceptés par les filtres : `accounts_overview` (comptes) et `list_categories` (catégories). Les noms se comparent sans accents ni casse ; un nom ambigu revient avec la liste des choix.
- Mois `AAAA-MM`, jours `AAAA-MM-JJ`, jamais dans le futur.
- Les opérations ont un `id` (dans `search_transactions` et `review_queue`) que prennent les outils d'écriture.

## Méthodes

Lis le fichier de la tâche avant de commencer :

| Tâche                                                                                       | Fichier                                                    |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Bilan du mois (revue guidée et clôture)                                                     | [references/bilan-du-mois.md](references/bilan-du-mois.md) |
| Importer un relevé bancaire (CSV CIC, autre banque, PDF, tableau collé)                     | [references/import-releve.md](references/import-releve.md) |
| Mettre à jour les placements (PEA, compte-titres, assurance vie, épargne salariale, crypto) | [references/placements.md](references/placements.md)       |
| Saisir, classer, répartir une opération ; règles ; dépenses partagées et remboursements     | [references/operations.md](references/operations.md)       |

Pour une simple question (« combien j'ai dépensé en restaurants ce mois-ci ? », « où en est mon budget ? »), appelle directement l'outil de lecture qui convient (`spending_by_category`, `budget_status`, `search_transactions`, `savings_and_goals`, `month_end_forecast`, `subscriptions`…) sans charger de fichier.
