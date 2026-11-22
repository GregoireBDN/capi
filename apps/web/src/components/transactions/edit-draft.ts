import type {
  MoneyDirection,
  SaveTransactionEditDto,
  TransactionDto,
  TransactionKind,
  UpdateManualTransactionDto,
  UpdateTransactionDto,
} from '#/api/types.gen'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import {
  draftOf as shareDraftOf,
  partsOf,
  sharesOf,
} from '#/components/owed/ShareScreen'
import type { ShareDraft } from '#/components/owed/ShareScreen'
import { manualBody } from '#/components/expenses/queries'
import { splitParts } from './edits'

/**
 * The transaction editor's draft (#435, the owner's option B): the editor
 * and every screen of its options change this draft only; « Enregistrer »
 * sends all of it at once (`POST /api/transactions/{id}/edit`), applied in
 * one database transaction. Nothing is saved while editing.
 */

/** The fields of the four steps, as the editor holds them. */
export interface EditFields {
  kind: TransactionKind
  direction: MoneyDirection
  amount: string
  categoryId: string
  date: string
  label: string
  accountId: string
  isOneOff: boolean
  needsReview: boolean
  note: string
}

/** One item a transfer repays, chosen in « On me rembourse » / « Je rembourse ». */
export interface RepaymentLinkItem {
  receivableId: string
  amountCents: number
  /** Who owes it, and what, to say it before saving. */
  contactName: string
  label: string
}

/** What the repayment screen changes: links to drop, items to link. */
export interface RepaymentDraft {
  /** Repayments linked now (`repayments[].id`) to unlink. */
  unlink: string[]
  /** Items to link, with the part of a split transfer they go on. */
  link: { splitId?: string; items: RepaymentLinkItem[] } | null
}

/** What the screens of an edit's « Options » change (#398, #435). */
export interface EditDraft {
  /** A transfer's other account (#296). */
  counterpartAccountId: string | null
  /** The parts of its split (signed cents), empty when not split. */
  splits: { categoryId: string; amountCents: number }[]
  /** Who owes the owner what on it (#359). */
  share: ShareDraft
  /** The prepaid term of the item it pays (#314), null when none. */
  prepaidTermMonths: number | null
  repayment: RepaymentDraft
  /** « Rétablir les valeurs de la banque » of a row corrected before #398. */
  restoreBank: boolean
}

/** A transaction's fields as the editor shows them. */
export function fieldsOf(item: TransactionDto): EditFields {
  return {
    kind: item.kind,
    direction: item.amountCents > 0 ? 'in' : 'out',
    amount: centsToInput(Math.abs(item.amountCents)),
    categoryId: item.categoryId ?? '',
    date: item.bookingDate,
    // A label left to its default (the category name) shows as empty; a
    // bank row's label is the bank's, never edited.
    label:
      item.manual && item.rawLabel !== item.category?.name ? item.rawLabel : '',
    accountId: item.accountId ?? '',
    isOneOff: item.isOneOff,
    needsReview: item.needsReview,
    note: item.note ?? '',
  }
}

/** A transaction's options as the editor opens them: nothing changed. */
export function editDraftOf(item: TransactionDto): EditDraft {
  return {
    counterpartAccountId: item.counterpartAccountId,
    splits: splitParts(item),
    share: shareDraftOf(item),
    prepaidTermMonths: item.prepaidItemId ? item.prepaidTermMonths : null,
    repayment: { unlink: [], link: null },
    restoreBank: false,
  }
}

/** The amount the fields say, signed, or null while it is not valid. */
export function signedCents(fields: EditFields): number | null {
  const cents = parseEurosToCents(fields.amount)
  if (cents === null) return null
  return fields.direction === 'in' ? cents : -cents
}

/** Who shares it and for how much, comparable across drafts. */
function shareKey(share: ShareDraft, totalCents: number): string {
  const parts = partsOf(share, totalCents)
  return JSON.stringify(
    share.people.map((person, index) => [
      person.contactId ?? `name:${person.name}`,
      parts[index],
    ]),
  )
}

interface EditBodyInput {
  item: TransactionDto
  /** The fields as the edit opened, and as they are now. */
  was: EditFields
  fields: EditFields
  /** The options as the edit opened, and as they are now. */
  initial: EditDraft
  draft: EditDraft
}

/**
 * What « Enregistrer » sends: only what changed, each part with the
 * semantics of its own route. Empty when nothing changed (✓ greyed out).
 */
export function editBody({
  item,
  was,
  fields,
  initial,
  draft,
}: EditBodyInput): SaveTransactionEditDto {
  const body: SaveTransactionEditDto = {}
  const changed = (key: keyof EditFields) => fields[key] !== was[key]
  const amountChanged =
    parseEurosToCents(fields.amount) !== parseEurosToCents(was.amount) ||
    fields.direction !== was.direction
  const noteChanged = fields.note.trim() !== was.note.trim()
  const changes: UpdateTransactionDto = {}

  if (item.manual) {
    const manual: UpdateManualTransactionDto = {}
    if (amountChanged && parseEurosToCents(fields.amount) !== null) {
      manual.amountCents = parseEurosToCents(fields.amount)!
      manual.direction = fields.direction
    }
    if (changed('kind')) manual.kind = fields.kind
    if (changed('categoryId')) manual.categoryId = fields.categoryId || null
    if (changed('date')) manual.bookingDate = fields.date
    if (changed('label')) manual.label = fields.label.trim() || null
    // « Quelqu’un a payé pour moi » has no account of the owner's.
    if (changed('accountId') && item.paidByContactName === null) {
      manual.accountId = fields.accountId
    }
    if (fields.isOneOff !== was.isOneOff) manual.isOneOff = fields.isOneOff
    if (noteChanged) manual.note = fields.note.trim() || null
    if (Object.keys(manual).length > 0) body.manual = manual
  } else {
    // A bank row: its category, flags and note only; its amount and day
    // are the bank's (#398, refused by the API and the database).
    if (changed('categoryId')) {
      changes.categoryId = fields.categoryId || null
      // « Sans catégorie »: the kind chosen with its tile (#368).
      if (!fields.categoryId) changes.kind = fields.kind
    } else if (!fields.categoryId && changed('kind')) {
      changes.kind = fields.kind
    }
    if (fields.isOneOff !== was.isOneOff) changes.isOneOff = fields.isOneOff
    if (noteChanged) changes.note = fields.note.trim()
  }
  if (fields.needsReview !== was.needsReview) {
    changes.needsReview = fields.needsReview
  }
  // A transfer's other account, only while it stays a transfer (another
  // kind drops it on the server).
  if (
    fields.kind === 'transfer' &&
    draft.counterpartAccountId !== initial.counterpartAccountId
  ) {
    changes.counterpartAccountId = draft.counterpartAccountId
  }
  if (Object.keys(changes).length > 0) body.changes = changes

  if (JSON.stringify(draft.splits) !== JSON.stringify(initial.splits)) {
    body.split = draft.splits.length > 0 ? { parts: draft.splits } : null
  }

  // Shares follow the amount when split evenly: compared on the amounts.
  const total = Math.abs(signedCents(fields) ?? item.amountCents)
  if (
    shareKey(draft.share, total) !==
    shareKey(initial.share, Math.abs(item.amountCents))
  ) {
    body.shares = { shares: sharesOf(draft.share, total) }
  }

  if (draft.prepaidTermMonths !== initial.prepaidTermMonths) {
    body.prepaidTermMonths = draft.prepaidTermMonths
  }

  const { unlink, link } = draft.repayment
  if (unlink.length > 0 || link) {
    body.repayments = {
      ...(unlink.length > 0 ? { unlink } : {}),
      ...(link
        ? {
            link: {
              ...(link.splitId ? { splitId: link.splitId } : {}),
              items: link.items.map(({ receivableId, amountCents }) => ({
                receivableId,
                amountCents,
              })),
            },
          }
        : {}),
    }
  }

  if (draft.restoreBank) body.restoreBankValues = true
  return body
}

/**
 * The save that puts `previous` back after `edit` saved it as `saved`
 * (« Annuler » of its toast), or null when it cannot be undone: the bank
 * values put back, or a prepaid item declared from it (the item made, not
 * only its payment).
 */
export function undoBody(
  previous: TransactionDto,
  edit: SaveTransactionEditDto,
  saved: TransactionDto,
): SaveTransactionEditDto | null {
  if (edit.restoreBankValues) return null
  if (
    edit.prepaidTermMonths !== undefined &&
    edit.prepaidTermMonths !== null &&
    previous.prepaidItemId === null
  ) {
    return null
  }
  const undo: SaveTransactionEditDto = {}

  if (edit.manual) {
    const before = manualBody(previous)
    const manual: UpdateManualTransactionDto = {}
    for (const key of Object.keys(edit.manual) as (keyof typeof before)[]) {
      ;(manual as Record<string, unknown>)[key] = before[key]
    }
    if (manual.amountCents !== undefined) manual.direction = before.direction
    undo.manual = manual
  }

  const sent = edit.changes ?? {}
  const kindMoved =
    sent.categoryId !== undefined ||
    sent.kind !== undefined ||
    edit.manual?.categoryId !== undefined ||
    edit.manual?.kind !== undefined
  const changes: UpdateTransactionDto = {}
  // A new split filed it in its largest part's category: put the first back.
  const newSplit = edit.split !== undefined && previous.splits.length === 0
  if (sent.categoryId !== undefined || sent.kind !== undefined || newSplit) {
    changes.categoryId = previous.categoryId
    if (previous.categoryId && previous.ruleId) changes.ruleId = previous.ruleId
    if (!previous.categoryId) changes.kind = previous.kind
    changes.needsReview = previous.needsReview
  }
  if (sent.needsReview !== undefined) changes.needsReview = previous.needsReview
  if (sent.isOneOff !== undefined) changes.isOneOff = previous.isOneOff
  if (sent.note !== undefined) changes.note = previous.note ?? ''
  if (
    previous.kind === 'transfer' &&
    (sent.counterpartAccountId !== undefined || kindMoved)
  ) {
    changes.counterpartAccountId = previous.counterpartAccountId
  }
  if (Object.keys(changes).length > 0) undo.changes = changes

  // A category for the whole ended its split: split it again.
  if (edit.split !== undefined || (previous.splits.length > 0 && kindMoved)) {
    undo.split =
      previous.splits.length > 0 ? { parts: splitParts(previous) } : null
  }

  if (edit.shares) {
    undo.shares = {
      shares: previous.shares
        .filter((s) => s.direction === 'owed_to_me' && s.splitId === null)
        .map((s) => ({ contactId: s.contactId, amountCents: s.amountCents })),
    }
  }

  if (edit.prepaidTermMonths !== undefined) {
    undo.prepaidTermMonths = previous.prepaidTermMonths
  }

  if (edit.repayments) {
    const before = new Set(previous.repayments.map((r) => r.id))
    const after = new Set(saved.repayments.map((r) => r.id))
    const added = saved.repayments.filter((r) => !before.has(r.id))
    const removed = previous.repayments.filter((r) => !after.has(r.id))
    undo.repayments = {
      ...(added.length > 0 ? { unlink: added.map((r) => r.id) } : {}),
      ...(removed.length > 0
        ? {
            link: {
              ...(removed[0].splitId ? { splitId: removed[0].splitId } : {}),
              items: removed.map((r) => ({
                receivableId: r.receivableId,
                amountCents: r.amountCents,
              })),
            },
          }
        : {}),
    }
  }
  return undo
}
