import { z } from 'zod'
import type {
  BudgetDto,
  BudgetMonthDto,
  CategoryDto,
  UpsertBudgetDto,
} from '../api/types.js'
import { ApiError } from '../api/client.js'
import {
  centsToText,
  euros,
  frenchMonth,
  parisToday,
  parseEuros,
} from '../format.js'
import { listCategories, MONTH_PATTERN, pickCategory } from './lookup.js'
import { defineTool, ToolInputError } from './tool.js'
import { confirmSchema, PREVIEW_FOOTER, PREVIEW_HEADER } from './write.js'

const MAX_TARGETS = 30
const TARGET_MAX_CENTS = 100_000_000

interface PlannedTarget {
  category: CategoryDto
  cents: number
  tracked: boolean | undefined
  currentCents: number | null
  currentTracked: boolean | null
}

export const setBudgetTargetsTool = defineTool({
  name: 'set_budget_targets',
  title: 'Fixer des cibles de budget',
  description:
    'Set the monthly budget target of one or several expense categories from `month` on (later months that already have their own target keep it; earlier months are untouched). Use budget_suggestions and budget_history to prepare them. Without confirm: preview per category (current → new, unchanged ones skipped). With confirm: true applies only the targets that differ.',
  write: { idempotent: true },
  inputSchema: {
    month: z
      .string()
      .regex(MONTH_PATTERN)
      .optional()
      .describe(
        'First month the targets apply to, YYYY-MM. Default: the current month (Europe/Paris).',
      ),
    targets: z
      .array(
        z.object({
          category: z
            .string()
            .max(100)
            .describe('Expense category name or slug.'),
          amount: z
            .string()
            .max(20)
            .describe(
              'Monthly target in euros as text, e.g. "350" or "42,50".',
            ),
          tracked: z
            .boolean()
            .optional()
            .describe(
              'Follow it during the month on the dashboard ("suivre pendant le mois"). Default: unchanged.',
            ),
        }),
      )
      .min(1)
      .max(MAX_TARGETS)
      .describe(`1 to ${MAX_TARGETS} categories.`),
    confirm: confirmSchema,
  },
  async run({ api, now }, args) {
    const month = args.month ?? parisToday(now()).slice(0, 7)
    const [categories, budget] = await Promise.all([
      listCategories(api),
      api.get<BudgetMonthDto>('/api/budgets', { month }),
    ])
    const current = new Map(budget.items.map((line) => [line.categoryId, line]))
    const planned: PlannedTarget[] = []
    for (const target of args.targets) {
      const category = pickCategory(categories, target.category)
      if (!category || category.kind !== 'expense') {
        throw new ToolInputError(
          `« ${target.category} » n'est pas une catégorie de dépenses : seules les dépenses ont un budget. Rien n'a été modifié.`,
        )
      }
      if (planned.some((p) => p.category.id === category.id)) {
        throw new ToolInputError(
          `${category.name} apparaît deux fois. Rien n'a été modifié.`,
        )
      }
      const parsed = parseEuros(target.amount)
      if (!parsed || parsed.sign === '-' || parsed.cents > TARGET_MAX_CENTS) {
        throw new ToolInputError(
          `Cible « ${target.amount} » invalide pour ${category.name} : un montant positif en euros (ex. 350 ou 42,50). Rien n'a été modifié.`,
        )
      }
      const line = current.get(category.id)
      planned.push({
        category,
        cents: parsed.cents,
        tracked: target.tracked,
        currentCents: line?.targetCents ?? null,
        currentTracked: line?.tracked ?? null,
      })
    }

    const changes = planned.filter(
      (p) =>
        p.currentCents !== p.cents ||
        (p.tracked !== undefined && p.tracked !== (p.currentTracked ?? false)),
    )
    const unchanged = planned.filter((p) => !changes.includes(p))
    const changeLine = (p: PlannedTarget) => {
      const tracked =
        p.tracked !== undefined && p.tracked !== (p.currentTracked ?? false)
          ? p.tracked
            ? ', suivie pendant le mois'
            : ', plus suivie pendant le mois'
          : ''
      const from =
        p.currentCents === null ? 'pas de cible' : euros(p.currentCents)
      return `- ${p.category.name} : ${from} → ${euros(p.cents)}${tracked}`
    }
    const unchangedLine =
      unchanged.length > 0
        ? [
            `Déjà à cette cible, rien à faire : ${unchanged.map((p) => p.category.name).join(', ')}.`,
          ]
        : []
    const scope = `à partir de ${frenchMonth(month)}`

    if (changes.length === 0) {
      return `Rien à modifier : ces cibles sont déjà en place pour ${frenchMonth(month)}.`
    }
    if (args.confirm !== true) {
      const total = planned.reduce((sum, p) => sum + p.cents, 0)
      return [
        PREVIEW_HEADER,
        `Cibles mensuelles qui seraient fixées ${scope} (les mois suivants qui ont déjà leur propre cible la gardent) :`,
        ...changes.map(changeLine),
        ...unchangedLine,
        `Total des cibles demandées : ${euros(total)} par mois.`,
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }

    const applied: PlannedTarget[] = []
    for (const p of changes) {
      try {
        await api.send<BudgetDto>('PUT', `/api/budgets/${p.category.id}`, {
          monthlyTargetCents: p.cents,
          effectiveFrom: month,
          ...(p.tracked !== undefined ? { tracked: p.tracked } : {}),
        } satisfies UpsertBudgetDto)
        applied.push(p)
      } catch (error) {
        if (!(error instanceof ApiError) || applied.length === 0) throw error
        const notApplied = changes.filter((c) => !applied.includes(c))
        return [
          `Erreur après ${applied.length} cible(s) : ${error.message}`,
          `Appliquées ${scope} :`,
          ...applied.map(changeLine),
          `Non appliquées : ${notApplied.map((c) => c.category.name).join(', ')}. Rappelez l'outil avec les mêmes arguments : les cibles déjà en place sont sautées.`,
        ].join('\n')
      }
    }
    const undo = applied
      .filter((p) => p.currentCents !== null)
      .map((p) => ({
        category: p.category.slug,
        amount: centsToText(p.currentCents ?? 0),
        ...(p.tracked !== undefined && p.currentTracked !== null
          ? { tracked: p.currentTracked }
          : {}),
      }))
    const added = applied.filter((p) => p.currentCents === null)
    return [
      `${applied.length} cible(s) fixée(s) ${scope} :`,
      ...applied.map(changeLine),
      ...unchangedLine,
      '',
      ...(undo.length > 0
        ? [
            `Pour annuler : set_budget_targets month "${month}", targets ${JSON.stringify(undo)}, confirm: true.`,
          ]
        : []),
      ...(added.length > 0
        ? [
            `Sans cible avant (${added.map((p) => p.category.name).join(', ')}) : pour les retirer, arrêtez le budget dans l'application (page Budget) ; aucun outil MCP ne supprime.`,
          ]
        : []),
    ].join('\n')
  },
})
