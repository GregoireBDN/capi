/**
 * Write tools of money owed (#359): `share_expense` says who owes what on an
 * expense the owner paid (`POST /api/receivables`), `link_repayment` links a
 * transfer to what it repays (`POST /api/receivables/payments`). Both
 * preview first and apply only with `confirm: true`; a repeated call changes
 * nothing more. Letting a debt go, unlinking and deleting stay in the app
 * (session-only routes).
 */
import { z } from 'zod'
import type {
  ContactDto,
  LinkRepaymentResultDto,
  ReceivableDto,
  RepaymentOptionsDto,
  TransactionDto,
} from '../api/types.js'
import { euros, parseEuros } from '../format.js'
import { normalize, UUID_PATTERN } from './lookup.js'
import { itemLine, pickContact } from './owed.js'
import { defineTool, ToolInputError } from './tool.js'
import {
  confirmSchema,
  loadTransactions,
  PREVIEW_FOOTER,
  PREVIEW_HEADER,
  transactionRef,
} from './write.js'

const MAX_PEOPLE = 20

/** `numerator / denominator` rounded half to even, as the API does. */
export function divideHalfEven(numerator: number, denominator: number): number {
  const quotient = Math.floor(numerator / denominator)
  const twiceRest = 2 * (numerator - quotient * denominator)
  if (twiceRest > denominator) return quotient + 1
  if (twiceRest < denominator) return quotient
  return quotient % 2 === 0 ? quotient : quotient + 1
}

/**
 * Each person's share of `totalCents` for a mode: « moitié » (one person,
 * half), « parts égales » (n people + the owner, each the total ÷ n half to
 * even, the remainder on the owner) or an amount each.
 */
export function shareOf(
  mode: string,
  totalCents: number,
  people: number,
): number {
  const key = normalize(mode)
  if (key === 'moitie' || key === 'half' || key === '50 %' || key === '50%') {
    if (people !== 1) {
      throw new ToolInputError(
        '« moitié » partage avec une seule personne ; avec plusieurs, utilisez « parts égales ».',
      )
    }
    return divideHalfEven(totalCents, 2)
  }
  if (key === 'parts egales' || key === 'egal' || key === 'equal') {
    return divideHalfEven(totalCents, people + 1)
  }
  const parsed = parseEuros(mode)
  if (!parsed || parsed.cents < 1 || parsed.sign === '-') {
    throw new ToolInputError(
      `Part « ${mode} » invalide : « moitié », « parts égales » ou un montant en euros sans signe (ex. 30 ou 12,50).`,
    )
  }
  return parsed.cents
}

export const shareExpenseTool = defineTool({
  name: 'share_expense',
  title: 'J’ai payé pour quelqu’un',
  description:
    "Say who owes the owner what on an expense he paid: « moitié » with one person, « parts égales » with the owner, or an amount each. The owner's spending then counts only his part; each share shows in owed_to_me until repaid (link_repayment) or let go (in the app). New names become contacts. Changing a share is done in the app.",
  write: { idempotent: true },
  inputSchema: {
    id: z
      .string()
      .regex(UUID_PATTERN)
      .describe('Transaction id of the expense (search_transactions).'),
    contacts: z
      .array(z.string().min(1).max(60))
      .min(1)
      .max(MAX_PEOPLE)
      .describe('Names of the people who owe a share (existing or new).'),
    share: z
      .string()
      .max(30)
      .describe(
        '« moitié », « parts égales », or the amount each owes in euros as text (e.g. "30").',
      ),
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    const [[t], contacts] = await Promise.all([
      loadTransactions(api, [args.id]),
      api.get<ContactDto[]>('/api/contacts', { archived: 'true' }),
    ])
    if (!t) throw new ToolInputError('Opération introuvable.')
    if (t.accountId === null) {
      throw new ToolInputError(
        `${transactionRef(t)} a été payée par ${t.paidByContactName ?? 'quelqu’un d’autre'} : c’est ce que le propriétaire doit, pas une dépense à partager.`,
      )
    }
    if (t.kind !== 'expense' || t.amountCents >= 0) {
      throw new ToolInputError(
        `${transactionRef(t)} n’est pas une dépense : seule une dépense payée par le propriétaire se partage.`,
      )
    }
    if (t.splits.length > 0) {
      throw new ToolInputError(
        'Cette opération est répartie entre plusieurs catégories : partagez-la dans l’application, part par part.',
      )
    }
    const names = args.contacts.map((name) => name.trim())
    if (new Set(names.map(normalize)).size !== names.length) {
      throw new ToolInputError('La liste contient deux fois la même personne.')
    }
    const total = -t.amountCents
    const each = shareOf(args.share, total, names.length)
    const people = names.map((name) => {
      const known = pickContact(contacts, name)
      const existing = t.shares.find(
        (s) =>
          s.direction === 'owed_to_me' &&
          (known
            ? s.contactId === known.id
            : normalize(s.contactName) === normalize(name)),
      )
      return { name: known?.name ?? name, known, existing }
    })
    for (const person of people) {
      if (person.existing && person.existing.amountCents !== each) {
        throw new ToolInputError(
          `${person.name} a déjà une part de ${euros(person.existing.amountCents)} sur cette dépense : modifiez-la dans l’application (« J’ai payé pour quelqu’un »). Rien n’a été modifié.`,
        )
      }
    }
    const toAdd = people.filter((p) => !p.existing)
    if (toAdd.length === 0) {
      return [
        `Rien à modifier : ${transactionRef(t)} est déjà partagée ainsi :`,
        ...people.map((p) => `- ${p.name} : ${euros(each)}`),
      ].join('\n')
    }
    const alreadyShared = t.shares
      .filter((s) => s.direction === 'owed_to_me')
      .reduce((sum, s) => sum + s.amountCents, 0)
    const othersCents = alreadyShared + each * toAdd.length
    if (othersCents > total) {
      throw new ToolInputError(
        `Les parts font ${euros(othersCents)} pour une dépense de ${euros(total)} : elles ne peuvent pas la dépasser. Rien n’a été modifié.`,
      )
    }
    const ownBefore = total - alreadyShared
    const ownAfter = total - othersCents
    const category = t.category?.name ?? 'sans catégorie'

    if (args.confirm !== true) {
      return [
        PREVIEW_HEADER,
        `Dépense : ${transactionRef(t)}`,
        'Parts :',
        ...toAdd.map(
          (p) =>
            `- ${p.name}${p.known ? '' : ' (nouveau contact)'} : ${euros(each)} · lui doit ${euros(p.known?.owedToMeCents ?? 0)} → ${euros((p.known?.owedToMeCents ?? 0) + each)}`,
        ),
        `Ma part : ${euros(ownAfter)} sur ${euros(total)}`,
        `Effet : ${category} ${euros(ownBefore)} → ${euros(ownAfter)} en dépenses ce mois-là ; les remboursements, une fois liés, ne compteront pas comme revenus.`,
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }

    const saved = await api.send<TransactionDto>('POST', '/api/receivables', {
      transactionId: t.id,
      shares: toAdd.map((p) =>
        p.known
          ? { contactId: p.known.id, amountCents: each }
          : { contactName: p.name, amountCents: each },
      ),
    })
    return [
      'Dépense partagée :',
      `- ${transactionRef(saved)}`,
      ...saved.shares
        .filter((s) => s.direction === 'owed_to_me')
        .map((s) => `- ${s.contactName} vous doit ${euros(s.amountCents)}`),
      `Ma part : ${euros(ownAfter)}.`,
      '',
      'Pour annuler : « J’ai payé pour quelqu’un » sur l’opération dans l’application.',
    ].join('\n')
  },
})

export const linkRepaymentTool = defineTool({
  name: 'link_repayment',
  title: 'Lier un remboursement',
  description:
    'Link a transfer to what it repays: money in from someone who owed the owner, or money out repaying someone who paid for him. The linked part is neither income nor spending. `items`: "auto" (the oldest open items adding up to the transfer, else the closest without going over) or item ids from owed_to_me with optional amounts. Never past the transfer or what is left on an item. Unlinking is done in the app.',
  write: { idempotent: true },
  inputSchema: {
    id: z
      .string()
      .regex(UUID_PATTERN)
      .describe('Transaction id of the transfer (search_transactions).'),
    contact: z
      .string()
      .max(60)
      .optional()
      .describe('Name of the person it comes from or goes to.'),
    items: z
      .union([
        z.literal('auto'),
        z
          .array(
            z.object({
              item: z
                .string()
                .regex(UUID_PATTERN)
                .describe('Item id (owed_to_me with contact).'),
              amount: z
                .string()
                .max(20)
                .optional()
                .describe(
                  'Euros as text, without sign; default what is left on it.',
                ),
            }),
          )
          .min(1)
          .max(50),
      ])
      .describe('"auto" or the items to link.'),
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    const [t] = await loadTransactions(api, [args.id])
    if (!t) throw new ToolInputError('Opération introuvable.')
    if (t.accountId === null) {
      throw new ToolInputError(
        'Une dépense payée par quelqu’un d’autre ne rembourse rien.',
      )
    }
    if (t.splits.length > 0) {
      throw new ToolInputError(
        'Ce virement est réparti entre plusieurs catégories : liez-le dans l’application.',
      )
    }
    let contactId: string | undefined
    if (args.contact !== undefined) {
      const contacts = await api.get<ContactDto[]>('/api/contacts', {
        archived: 'true',
      })
      const contact = pickContact(contacts, args.contact)
      if (!contact) {
        throw new ToolInputError(`Personne inconnue : « ${args.contact} ».`)
      }
      contactId = contact.id
    }
    const options = await api.get<RepaymentOptionsDto>(
      '/api/receivables/repayment-options',
      { transactionId: t.id, ...(contactId ? { contactId } : {}) },
    )
    const owedToMe = options.direction === 'owed_to_me'
    const who = options.contacts.find((c) => c.id === options.contactId)

    const already = new Map(
      t.repayments.map((r) => [r.receivableId, r.amountCents]),
    )
    let links: { item: ReceivableDto; amountCents: number }[]
    if (args.items === 'auto') {
      links = options.suggestion.map((s) => ({
        item: options.items.find((i) => i.id === s.receivableId)!,
        amountCents: s.amountCents,
      }))
      if (links.length === 0) {
        if (t.repayments.length > 0) {
          return `Rien à modifier : ${transactionRef(t)} est déjà lié (${euros(options.linkedCents)}).`
        }
        throw new ToolInputError(
          who
            ? `Aucune dépense ouverte de ${who.name} ne tient dans ${euros(options.availableCents)} : précisez items (owed_to_me avec contact "${who.name}").`
            : 'Personne ne doit rien dans ce sens : rien à lier.',
        )
      }
    } else {
      const requested = args.items
      if (requested.every((r) => already.has(r.item))) {
        return `Rien à modifier : ces dépenses sont déjà liées à ${transactionRef(t)}.`
      }
      links = requested
        .filter((r) => !already.has(r.item))
        .map((r) => {
          const item = options.items.find((i) => i.id === r.item)
          if (!item) {
            throw new ToolInputError(
              `La dépense ${r.item} n’est pas ouverte chez ${who?.name ?? 'cette personne'} dans ce sens (voir owed_to_me avec contact). Rien n’a été modifié.`,
            )
          }
          let amountCents = item.leftCents
          if (r.amount !== undefined) {
            const parsed = parseEuros(r.amount)
            if (!parsed || parsed.cents < 1 || parsed.sign === '-') {
              throw new ToolInputError(
                `Montant « ${r.amount} » invalide : des euros sans signe (ex. 30 ou 12,50).`,
              )
            }
            amountCents = parsed.cents
          }
          if (amountCents > item.leftCents) {
            throw new ToolInputError(
              `${euros(amountCents)} dépasse ce qui reste dû sur « ${item.label} » (${euros(item.leftCents)}). Rien n’a été modifié.`,
            )
          }
          return { item, amountCents }
        })
    }
    const linked = links.reduce((sum, l) => sum + l.amountCents, 0)
    if (linked > options.availableCents) {
      throw new ToolInputError(
        `${euros(linked)} dépasse le virement (${euros(options.availableCents)} encore libres). Rien n’a été modifié.`,
      )
    }
    const owedBefore = who?.owedCents ?? 0
    const owedAfter = owedBefore - linked
    const rest = options.availableCents - linked
    const balance = owedToMe
      ? `${who?.name ?? '?'} vous doit ${euros(owedBefore)} → ${euros(owedAfter)}`
      : `Vous devez à ${who?.name ?? '?'} ${euros(owedBefore)} → ${euros(owedAfter)}`

    if (args.confirm !== true) {
      return [
        PREVIEW_HEADER,
        `${owedToMe ? 'Remboursement reçu' : 'Remboursement envoyé'} : ${transactionRef(t)}`,
        'Lié à :',
        ...links.map(
          (l) =>
            `${itemLine(l.item).replace(/ · id .*$/, '')} → ${euros(l.amountCents)}`,
        ),
        `Lié : ${euros(linked)} (ni revenu ni dépense) · reste dans ${t.category?.name ?? 'sans catégorie'} : ${euros(rest)}`,
        balance,
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }

    const result = await api.send<LinkRepaymentResultDto>(
      'POST',
      '/api/receivables/payments',
      {
        transactionId: t.id,
        items: links.map((l) => ({
          receivableId: l.item.id,
          amountCents: l.amountCents,
        })),
      },
    )
    return [
      'Remboursement lié :',
      `- ${transactionRef(t)}`,
      ...links.map((l) => `- ${l.item.label} : ${euros(l.amountCents)}`),
      `Reste dans sa catégorie : ${euros(result.restCents ?? rest)}.`,
      balance,
      '',
      'Pour annuler : délier le remboursement dans l’application (page de la personne, « Dépenses partagées »).',
    ].join('\n')
  },
})
