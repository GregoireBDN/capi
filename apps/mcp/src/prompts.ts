/**
 * MCP prompts: ready-made conversations the owner picks in the client (e.g.
 * the "/" menu of Claude Code). They only hold instructions: every figure
 * comes from the tools, and every change goes through a confirmed preview.
 */
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { addMonths, ofMonth, parisToday } from './format.js'
import { PROMPT_FILES, skillBundle } from './skill.js'
import { MONTH_PATTERN } from './tools/lookup.js'

export const monthReviewPromptArgs = {
  month: z
    .string()
    .regex(MONTH_PATTERN)
    .optional()
    .describe('Mois à revoir, AAAA-MM. Par défaut : le mois précédent.'),
}

/** The "Bilan du mois" walk-through: the month to review, then the Skill's
 * method (`references/bilan-du-mois.md`) and its rules, sent whole. */
export function monthReviewPrompt(
  now: Date,
  month: string | undefined,
): GetPromptResult {
  const reviewed = month ?? addMonths(parisToday(now).slice(0, 7), -1)
  const next = addMonths(reviewed, 1)
  const text = `Accompagne-moi dans le bilan du mois ${ofMonth(reviewed)} (${reviewed}), étape par étape, avec les outils Capi. Le budget à préparer est celui ${ofMonth(next)} (${next}).

Suis la méthode « Month-end review » du Skill Capi (fichier references/bilan-du-mois.md) et ses règles permanentes (SKILL.md), reproduits ci-dessous.

${skillBundle(PROMPT_FILES.monthReview)}`
  return {
    description: `Bilan du mois ${ofMonth(reviewed)}`,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  }
}
