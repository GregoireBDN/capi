import { z } from 'zod'
import type {
  AccountDto,
  CategoryDto,
  CreateManualTransactionDto,
  TransactionDto,
  TransactionKind,
  TransactionListDto,
} from '../api/types.js'
import { frenchDate, parisToday, parseEuros, signedEuros } from '../format.js'
import { KIND_LABELS } from './labels.js'
import {
  DATE_PATTERN,
  listAccounts,
  listCategories,
  pickAccount,
  pickCategory,
  UUID_PATTERN,
} from './lookup.js'
import { defineTool, ToolInputError } from './tool.js'
import {
  confirmSchema,
  loadTransactions,
  PREVIEW_FOOTER,
  PREVIEW_HEADER,
  transactionIdsSchema,
  transactionRef,
  updateTransactions,
} from './write.js'

const LABEL_MAX = 255
const NOTE_MAX = 2000
const MANUAL_AMOUNT_MAX_CENTS = 100_000_000
const KINDS = ['expense', 'income', 'transfer'] as const

function categoryName(t: Pick<TransactionDto, 'category'>): string {
  return t.category ? t.category.name : 'sans catégorie'
}

/** The account the API picks when none is given: the oldest open checking one. */
function defaultAccount(accounts: AccountDto[]): AccountDto {
  const account = accounts
    .filter((a) => a.type === 'checking' && !a.archivedAt)
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )[0]
  if (!account) {
    throw new ToolInputError(
      'Aucun compte courant ouvert : précisez le compte (account).',
    )
  }
  return account
}

export const addTransactionTool = defineTool({
  name: 'add_transaction',
  title: 'Ajouter une opération',
  description:
    'Enter a transaction by hand (expense, income or internal transfer), e.g. "12,50 € at the bakery yesterday". It counts in statistics and budgets at once; when the bank export is imported, the matching bank row replaces it, keeping its category and note. Without confirm: preview (resolved account, category, day, sign and same-day same-amount transactions already there). With confirm: true it is created once; a same-day same-amount transaction on the account blocks it unless allowDuplicate is true (so a repeated call never adds it twice).',
  write: { idempotent: true },
  inputSchema: {
    amount: z
      .string()
      .max(20)
      .describe(
        'Amount in euros as text, e.g. "12,50". Unsigned: money out, except for income (money in). A sign forces the direction: "-" out, "+" in (e.g. "+20" for a refund filed as an expense).',
      ),
    kind: z
      .enum(KINDS)
      .optional()
      .describe(
        "Default: the category's kind, else expense. transfer = move between the owner's own accounts, never counted as income or expense.",
      ),
    category: z
      .string()
      .max(100)
      .optional()
      .describe(
        'Category name or slug (see list_categories). Without one the transaction goes to the review queue and needs a label.',
      ),
    date: z
      .string()
      .regex(DATE_PATTERN)
      .optional()
      .describe(
        'Booking day YYYY-MM-DD, never in the future. Default: today (Europe/Paris).',
      ),
    label: z
      .string()
      .trim()
      .min(1)
      .max(LABEL_MAX)
      .optional()
      .describe('Label, e.g. "Boulangerie". Default: the category name.'),
    account: z
      .string()
      .max(100)
      .optional()
      .describe(
        'Open checking or savings account name. Default: the main checking account.',
      ),
    oneOff: z
      .boolean()
      .optional()
      .describe('Exceptional expense or income, left out of averages.'),
    note: z.string().trim().max(NOTE_MAX).optional().describe('Free note.'),
    allowDuplicate: z
      .boolean()
      .optional()
      .describe(
        'true only when the owner confirmed it is really another transaction of the same amount on the same day.',
      ),
    confirm: confirmSchema,
  },
  async run({ api, now }, args) {
    const parsed = parseEuros(args.amount)
    if (!parsed || parsed.cents < 1 || parsed.cents > MANUAL_AMOUNT_MAX_CENTS) {
      throw new ToolInputError(
        `Montant « ${args.amount} » invalide : un montant en euros, au plus deux décimales (ex. 12,50), entre 0,01 € et 1 000 000 €.`,
      )
    }
    const today = parisToday(now())
    const date = args.date ?? today
    if (date > today) {
      throw new ToolInputError(
        `Le ${frenchDate(date)} est dans le futur : une opération saisie à la main a une date passée ou aujourd'hui.`,
      )
    }
    const [accounts, categories] = await Promise.all([
      listAccounts(api),
      args.category ? listCategories(api) : Promise.resolve([]),
    ])
    const category: CategoryDto | null = args.category
      ? pickCategory(categories, args.category)
      : null
    const label = args.label ?? category?.name
    if (!label) {
      throw new ToolInputError('Précisez un libellé (label) ou une catégorie.')
    }
    const account = args.account
      ? pickAccount(accounts, args.account)
      : defaultAccount(accounts)
    if (
      account.archivedAt ||
      (account.type !== 'checking' && account.type !== 'savings')
    ) {
      throw new ToolInputError(
        `« ${account.name} » n'est pas un compte courant ou d'épargne ouvert : les opérations saisies à la main vont sur ces comptes.`,
      )
    }
    const kind: TransactionKind = args.kind ?? category?.kind ?? 'expense'
    const direction =
      parsed.sign === '-'
        ? 'out'
        : parsed.sign === '+'
          ? 'in'
          : kind === 'income'
            ? 'in'
            : 'out'
    const signedCents = direction === 'out' ? -parsed.cents : parsed.cents

    const sameDay = await api.get<TransactionListDto>('/api/transactions', {
      accountId: account.id,
      from: date,
      to: date,
      limit: 100,
    })
    const duplicates = sameDay.items.filter(
      (t) => t.amountCents === signedCents,
    )

    const summary = [
      `- ${frenchDate(date)} · ${signedEuros(signedCents)} · ${label}`,
      `- Compte : ${account.name}`,
      `- Type : ${KIND_LABELS[kind]}${kind === 'transfer' ? ' (jamais compté comme revenu ou dépense)' : ''}`,
      `- Catégorie : ${category ? category.name : 'aucune (ira dans « À revoir »)'}`,
      args.oneOff ? '- Ponctuelle (hors moyennes)' : null,
      args.note ? `- Note : ${args.note}` : null,
    ].filter((line): line is string => line !== null)
    const duplicateLines = duplicates.map(
      (t) =>
        `- ${transactionRef(t)}${t.manual ? ' [saisie manuelle]' : ' [importée]'}`,
    )

    if (args.confirm !== true) {
      return [
        PREVIEW_HEADER,
        'Opération qui serait ajoutée (saisie manuelle) :',
        ...summary,
        ...(duplicates.length > 0
          ? [
              '',
              `Attention : ${duplicates.length} opération(s) du même montant ce jour-là sur ce compte. Si c'est la même, ne l'ajoutez pas ; sinon il faudra allowDuplicate: true.`,
              ...duplicateLines,
            ]
          : []),
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }

    if (duplicates.length > 0 && args.allowDuplicate !== true) {
      return [
        "Rien n'a été ajouté : une opération du même montant existe déjà ce jour-là sur ce compte (peut-être un envoi déjà fait) :",
        ...duplicateLines,
        "Si le propriétaire confirme qu'il s'agit d'une autre opération, rappelez avec allowDuplicate: true.",
      ].join('\n')
    }

    const body = {
      amountCents: parsed.cents,
      direction,
      kind,
      categoryId: category?.id ?? null,
      bookingDate: date,
      label,
      accountId: account.id,
      isOneOff: args.oneOff ?? false,
      note: args.note || null,
    } satisfies CreateManualTransactionDto
    const created = await api.send<TransactionDto>(
      'POST',
      '/api/transactions/manual',
      body,
    )
    return [
      'Opération ajoutée :',
      `- ${transactionRef(created)} · ${categoryName(created)}${created.needsReview ? ' [à revoir]' : ''}`,
      "Pour annuler : supprimez-la dans l'application (Opérations, filtre « saisies manuelles ») ; aucun outil MCP ne supprime. L'import du relevé bancaire la remplacera par la ligne de la banque correspondante.",
    ].join('\n')
  },
})

export const categorizeTransactionsTool = defineTool({
  name: 'categorize_transactions',
  title: 'Catégoriser des opérations',
  description:
    'Set the category of one or several transactions (by id), filed by hand so rules never overwrite it; it takes them out of the review queue and gives them the category kind unless `kind` is given. "uncategorized" removes the category. Without confirm: preview of each change (current → new), transactions already right are skipped. With confirm: true applies only what is still needed. Splits are ended by a category for the whole transaction.',
  write: { idempotent: true },
  inputSchema: {
    ids: transactionIdsSchema,
    category: z
      .string()
      .max(100)
      .describe(
        'Category name or slug (see list_categories), or "uncategorized".',
      ),
    kind: z
      .enum(KINDS)
      .optional()
      .describe(
        "Override the kind, e.g. transfer for a move between the owner's own accounts. Default: the category's kind (kept when removing the category).",
      ),
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    const [categories, transactions] = await Promise.all([
      listCategories(api),
      loadTransactions(api, args.ids),
    ])
    const category = pickCategory(categories, args.category)
    const target = category ? category.name : 'sans catégorie'
    const nextKind = (t: TransactionDto): TransactionKind =>
      args.kind ?? category?.kind ?? t.kind
    const changing = transactions.filter(
      (t) =>
        t.categoryId !== (category?.id ?? null) ||
        nextKind(t) !== t.kind ||
        (category !== null && t.needsReview) ||
        (category !== null && t.splits.length > 0),
    )
    const unchanged = transactions.filter((t) => !changing.includes(t))

    const changeLine = (t: TransactionDto) => {
      const kind =
        nextKind(t) !== t.kind
          ? `, ${KIND_LABELS[t.kind]} → ${KIND_LABELS[nextKind(t)]}`
          : ''
      const extras = [
        t.ruleId ? 'classée par une règle' : null,
        t.needsReview && category ? 'sort de « À revoir »' : null,
        t.splits.length > 0 && category
          ? `ventilation en ${t.splits.length} parts supprimée`
          : null,
        t.kind === 'transfer' && nextKind(t) !== 'transfer'
          ? 'attention : un virement interne deviendrait une opération comptée ; kind "transfer" le garde en virement'
          : null,
      ].filter(Boolean)
      return `- ${transactionRef(t)} : ${categoryName(t)} → ${target}${kind}${extras.length ? ` (${extras.join(', ')})` : ''}`
    }
    const unchangedLines =
      unchanged.length > 0
        ? [
            `Déjà ${category ? `dans ${target}` : 'sans catégorie'}, rien à faire : ${unchanged.length} opération(s).`,
          ]
        : []

    if (changing.length === 0) {
      return [
        `Rien à modifier : ${unchanged.length === 1 ? "l'opération est" : `les ${unchanged.length} opérations sont`} déjà ${category ? `dans ${target}` : 'sans catégorie'}.`,
      ].join('\n')
    }
    if (args.confirm !== true) {
      return [
        PREVIEW_HEADER,
        `${changing.length} opération(s) changeraient :`,
        ...changing.map(changeLine),
        ...unchangedLines,
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }

    await updateTransactions(
      api,
      changing.map((t) => t.id),
      {
        categoryId: category?.id ?? null,
        ...(args.kind ? { kind: args.kind } : {}),
      },
    )

    // Undo: back to each previous category and kind, grouped.
    const groups = new Map<string, TransactionDto[]>()
    for (const t of changing) {
      const key = `${t.category?.slug ?? 'uncategorized'}|${t.kind}`
      groups.set(key, [...(groups.get(key) ?? []), t])
    }
    const undo = [...groups.entries()].map(([key, items]) => {
      const [slug, kind] = key.split('|')
      return `- categorize_transactions ids ${JSON.stringify(items.map((t) => t.id))}, category "${slug}", kind "${kind}"`
    })
    const ruleOrSplit = changing.some((t) => t.ruleId || t.splits.length > 0)
    return [
      `${changing.length} opération(s) modifiée(s) :`,
      ...changing.map(changeLine),
      ...unchangedLines,
      '',
      'Pour annuler (avec confirm: true) :',
      ...undo,
      ...(ruleOrSplit
        ? [
            "Les catégories posées par une règle reviennent alors classées à la main ; une ventilation supprimée se refait dans l'application.",
          ]
        : []),
    ].join('\n')
  },
})

export const markOneOffTool = defineTool({
  name: 'mark_one_off',
  title: 'Marquer comme ponctuel',
  description:
    'Mark one or several transactions (by id) as one-off (exceptional, left out of averages and recurring detection), or back to regular with oneOff: false. Without confirm: preview; with confirm: true applies only to those not already in that state.',
  write: { idempotent: true },
  inputSchema: {
    ids: transactionIdsSchema,
    oneOff: z
      .boolean()
      .optional()
      .describe('Default true. false = back to a regular transaction.'),
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    const value = args.oneOff ?? true
    const transactions = await loadTransactions(api, args.ids)
    const changing = transactions.filter((t) => t.isOneOff !== value)
    const state = value ? 'ponctuelle(s)' : 'régulière(s)'
    const skipped = transactions.length - changing.length
    const skippedLine =
      skipped > 0 ? [`Déjà ${state}, rien à faire : ${skipped}.`] : []
    if (changing.length === 0) {
      return `Rien à modifier : déjà ${state}.`
    }
    const lines = changing.map((t) => `- ${transactionRef(t)}`)
    if (args.confirm !== true) {
      return [
        PREVIEW_HEADER,
        `${changing.length} opération(s) deviendraient ${state} :`,
        ...lines,
        ...skippedLine,
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }
    const ids = changing.map((t) => t.id)
    await updateTransactions(api, ids, { isOneOff: value })
    return [
      `${changing.length} opération(s) maintenant ${state} :`,
      ...lines,
      ...skippedLine,
      '',
      `Pour annuler : mark_one_off ids ${JSON.stringify(ids)}, oneOff ${!value}, confirm: true.`,
    ].join('\n')
  },
})

export const setTransactionNoteTool = defineTool({
  name: 'set_transaction_note',
  title: 'Annoter une opération',
  description:
    'Set (replace) the note of one transaction, or clear it with an empty note. Without confirm: preview of the current and the new note; with confirm: true applies it (nothing is done when the note is already that text).',
  write: { idempotent: true },
  inputSchema: {
    id: z
      .string()
      .regex(UUID_PATTERN)
      .describe('Transaction id (from search_transactions or review_queue).'),
    note: z
      .string()
      .trim()
      .max(NOTE_MAX)
      .describe('New note (replaces the current one); "" clears it.'),
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    const [t] = await loadTransactions(api, [args.id])
    if (!t) throw new ToolInputError('Opération introuvable.')
    const next = args.note || null
    const current = t.note ?? null
    const show = (note: string | null) => (note ? `« ${note} »` : '(aucune)')
    if (current === next) {
      return `Rien à modifier : la note de ${transactionRef(t)} est déjà ${show(current)}.`
    }
    const lines = [
      `- ${transactionRef(t)}`,
      `- Note actuelle : ${show(current)}`,
      `- Nouvelle note : ${show(next)}`,
    ]
    if (args.confirm !== true) {
      return [PREVIEW_HEADER, ...lines, '', PREVIEW_FOOTER].join('\n')
    }
    await api.send('PATCH', `/api/transactions/${t.id}`, { note: next ?? '' })
    return [
      'Note modifiée :',
      ...lines,
      '',
      `Pour annuler : set_transaction_note id "${t.id}", note ${JSON.stringify(current ?? '')}, confirm: true.`,
    ].join('\n')
  },
})
