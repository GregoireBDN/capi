/**
 * Two writes the owner asked Claude to be able to do, never on its own
 * (#597): « Résilier » a subscription from a date and letting a debt go.
 * Besides the preview and `confirm: true` of every write tool, both are
 * annotated `destructiveHint: true`, so the client asks the owner to approve
 * the call itself each time. Undoing them (« Réactiver », « Réclamer à
 * nouveau ») stays in the app.
 */
import { z } from 'zod'
import type { ReceivableDto, RecurringItemDto } from '../api/types.js'
import { euros, frenchDate, parseEuros } from '../format.js'
import { DATE_PATTERN, normalize, UUID_PATTERN } from './lookup.js'
import { defineTool, ToolInputError } from './tool.js'
import { confirmSchema, PREVIEW_FOOTER, PREVIEW_HEADER } from './write.js'

/** Said in both descriptions: the owner's own ask, never a routine's. */
const ONLY_WHEN_ASKED =
  'Only when the owner asked for it in this conversation, never on your own or as a step of a review.'

/** The confirmed recurring item named `input` (its id, or its name). */
export function pickRecurring(
  items: RecurringItemDto[],
  input: string,
): RecurringItemDto {
  const confirmed = items.filter((i) => i.status === 'confirmed')
  const byId = confirmed.find((i) => i.id.toLowerCase() === input.toLowerCase())
  if (byId) return byId
  const key = normalize(input)
  const exact = confirmed.filter((i) => normalize(i.name) === key)
  const matches =
    exact.length > 0
      ? exact
      : confirmed.filter((i) => normalize(i.name).includes(key))
  if (matches.length === 1 && matches[0]) return matches[0]
  if (matches.length > 1) {
    throw new ToolInputError(
      `Plusieurs abonnements correspondent à « ${input} » : ${matches.map((i) => `${i.name} (${i.accountName}, id ${i.id})`).join(', ')}. Rien n'a été modifié ; précisez avec l'id.`,
    )
  }
  const suggested = items.find(
    (i) => i.status === 'suggested' && normalize(i.name).includes(key),
  )
  throw new ToolInputError(
    suggested
      ? `« ${suggested.name} » est détecté mais pas confirmé : il se confirme dans l'application (« Abonnements ») avant de pouvoir être résilié.`
      : `Aucun abonnement confirmé ne s'appelle « ${input} » ; voyez la liste avec subscriptions.`,
  )
}

export const cancelSubscriptionTool = defineTool({
  name: 'cancel_subscription',
  title: 'Résilier un abonnement',
  description: `« Résilier » a confirmed subscription or fixed cost from a date, e.g. the one in a cancellation email: no charge expected from that day, a later one is flagged. ${ONLY_WHEN_ASKED} Reactivating is done in the app.`,
  write: { idempotent: true, destructive: true },
  inputSchema: {
    subscription: z
      .string()
      .min(1)
      .max(100)
      .describe('Its name as subscriptions shows it, or its id.'),
    ended_on: z
      .string()
      .regex(DATE_PATTERN)
      .describe('First day without a charge, YYYY-MM-DD.'),
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    const items = await api.get<RecurringItemDto[]>('/api/recurring')
    const item = pickRecurring(items, args.subscription)
    const what = `${item.name} · ${euros(item.typicalAmountCents)} · ${euros(item.monthlyEquivalentCents)} / mois · ${item.accountName}`
    if (item.endedOn === args.ended_on) {
      return `Rien à modifier : ${what} est déjà résilié à partir du ${frenchDate(args.ended_on)}.`
    }
    const charged =
      item.lastSeenDate && item.lastSeenDate >= args.ended_on
        ? ` Attention : un prélèvement a déjà eu lieu le ${frenchDate(item.lastSeenDate)}, après cette date ; il sera signalé.`
        : ''
    if (args.confirm !== true) {
      return [
        PREVIEW_HEADER,
        `Résilier : ${what}`,
        item.endedOn
          ? `Fin : ${frenchDate(item.endedOn)} → ${frenchDate(args.ended_on)}`
          : `Plus de prélèvement attendu à partir du ${frenchDate(args.ended_on)}.${charged}`,
        `Effet : ${euros(item.yearlyCostCents)} / an en moins dans les charges récurrentes et la prévision après cette date.`,
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }
    const saved = await api.send<RecurringItemDto>(
      'PATCH',
      `/api/recurring/${item.id}`,
      { endedOn: args.ended_on },
    )
    return [
      `Résilié : ${saved.name}, plus de prélèvement attendu à partir du ${frenchDate(saved.endedOn)}.`,
      'Pour annuler : « Réactiver » sur l’abonnement dans l’application.',
    ].join('\n')
  },
})

export const forgiveDebtTool = defineTool({
  name: 'forgive_debt',
  title: 'Effacer une dette',
  description: `Let an open item of owed_to_me go, all or part of what is left: « Je ne me fais pas rembourser » (someone owes the owner: that part comes back into his spending) or the person does not want to be repaid (the owner owes: it leaves his spending). ${ONLY_WHEN_ASKED} Claiming it again is done in the app.`,
  write: { idempotent: false, destructive: true },
  inputSchema: {
    item: z
      .string()
      .regex(UUID_PATTERN)
      .describe('Item id (owed_to_me with contact).'),
    amount: z
      .string()
      .max(20)
      .optional()
      .describe('Euros as text, without sign. Default: all that is left.'),
    note: z.string().max(500).optional().describe('Why, in a few words.'),
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    const item = await api.get<ReceivableDto>(`/api/receivables/${args.item}`)
    const owedToMe = item.direction === 'owed_to_me'
    const who = owedToMe
      ? `${item.contactName} vous doit`
      : `vous devez à ${item.contactName}`
    const what = `${frenchDate(item.bookingDate)} · ${item.label} · ${who} ${euros(item.amountCents)}`
    if (item.leftCents <= 0) {
      return `Rien à effacer : ${what}, il ne reste rien (${item.state === 'repaid' ? 'remboursé' : 'déjà abandonné'}).`
    }
    let cents = item.leftCents
    if (args.amount !== undefined) {
      const parsed = parseEuros(args.amount)
      if (!parsed || parsed.cents < 1 || parsed.sign === '-') {
        throw new ToolInputError(
          `Montant « ${args.amount} » invalide : des euros sans signe, ex. 12,50.`,
        )
      }
      if (parsed.cents > item.leftCents) {
        throw new ToolInputError(
          `${euros(parsed.cents)} dépasse ce qui reste (${euros(item.leftCents)}). Rien n'a été modifié.`,
        )
      }
      cents = parsed.cents
    }
    const effect = owedToMe
      ? `${euros(cents)} reviennent dans vos dépenses (${item.category?.name ?? 'sans catégorie'}).`
      : `${euros(cents)} sortent de vos dépenses (${item.category?.name ?? 'sans catégorie'}).`
    if (args.confirm !== true) {
      return [
        PREVIEW_HEADER,
        `Effacer : ${what}`,
        `Montant effacé : ${euros(cents)} ; reste réclamé : ${euros(item.leftCents - cents)}.`,
        `Effet : ${effect}`,
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }
    const saved = await api.send<ReceivableDto>(
      'POST',
      `/api/receivables/${item.id}/forgive`,
      { amountCents: cents, ...(args.note ? { note: args.note } : {}) },
    )
    return [
      `Effacé : ${euros(cents)} sur ${item.label} (${item.contactName}) ; reste ${euros(saved.leftCents)}.`,
      'Pour annuler : « Réclamer à nouveau » dans l’application.',
    ].join('\n')
  },
})
