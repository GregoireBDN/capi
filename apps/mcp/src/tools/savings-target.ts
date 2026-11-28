/**
 * The monthly savings target (`PUT /api/savings/target`, #530) as an option
 * of `set_budget_targets`: the budget says what the plan leaves to save, the
 * target what the owner wants to save. One value for every month.
 */
import { z } from 'zod'
import type {
  SavingsOverviewDto,
  SavingsTargetDto,
  SavingsTargetResultDto,
} from '../api/types.js'
import type { ApiClient } from '../api/client.js'
import { centsToText, euros, parseEuros } from '../format.js'
import { ToolInputError } from './tool.js'

/** The API's upper bound (`MAX_AMOUNT_CENTS` of the savings DTO). */
const SAVINGS_TARGET_MAX_CENTS = 1_000_000_000

export const savingsTargetSchema = z
  .string()
  .max(20)
  .optional()
  .describe('Monthly savings target in euros as text (one for every month).')

export interface SavingsTargetChange {
  currentCents: number | null
  cents: number
}

/** The asked target, refused when it is not a positive amount. */
export function parseSavingsTarget(text: string): number {
  const parsed = parseEuros(text)
  if (
    !parsed ||
    parsed.sign === '-' ||
    parsed.cents < 1 ||
    parsed.cents > SAVINGS_TARGET_MAX_CENTS
  ) {
    throw new ToolInputError(
      `Cible d'épargne « ${text} » invalide : un montant positif en euros (ex. 400 ou 350,50). Rien n'a été modifié.`,
    )
  }
  return parsed.cents
}

export async function readSavingsTarget(
  api: ApiClient,
  cents: number,
): Promise<SavingsTargetChange> {
  const overview = await api.get<SavingsOverviewDto>('/api/savings/overview')
  return { currentCents: overview.monthlyTargetCents, cents }
}

export const savingsTargetChanges = (change: SavingsTargetChange | null) =>
  change !== null && change.currentCents !== change.cents

export function savingsTargetLine(change: SavingsTargetChange): string {
  const from =
    change.currentCents === null ? 'pas de cible' : euros(change.currentCents)
  return `Cible d'épargne : ${from} → ${euros(change.cents)} par mois.`
}

export function writeSavingsTarget(
  api: ApiClient,
  change: SavingsTargetChange,
): Promise<SavingsTargetResultDto> {
  return api.send<SavingsTargetResultDto>('PUT', '/api/savings/target', {
    monthlyTargetCents: change.cents,
  } satisfies SavingsTargetDto)
}

export function savingsTargetUndo(change: SavingsTargetChange): string {
  return change.currentCents === null
    ? "Pas de cible d'épargne avant : pour la retirer, page Épargne de l'application ; aucun outil MCP ne supprime."
    : `Pour remettre la cible d'épargne : set_budget_targets savingsTarget "${centsToText(change.currentCents)}", confirm: true.`
}
