/**
 * "Importer mes investissements" (#104): walks the owner's Google Drive
 * finance folder with the client's Google Drive connector and records the
 * values with the investment tools. The app never sees Drive: only the
 * extracted dates, amounts and quantities reach it, through confirmed previews.
 */
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { frenchDate, parisToday } from './format.js'
import { PROMPT_FILES, skillBundle } from './skill.js'

export const investmentsImportPromptArgs = {
  folder: z
    .string()
    .max(100)
    .optional()
    .describe('Dossier Google Drive des documents. Par défaut : « Finances ».'),
}

/** The folder and today's date, then the Skill's method
 * (`references/placements.md`) and its rules, sent whole. */
export function investmentsImportPrompt(
  now: Date,
  folder: string | undefined,
): GetPromptResult {
  const root = folder?.trim() || 'Finances'
  const today = frenchDate(parisToday(now))
  const text = `Mets à jour mes placements à partir de mes documents du dossier Google Drive « ${root} », avec le connecteur Google Drive pour lire et les outils Capi pour enregistrer. Nous sommes le ${today}.

Suis la méthode « Updating investments » du Skill Capi (fichier references/placements.md) et ses règles permanentes (SKILL.md), reproduits ci-dessous ; le dossier est « ${root} ».

${skillBundle(PROMPT_FILES.investments)}`
  return {
    description: `Importer mes investissements depuis « ${root} »`,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  }
}
