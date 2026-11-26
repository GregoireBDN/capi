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

/** Planned income (#315) or a spending target, in words. */
const isIncome = (p: PlannedTarget) => p.category.kind === 'income'

export const setBudgetTargetsTool = defineTool({
  name: 'set_budget_targets',
  title: 'Fixer des cibles de budget',
  description:
    'Set the monthly budget of one or several categories from `month` on (later months with their own amount keep it): a spending target for an expense category, the planned income for an income category. Transfer categories are refused. Prepare with budget_status, budget_suggestions and budget_history. The preview says what the plan leaves to save.',
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
            .describe('Expense or income category name or slug.'),
          amount: z
            .string()
            .max(20)
            .describe(
              'Monthly target (expense) or planned income (income) in euros as text, e.g. "350" or "42,50".',
            ),
          tracked: z
            .boolean()
            .optional()
            .describe(
              'Expense categories only: follow it during the month on the dashboard ("suivre pendant le mois"). Default: unchanged.',
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
    const current = new Map<string, { cents: number; tracked: boolean | null }>(
      [
        ...budget.items.map(
          (line) =>
            [
              line.categoryId,
              { cents: line.targetCents, tracked: line.tracked },
            ] as const,
        ),
        ...budget.income.items.map(
          (line) =>
            [
              line.categoryId,
              { cents: line.plannedCents, tracked: null },
            ] as const,
        ),
      ],
    )
    const planned: PlannedTarget[] = []
    for (const target of args.targets) {
      const category = pickCategory(categories, target.category)
      if (!category || category.kind === 'transfer') {
        throw new ToolInputError(
          `« ${target.category} » n'est pas une catégorie de dépenses ou de revenus : les virements entre vos comptes n'ont pas de budget. Rien n'a été modifié.`,
        )
      }
      if (category.kind === 'income' && target.tracked === true) {
        throw new ToolInputError(
          `${category.name} est un revenu : il n'est pas suivi pendant le mois. Rien n'a été modifié.`,
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
        tracked: category.kind === 'income' ? undefined : target.tracked,
        currentCents: line?.cents ?? null,
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
        p.currentCents === null
          ? isIncome(p)
            ? 'pas prévu'
            : 'pas de cible'
          : euros(p.currentCents)
      const kind = isIncome(p) ? ' (revenu prévu)' : ''
      return `- ${p.category.name}${kind} : ${from} → ${euros(p.cents)}${tracked}`
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
      const expenses = planned.filter((p) => !isIncome(p))
      const income = planned.filter(isIncome)
      const total = (list: PlannedTarget[]) =>
        list.reduce((sum, p) => sum + p.cents, 0)
      // The plan once applied: the month's other lines stay as they are.
      const after = (
        kind: 'expense' | 'income',
        lines: { categoryId: string; cents: number }[],
      ) => {
        const asked = planned.filter((p) => p.category.kind === kind)
        const others = lines.filter(
          (line) => !asked.some((p) => p.category.id === line.categoryId),
        )
        return total(asked) + others.reduce((sum, l) => sum + l.cents, 0)
      }
      const plannedIncome = after(
        'income',
        budget.income.items.map((l) => ({
          categoryId: l.categoryId,
          cents: l.plannedCents,
        })),
      )
      const budgeted = after(
        'expense',
        budget.items.map((l) => ({
          categoryId: l.categoryId,
          cents: l.targetCents,
        })),
      )
      return [
        PREVIEW_HEADER,
        `Montants mensuels qui seraient fixés ${scope} (les mois suivants qui ont déjà leur propre montant le gardent) :`,
        ...changes.map(changeLine),
        ...unchangedLine,
        ...(expenses.length > 0
          ? [`Total des cibles demandées : ${euros(total(expenses))} par mois.`]
          : []),
        ...(income.length > 0
          ? [
              `Total des revenus prévus demandés : ${euros(total(income))} par mois.`,
            ]
          : []),
        ...(plannedIncome > 0
          ? [
              `Le budget de ${frenchMonth(month)} serait alors : revenus prévus ${euros(plannedIncome)} − dépenses prévues ${euros(budgeted)} = à épargner ${euros(plannedIncome - budgeted)}.`,
            ]
          : []),
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
      `${applied.length} montant(s) fixé(s) ${scope} :`,
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
            `Sans montant avant (${added.map((p) => p.category.name).join(', ')}) : pour les retirer, arrêtez le budget dans l'application (page Budget) ; aucun outil MCP ne supprime.`,
          ]
        : []),
    ].join('\n')
  },
})
