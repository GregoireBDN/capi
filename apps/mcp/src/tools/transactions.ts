import { z } from 'zod'
import type {
  TransactionDto,
  TransactionListDto,
  TransactionSummaryDto,
  TransactionsControllerListData,
} from '../api/types.js'
import { euros, frenchDate, frenchMonth, signedEuros } from '../format.js'
import { KIND_LABELS } from './labels.js'
import {
  DATE_PATTERN,
  MONTH_PATTERN,
  resolveAccount,
  resolveCategory,
} from './lookup.js'
import { defineTool, ToolInputError } from './tool.js'

/** One transaction per line, with its id (what the write tools take). */
export function transactionLine(t: TransactionDto): string {
  const flags = [
    t.kind === 'transfer' ? 'virement interne' : null,
    t.isOneOff ? 'ponctuel' : null,
    t.needsReview ? 'à revoir' : null,
    t.manual ? 'saisie manuelle' : null,
  ].filter(Boolean)
  const label =
    t.merchant && t.merchant !== t.rawLabel
      ? `${t.rawLabel} (${t.merchant})`
      : t.rawLabel
  const category = t.category?.name ?? 'sans catégorie'
  const note = t.note ? ` — note : ${t.note}` : ''
  const suffix = flags.length > 0 ? ` [${flags.join(', ')}]` : ''
  // The owner's other account of a transfer (#296).
  const link = t.counterpartAccountName
    ? ` ${t.amountCents < 0 ? '→' : '←'} ${t.counterpartAccountName}`
    : ''
  return `- ${frenchDate(t.bookingDate)} · ${signedEuros(t.amountCents)} · ${label} · ${category} · ${t.accountName}${link}${suffix}${note} · id ${t.id}`
}

export const searchTransactionsTool = defineTool({
  name: 'search_transactions',
  title: 'Rechercher des opérations',
  description:
    'Search booked transactions by month or date range, category, account, text and kind, newest first. Returns the matching rows with their id (amounts signed: negative = money out) and totals of income and expenses over every match (internal transfers are never counted as income or expense).',
  inputSchema: {
    month: z
      .string()
      .regex(MONTH_PATTERN)
      .optional()
      .describe('Calendar month YYYY-MM. Cannot be combined with from/to.'),
    from: z
      .string()
      .regex(DATE_PATTERN)
      .optional()
      .describe('First booking date, YYYY-MM-DD.'),
    to: z
      .string()
      .regex(DATE_PATTERN)
      .optional()
      .describe('Last booking date, YYYY-MM-DD.'),
    category: z
      .string()
      .max(100)
      .optional()
      .describe(
        'Category name or slug (see list_categories), or "uncategorized".',
      ),
    account: z
      .string()
      .max(100)
      .optional()
      .describe('Account name (see accounts_overview).'),
    text: z
      .string()
      .max(200)
      .optional()
      .describe('Case-insensitive search in the label and merchant.'),
    kind: z.enum(['expense', 'income', 'transfer']).optional(),
    sort: z
      .enum(['date_desc', 'date_asc', 'amount_asc', 'amount_desc'])
      .optional()
      .describe('Default date_desc. amount_asc = biggest expenses first.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Rows per page, default 30.'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number, default 1.'),
  },
  async run({ api }, args) {
    if (args.month && (args.from || args.to)) {
      throw new ToolInputError(
        'Utilisez soit month, soit from/to, pas les deux.',
      )
    }
    const [account, category] = await Promise.all([
      args.account ? resolveAccount(api, args.account) : undefined,
      args.category ? resolveCategory(api, args.category) : undefined,
    ])
    const filters = {
      month: args.month,
      from: args.from,
      to: args.to,
      q: args.text,
      kind: args.kind,
      accountId: account?.id,
      categoryId: category?.id,
      uncategorized: category === null ? true : undefined,
    } satisfies TransactionsControllerListData['query']
    const limit = args.limit ?? 30
    const page = args.page ?? 1
    const [list, summary] = await Promise.all([
      api.get<TransactionListDto>('/api/transactions', {
        ...filters,
        sort: args.sort,
        limit,
        page,
      }),
      api.get<TransactionSummaryDto>('/api/transactions/summary', filters),
    ])

    const scope = [
      args.month ? frenchMonth(args.month) : null,
      args.from ? `depuis le ${frenchDate(args.from)}` : null,
      args.to ? `jusqu'au ${frenchDate(args.to)}` : null,
      account ? `compte ${account.name}` : null,
      category
        ? `catégorie ${category.name}`
        : category === null
          ? 'sans catégorie'
          : null,
      args.kind ? KIND_LABELS[args.kind] : null,
      args.text ? `texte « ${args.text} »` : null,
    ].filter(Boolean)
    const pages = Math.max(1, Math.ceil(list.total / list.limit))
    const first = list.total === 0 ? 0 : (list.page - 1) * list.limit + 1
    const last = (list.page - 1) * list.limit + list.items.length
    const lines = [
      `Opérations${scope.length ? ` (${scope.join(', ')})` : ''} : ${list.total} trouvée(s)${list.total > 0 ? `, ${first} à ${last} affichées (page ${list.page}/${pages})` : ''}.`,
      `Totaux sur toutes les opérations trouvées : revenus ${euros(summary.incomeCents)}, dépenses ${euros(summary.expenseCents)}, solde ${signedEuros(summary.netCents)}.`,
    ]
    if (summary.oneOffExpenseCents !== 0 || summary.oneOffIncomeCents !== 0) {
      lines.push(
        `Dont ponctuel : revenus ${euros(summary.oneOffIncomeCents)}, dépenses ${euros(summary.oneOffExpenseCents)}.`,
      )
    }
    if (summary.transferCount > 0) {
      lines.push(
        `${summary.transferCount} virement(s) interne(s), exclus des totaux.`,
      )
    }
    if (list.items.length > 0)
      lines.push('', ...list.items.map(transactionLine))
    if (list.page < pages)
      lines.push('', `Page suivante : page = ${list.page + 1}.`)
    return lines.join('\n')
  },
})
