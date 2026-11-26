/**
 * `split_transaction` (#357): splits one transaction between categories
 * through `PUT /api/transactions/:id/splits`. Each part counts with its
 * category's kind, so an incoming transfer can pay back part of an expense
 * (« remboursement de Restaurants ») and keep the rest as income. Undoing a
 * split stays in the app (`DELETE …/splits` is session-only).
 */
import { z } from 'zod'
import type {
  BudgetMonthDto,
  CategoryDto,
  TransactionDto,
  TransactionKind,
} from '../api/types.js'
import {
  centsToText,
  euros,
  ofMonth,
  parseEuros,
  signedEuros,
} from '../format.js'
import { KIND_LABELS } from './labels.js'
import { listCategories, pickCategory, UUID_PATTERN } from './lookup.js'
import { defineTool, ToolInputError } from './tool.js'
import {
  confirmSchema,
  loadTransactions,
  PREVIEW_FOOTER,
  PREVIEW_HEADER,
  transactionRef,
} from './write.js'

/** Parts of one split the API accepts. */
const MIN_PARTS = 2
const MAX_PARTS = 20

/** One line of the transaction as statistics count it. */
interface Line {
  categoryId: string | null
  name: string
  kind: TransactionKind
  amountCents: number
}

/** « remboursement de Restaurants », « revenu Remboursements »… */
export function partLabel(line: Line): string {
  const incoming = line.amountCents > 0
  switch (line.kind) {
    case 'expense':
      return incoming ? `remboursement de ${line.name}` : `dépense ${line.name}`
    case 'income':
      return incoming ? `revenu ${line.name}` : `revenu en moins ${line.name}`
    case 'transfer':
      return `${KIND_LABELS.transfer} (${line.name})`
  }
}

function currentLines(t: TransactionDto): Line[] {
  if (t.splits.length > 0) {
    return t.splits.map((part) => ({
      categoryId: part.categoryId,
      name: part.category.name,
      kind: part.kind,
      amountCents: part.amountCents,
    }))
  }
  return [
    {
      categoryId: t.categoryId,
      name: t.category?.name ?? 'sans catégorie',
      kind: t.kind,
      amountCents: t.amountCents,
    },
  ]
}

function partLine(line: Line): string {
  return `- ${euros(Math.abs(line.amountCents))} · ${partLabel(line)}`
}

/**
 * What the split changes on the month's budget, per category touched: spent
 * for an expense category (refunds deducted), received for an income one.
 */
function budgetEffect(
  before: Line[],
  after: Line[],
  budget: BudgetMonthDto,
): string[] {
  const sum = (lines: Line[], categoryId: string, kind: TransactionKind) =>
    lines
      .filter((l) => l.categoryId === categoryId && l.kind === kind)
      .reduce((total, l) => total + l.amountCents, 0)
  const touched = new Map<string, string>()
  for (const line of [...before, ...after]) {
    if (line.categoryId !== null && line.kind !== 'transfer') {
      touched.set(line.categoryId, line.name)
    }
  }
  const lines: string[] = []
  for (const [categoryId, name] of touched) {
    // Spent is positive: an expense line of -20 € adds 20 €, a refund of
    // +20 € takes 20 € off.
    const spentDelta =
      sum(before, categoryId, 'expense') - sum(after, categoryId, 'expense')
    const receivedDelta =
      sum(after, categoryId, 'income') - sum(before, categoryId, 'income')
    if (spentDelta !== 0) {
      const target = budget.items.find((item) => item.categoryId === categoryId)
      lines.push(
        target
          ? `- ${name} : dépensé ${euros(target.spentCents)} → ${euros(target.spentCents + spentDelta)} sur ${euros(target.targetCents)}`
          : `- ${name} (sans budget) : dépenses ${signedEuros(spentDelta)}`,
      )
    }
    if (receivedDelta !== 0) {
      const planned = budget.income.items.find(
        (item) => item.categoryId === categoryId,
      )
      const received = planned?.receivedCents ?? null
      lines.push(
        planned && received !== null
          ? `- ${name} : reçu ${euros(received)} → ${euros(received + receivedDelta)} (prévu ${euros(planned.plannedCents)})`
          : `- ${name}${planned ? '' : ' (hors revenus prévus)'} : revenus ${signedEuros(receivedDelta)}`,
      )
    }
  }
  return lines
}

export const splitTransactionTool = defineTool({
  name: 'split_transaction',
  title: 'Répartir une opération',
  description:
    "Split one transaction between 2 to 20 categories; the parts (euros as text, without sign) add up exactly to its amount. Each part has its category's kind: an incoming part in an expense category is a refund of it. A transfer category cannot be mixed with others. Replaces any previous split; undone in the app or by categorize_transactions.",
  write: { idempotent: true },
  inputSchema: {
    id: z
      .string()
      .regex(UUID_PATTERN)
      .describe('Transaction id (from search_transactions or review_queue).'),
    parts: z
      .array(
        z.object({
          category: z
            .string()
            .max(100)
            .describe('Category name or slug (see list_categories).'),
          amount: z
            .string()
            .max(20)
            .describe(
              'Amount of the part in euros as text, without sign, e.g. "20" or "12,50".',
            ),
        }),
      )
      .min(MIN_PARTS)
      .max(MAX_PARTS)
      .describe(
        `The parts, ${MIN_PARTS} to ${MAX_PARTS}, in order; they add up exactly to the transaction's amount.`,
      ),
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    const [[t], categories] = await Promise.all([
      loadTransactions(api, [args.id]),
      listCategories(api),
    ])
    if (!t) throw new ToolInputError('Opération introuvable.')
    const sign = Math.sign(t.amountCents)

    const parts = args.parts.map((part, index) => {
      const category: CategoryDto | null = pickCategory(
        categories,
        part.category,
      )
      if (!category) {
        throw new ToolInputError(
          `La part ${index + 1} n'a pas de catégorie : chaque part va dans une catégorie (voir list_categories).`,
        )
      }
      const parsed = parseEuros(part.amount)
      if (!parsed || parsed.cents < 1) {
        throw new ToolInputError(
          `Montant « ${part.amount} » de la part ${index + 1} invalide : un montant en euros, au plus deux décimales (ex. 12,50), supérieur à 0.`,
        )
      }
      if (
        (parsed.sign === '-' && sign > 0) ||
        (parsed.sign === '+' && sign < 0)
      ) {
        throw new ToolInputError(
          `La part ${index + 1} a le signe « ${parsed.sign} » mais l'opération est ${sign > 0 ? 'une entrée' : 'une sortie'} : donnez les montants sans signe, celui de l'opération s'applique.`,
        )
      }
      return { category, amountCents: parsed.cents * sign }
    })

    const total = parts.reduce((sum, part) => sum + part.amountCents, 0)
    if (total !== t.amountCents) {
      const gap = Math.abs(t.amountCents) - Math.abs(total)
      throw new ToolInputError(
        `Les parts font ${euros(Math.abs(total))} alors que l'opération fait ${euros(Math.abs(t.amountCents))} : ${gap > 0 ? `il reste ${euros(gap)} à répartir` : `il y a ${euros(-gap)} de trop`}. Rien n'a été modifié.`,
      )
    }
    const kinds = new Set(parts.map((part) => part.category.kind))
    if (kinds.has('transfer') && kinds.size > 1) {
      throw new ToolInputError(
        "Une catégorie de virement interne ne peut pas être mêlée à des catégories de dépense ou de revenu dans une même répartition. Rien n'a été modifié.",
      )
    }

    const after: Line[] = parts.map((part) => ({
      categoryId: part.category.id,
      name: part.category.name,
      // Every part counts with its category's kind (#357, #368).
      kind: part.category.kind,
      amountCents: part.amountCents,
    }))
    const before = currentLines(t)
    const same =
      t.splits.length === parts.length &&
      t.splits.every(
        (current, index) =>
          current.categoryId === parts[index]?.category.id &&
          current.amountCents === parts[index]?.amountCents,
      )
    if (same) {
      return [
        `Rien à modifier : ${transactionRef(t)} est déjà répartie ainsi :`,
        ...after.map(partLine),
      ].join('\n')
    }

    const month = t.bookingDate.slice(0, 7)
    const header = [
      `Opération : ${transactionRef(t)}`,
      `Actuellement${t.splits.length > 0 ? ' (déjà répartie)' : ''} :`,
      ...before.map(partLine),
      'Répartition :',
      ...after.map(partLine),
    ]
    const transferNote =
      t.kind === 'transfer' && after.some((line) => line.kind !== 'transfer')
        ? [
            "C'est un virement interne : réparti dans ces catégories, il compterait comme dépense ou revenu.",
          ]
        : []

    if (args.confirm !== true) {
      const budget = await api.get<BudgetMonthDto>('/api/budgets', { month })
      const effect = budgetEffect(before, after, budget)
      return [
        PREVIEW_HEADER,
        ...header,
        ...transferNote,
        '',
        `Effet sur le budget ${ofMonth(month)} :`,
        ...(effect.length > 0 ? effect : ['- aucun changement']),
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }

    const saved = await api.send<TransactionDto>(
      'PUT',
      `/api/transactions/${t.id}/splits`,
      {
        parts: parts.map((part) => ({
          categoryId: part.category.id,
          amountCents: part.amountCents,
        })),
      },
    )
    const undo =
      t.splits.length > 0
        ? `Pour revenir à la répartition précédente : split_transaction id "${t.id}", parts ${JSON.stringify(
            t.splits.map((part) => ({
              category: part.category.slug,
              amount: centsToText(Math.abs(part.amountCents)),
            })),
          )}, confirm: true.`
        : `Pour annuler : categorize_transactions ids ["${t.id}"], category "${t.category?.slug ?? 'uncategorized'}"${t.category ? '' : `, kind "${t.kind}"`}, confirm: true (une seule catégorie pour toute l'opération), ou « Ne plus répartir » dans l'application.`
    return [
      'Opération répartie :',
      `- ${transactionRef(saved)}`,
      ...currentLines(saved).map(partLine),
      ...transferNote,
      '',
      undo,
    ].join('\n')
  },
})
