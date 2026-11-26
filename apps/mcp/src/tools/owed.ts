/**
 * `owed_to_me` (#359): what people owe the owner and what he owes them,
 * as two lists per person with the net position both ways and the offsets
 * to propose (#484), with this month's repayments expected from shared
 * recurring items. Read only.
 */
import { z } from 'zod'
import type {
  ContactDto,
  ContactOwedDto,
  ExpectedRepaymentDto,
  OffsetProposalDto,
  OwedContactRowDto,
  OwedListDto,
  OwedSummaryDto,
  ReceivableDto,
} from '../api/types.js'
import { euros, frenchDate, frenchMonth } from '../format.js'
import { normalize } from './lookup.js'
import { defineTool, ToolInputError } from './tool.js'

/** The person `input` names among the contacts (exact, then partial). */
export function pickContact(
  contacts: ContactDto[],
  input: string,
): ContactDto | null {
  const key = normalize(input)
  const exact = contacts.filter((c) => normalize(c.name) === key)
  if (exact.length === 1) return exact[0] ?? null
  const partial = contacts.filter((c) => normalize(c.name).includes(key))
  if (partial.length === 1) return partial[0] ?? null
  if (partial.length > 1) {
    throw new ToolInputError(
      `Plusieurs personnes correspondent à « ${input} » : ${partial.map((c) => c.name).join(', ')}. Précisez le nom.`,
    )
  }
  return null
}

function age(row: OwedContactRowDto): string {
  if (row.oldestOpenDate === null) return ''
  const days = row.oldestOpenDays ?? 0
  return ` · depuis le ${frenchDate(row.oldestOpenDate)} (${days} jour${days > 1 ? 's' : ''})`
}

/** The net position with someone owed both ways (#484), else nothing. */
function net(row: OwedContactRowDto): string {
  if (Math.abs(row.netCents) === row.owedCents) return ''
  if (row.netCents === 0) return ' · net : quittes'
  return row.netCents > 0
    ? ` · net : ${row.name} vous doit ${euros(row.netCents)}`
    : ` · net : vous devez ${euros(-row.netCents)} à ${row.name}`
}

function offerLine(offer: OffsetProposalDto): string {
  return `- ${offer.contactName} : ${euros(offer.amountCents)} de chaque côté (on lui doit ${euros(offer.iOweCents)}, il doit ${euros(offer.owedToMeCents)})`
}

function listLines(list: OwedListDto): string[] {
  if (list.contacts.length === 0) return ['- personne']
  const lines = list.contacts.map(
    (row) =>
      `- ${row.name} : ${euros(row.owedCents)} (${row.openCount} dépense${row.openCount > 1 ? 's' : ''}${age(row)})${net(row)}`,
  )
  if (list.settled.length > 0) {
    lines.push(`Tout réglé : ${list.settled.map((r) => r.name).join(', ')}`)
  }
  return lines
}

function expectedLine(item: ExpectedRepaymentDto): string {
  const status =
    item.status === 'received'
      ? 'reçu'
      : item.status === 'partial'
        ? `reçu ${euros(item.receivedCents)}`
        : `attendu le ${frenchDate(item.date)}`
  return `- ${item.contactName} · ${item.name} : ${euros(item.expectedCents)} (${status})`
}

/** One open or settled item, with its id (what link_repayment takes). */
export function itemLine(item: ReceivableDto): string {
  // What was settled: repaid and the part let go (#437).
  const offsetCents = item.payments
    .filter((p) => p.offsetId !== null)
    .reduce((total, p) => total + p.amountCents, 0)
  const settled = [
    item.repaidCents > 0
      ? `reçu ${euros(item.repaidCents)}${offsetCents > 0 ? ` dont ${euros(offsetCents)} compensés` : ''}`
      : null,
    item.forgivenCents > 0 ? `abandonné ${euros(item.forgivenCents)}` : null,
  ].filter(Boolean)
  const detail = settled.length > 0 ? ` (${settled.join(', ')})` : ''
  const state =
    item.state === 'forgiven'
      ? item.forgivenCents < item.amountCents
        ? `abandonné${detail}`
        : 'abandonné'
      : item.state === 'repaid'
        ? 'remboursé'
        : `reste ${euros(item.leftCents)}${detail}`
  const bill =
    item.billCents !== null ? ` · addition ${euros(item.billCents)}` : ''
  return `- ${frenchDate(item.bookingDate)} · ${item.label} · ${item.category?.name ?? 'sans catégorie'} · ${euros(item.amountCents)}${bill} · ${state} · id ${item.id}`
}

export const owedToMeTool = defineTool({
  name: 'owed_to_me',
  title: 'Ce qu’on me doit et ce que je dois',
  description:
    'Money owed between the owner and the people around him: « Ce qu’on me doit » (expenses he advanced and shared) and « ce que je dois » (expenses someone paid for him), as two lists per person with the age of the oldest open item and the net position when someone is owed both ways, the offsets to propose (« Compenser »: the same amount settled on each side without a transfer, done in the app), plus this month’s repayments expected from recurring items shared with someone (rent, energy). With `contact`, that person’s open items in both directions with their ids (for link_repayment), the offsets made and their history. Outside the net worth. Statistics already count only the owner’s part of a shared expense; a linked repayment or an offset is neither income nor spending.',
  inputSchema: {
    contact: z
      .string()
      .max(60)
      .optional()
      .describe('A person’s name, for their detail.'),
  },
  async run({ api }, args) {
    if (args.contact !== undefined) {
      const contacts = await api.get<ContactDto[]>('/api/contacts', {
        archived: 'true',
      })
      const contact = pickContact(contacts, args.contact)
      if (!contact) {
        throw new ToolInputError(
          `Personne inconnue : « ${args.contact} ». Contacts : ${contacts.map((c) => c.name).join(', ') || 'aucun'}.`,
        )
      }
      const detail = await api.get<ContactOwedDto>(
        `/api/contacts/${contact.id}/owed`,
      )
      const section = (
        title: string,
        dir: ContactOwedDto['owedToMe'],
      ): string[] => [
        `${title} : ${euros(dir.totals.openCents)} (en tout ${euros(dir.totals.totalCents)}, remboursé ${euros(dir.totals.repaidCents)}, abandonné ${euros(dir.totals.forgivenCents)})`,
        ...(dir.open.length > 0 ? dir.open.map(itemLine) : ['- rien d’ouvert']),
        ...(dir.history.length > 0
          ? ['Historique :', ...dir.history.slice(0, 10).map(itemLine)]
          : []),
      ]
      const balance = detail.contact.owedToMeCents - detail.contact.iOweCents
      return [
        `${detail.contact.name}`,
        `Net : ${
          balance === 0
            ? 'quittes'
            : balance > 0
              ? `${detail.contact.name} vous doit ${euros(balance)}`
              : `vous devez ${euros(-balance)} à ${detail.contact.name}`
        }${detail.contact.alwaysOffset ? ' (toujours compenser)' : ''}`,
        ...(detail.offer
          ? [
              `À compenser : ${euros(detail.offer.amountCents)} de chaque côté (« Compenser » dans l’app)`,
            ]
          : []),
        '',
        ...section(`Il vous doit`, detail.owedToMe),
        '',
        ...section(`Vous lui devez`, detail.iOwe),
        ...(detail.offsets.length > 0
          ? [
              '',
              'Compensations :',
              ...detail.offsets
                .slice(0, 10)
                .map(
                  (o) =>
                    `- ${frenchDate(o.offsetOn)} : ${euros(o.amountCents)} de chaque côté${o.automatic ? ' (automatique)' : ''}`,
                ),
            ]
          : []),
        ...(detail.sharedItems.length > 0
          ? [
              '',
              'Partagé chaque mois :',
              ...detail.sharedItems.map(
                (item) =>
                  `- ${item.name} : ${item.share.bps !== null ? `${item.share.bps / 100} %` : euros(item.share.amountCents ?? 0)} depuis le ${frenchDate(item.share.from)}`,
              ),
            ]
          : []),
        ...(detail.expected.length > 0
          ? ['Attendu ce mois-ci :', ...detail.expected.map(expectedLine)]
          : []),
      ].join('\n')
    }

    const summary = await api.get<OwedSummaryDto>('/api/owed')
    const expected = summary.expected
    const expectedTotal = expected.reduce(
      (total, item) => total + item.expectedCents,
      0,
    )
    return [
      `Ce qu’on me doit : ${euros(summary.owedToMe.totalCents)}`,
      ...listLines(summary.owedToMe),
      '',
      `Ce que je dois : ${euros(summary.iOwe.totalCents)}`,
      ...listLines(summary.iOwe),
      ...(summary.offers.length > 0
        ? ['', 'À compenser :', ...summary.offers.map(offerLine)]
        : []),
      ...(expected.length > 0
        ? [
            '',
            `Remboursements attendus en ${frenchMonth(summary.month)} : ${euros(expectedTotal)}`,
            ...expected.map(expectedLine),
          ]
        : []),
      '',
      'Les deux listes se compensent seulement quand le propriétaire le choisit (« Compenser » dans l’app) ; elles restent hors du patrimoine. Le détail d’une personne : owed_to_me avec contact.',
    ].join('\n')
  },
})
