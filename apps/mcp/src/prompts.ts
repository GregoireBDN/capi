/**
 * MCP prompts: ready-made conversations the owner picks in the client (e.g.
 * the "/" menu of Claude Code). They only hold instructions: every figure
 * comes from the tools, and every change goes through a confirmed preview.
 */
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { addMonths, ofMonth, parisToday } from './format.js'
import { MONTH_PATTERN } from './tools/lookup.js'

export const monthReviewPromptArgs = {
  month: z
    .string()
    .regex(MONTH_PATTERN)
    .optional()
    .describe('Mois à revoir, AAAA-MM. Par défaut : le mois précédent.'),
}

/** The "Revue du mois" walk-through, step by step with the tools. */
export function monthReviewPrompt(
  now: Date,
  month: string | undefined,
): GetPromptResult {
  const reviewed = month ?? addMonths(parisToday(now).slice(0, 7), -1)
  const next = addMonths(reviewed, 1)
  const text = `Accompagne-moi dans la revue du mois ${ofMonth(reviewed)} (${reviewed}), étape par étape, avec les outils du serveur finances. Réponds en français, de façon concise.

Règles :
- Les chiffres viennent uniquement des outils ; ne les invente ni ne les arrondis.
- Toute modification passe d'abord par l'aperçu de l'outil (sans confirm). Montre-moi l'aperçu et attends mon accord explicite avant de rappeler l'outil avec confirm: true. Une étape à la fois.
- Les virements entre mes comptes ne sont jamais des revenus ni des dépenses.
- Ce qui ne se fait pas avec les outils (valeurs des placements, cocher une étape, rouvrir un mois) : dis-moi quoi faire dans l'application.

Étapes :
1. État de la revue : month_close_status (month ${reviewed}) et month_review (month ${reviewed}). Résume ce qui reste à faire.
2. Relevés : si des comptes ne sont pas à jour ou ont un trou de solde, liste-les (list_imports) ; je te donne le fichier CSV : preview_bank_import, puis commit_bank_import après mon accord sur l'aperçu (ou je l'importe dans l'application), puis on relance month_close_status.
3. Opérations à revoir : review_queue (month ${reviewed}). Propose une catégorie pour chacune (list_categories, search_transactions pour les opérations semblables déjà classées), regroupe celles qui vont ensemble, puis categorize_transactions par groupe. Signale les virements entre mes comptes (kind transfer) et les dépenses exceptionnelles (mark_one_off). Si un même commerçant revient, propose une règle avec create_rule (aperçu d'abord).
4. Abonnements : subscriptions ; signale les nouveaux abonnements détectés et les changements de prix du mois. Je les confirme et coche l'étape dans l'application.
5. Budget : budget_status (month ${reviewed}), catégories au-dessus et en dessous de la cible ; ajoute une note sur une opération qui explique un écart si je le demande (set_transaction_note).
6. Épargne : savings_and_goals ; ce que j'ai épargné, l'objectif et les objectifs d'épargne.
7. Placements : les comptes sans valeur à la fin du mois (month_close_status) ; je les mets à jour dans l'application.
8. Budget ${ofMonth(next)} : budget_suggestions (month ${next}) et budget_history ; propose des cibles réalistes, puis un seul set_budget_targets (month ${next}) avec toutes les catégories, après mon accord sur l'aperçu.
9. Clôture : récapitule ce qui a changé pendant la revue et ce qui reste (je coche les étapes dans l'application). Puis close_months (month ${reviewed}) sans confirm : montre-moi l'aperçu, et seulement si je suis d'accord, rappelle-le avec confirm: true. S'il reste des mois plus anciens ouverts, propose close_months avec allBefore: true (aperçu d'abord). Rouvrir un mois se fait dans l'application (Revue du mois › Rouvrir).`
  return {
    description: `Revue du mois ${ofMonth(reviewed)}`,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  }
}
