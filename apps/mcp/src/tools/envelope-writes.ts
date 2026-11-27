/**
 * Envelopes from Claude (#518): create the envelope a project budget ends
 * with, and add to one from « libre ». An envelope is never a transaction
 * (ADR 0008): balances, statistics and net worth stay as they are. Changing,
 * deleting or taking money out of an envelope stays in the app.
 */
import { z } from 'zod'
import type {
  AccountDto,
  AccountEnvelopesDto,
  CreateEnvelopeDto,
  EnvelopeSummaryDto,
} from '../api/types.js'
import type { ApiClient } from '../api/client.js'
import { euros, frenchDate, parseEuros } from '../format.js'
import { DATE_PATTERN, listAccounts, normalize, pickAccount } from './lookup.js'
import { envelopeLine } from './savings.js'
import { defineTool, ToolInputError } from './tool.js'
import { confirmSchema, PREVIEW_FOOTER, PREVIEW_HEADER } from './write.js'

/** Accounts an envelope starts on in one call. */
const MAX_START = 5
/** The API's ceiling for one amount: 10 000 000 €. */
const AMOUNT_MAX_CENTS = 1_000_000_000

const IN_APP =
  "Pour la modifier, la supprimer ou en reprendre de l'argent : dans l'application, Épargne › Enveloppes."
const NOTHING = "Rien n'a été modifié."

const amountSchema = z
  .string()
  .max(20)
  .describe('Euros, e.g. "300" or "42,50".')

/** Positive cents from euros typed as text. */
function cents(text: string, what: string): number {
  const parsed = parseEuros(text)
  if (
    !parsed ||
    parsed.sign !== null ||
    parsed.cents < 1 ||
    parsed.cents > AMOUNT_MAX_CENTS
  ) {
    throw new ToolInputError(
      `${what} « ${text} » invalide : un montant en euros sans signe, par exemple 300 ou 42,50. ${NOTHING}`,
    )
  }
  return parsed.cents
}

/** The envelopes still in use with this name (accents and case ignored). */
async function sameName(
  api: ApiClient,
  name: string,
): Promise<EnvelopeSummaryDto[]> {
  const list = await api.get<EnvelopeSummaryDto[]>('/api/envelopes')
  return list.filter((e) => normalize(e.name) === normalize(name))
}

function split(api: ApiClient, account: AccountDto) {
  return api.get<AccountEnvelopesDto>(`/api/accounts/${account.id}/envelopes`)
}

/** « Libre » before → after on the account, or why it cannot be taken. */
function freeLine(
  account: AccountDto,
  current: AccountEnvelopesDto,
  amount: number,
): string {
  const free = current.freeCents ?? 0
  if (amount > free) {
    throw new ToolInputError(
      `${account.name} n'a que ${euros(Math.max(0, free))} « libre » (solde ${euros(current.balanceCents ?? 0)}, dont ${euros(current.allocatedCents)} déjà dans des enveloppes) : impossible d'y mettre ${euros(amount)} de côté. ${NOTHING}`,
    )
  }
  return `- ${account.name} : ${euros(amount)} mis de côté · « libre » ${euros(free)} → ${euros(free - amount)} (solde inchangé : ${euros(current.balanceCents ?? 0)})`
}

export const createEnvelopeTool = defineTool({
  name: 'create_envelope',
  title: 'Créer une enveloppe',
  description:
    'Create an envelope (money set aside, never a transaction), with an optional target, due date and starting amounts from accounts’ « libre ». Refused if the name exists: use add_to_envelope.',
  write: { idempotent: true },
  inputSchema: {
    name: z.string().min(1).max(100),
    target: amountSchema.optional().describe('Target, euros.'),
    dueDate: z.string().regex(DATE_PATTERN).optional().describe('YYYY-MM-DD.'),
    start: z
      .array(z.object({ account: z.string().max(100), amount: amountSchema }))
      .max(MAX_START)
      .optional()
      .describe('From each account’s « libre ».'),
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    const name = args.name.trim()
    if (name === '') throw new ToolInputError(`Nom vide. ${NOTHING}`)
    const targetCents =
      args.target === undefined ? undefined : cents(args.target, 'Objectif')
    const accounts =
      (args.start ?? []).length > 0 ? await listAccounts(api) : []
    const start = (args.start ?? []).map((s) => ({
      account: pickAccount(accounts, s.account),
      amountCents: cents(s.amount, 'Montant'),
    }))
    if (new Set(start.map((s) => s.account.id)).size !== start.length) {
      throw new ToolInputError(`Un seul montant par compte. ${NOTHING}`)
    }

    const existing = await sameName(api, name)
    if (existing.length > 0) {
      return [
        `Une enveloppe « ${name} » existe déjà, rien n'a été créé :`,
        ...existing.map(envelopeLine),
        'Pour y ajouter de l’argent : add_to_envelope.',
      ].join('\n')
    }
    const lines = await Promise.all(
      start.map(async (s) =>
        freeLine(s.account, await split(api, s.account), s.amountCents),
      ),
    )
    const what = [
      `Enveloppe « ${name} »`,
      targetCents === undefined
        ? 'sans montant visé'
        : `objectif ${euros(targetCents)}`,
      ...(args.dueDate ? [`pour le ${frenchDate(args.dueDate)}`] : []),
    ].join(' · ')

    if (args.confirm !== true) {
      return [
        PREVIEW_HEADER,
        what,
        lines.length > 0 ? 'Pour commencer :' : 'Vide pour l’instant.',
        ...lines,
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }

    const body: CreateEnvelopeDto = {
      name,
      ...(targetCents === undefined ? {} : { targetCents }),
      ...(args.dueDate ? { dueDate: args.dueDate } : {}),
      start: start.map((s) => ({
        accountId: s.account.id,
        amountCents: s.amountCents,
      })),
    }
    const created = await api.send<EnvelopeSummaryDto>(
      'POST',
      '/api/envelopes',
      body,
    )
    return [
      'Enveloppe créée (aucun solde ni statistique ne change) :',
      envelopeLine(created),
      IN_APP,
    ].join('\n')
  },
})

export const addToEnvelopeTool = defineTool({
  name: 'add_to_envelope',
  title: 'Ajouter à une enveloppe',
  description:
    'Add money to an envelope from an account’s « libre » (balance unchanged); each confirmed call adds.',
  write: { idempotent: false },
  inputSchema: {
    envelope: z.string().max(100),
    account: z.string().max(100),
    amount: amountSchema,
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    if (args.envelope.trim() === '' || args.account.trim() === '') {
      throw new ToolInputError(`Indiquez l'enveloppe et le compte. ${NOTHING}`)
    }
    const amountCents = cents(args.amount, 'Montant')
    const [envelopes, accounts] = await Promise.all([
      api.get<EnvelopeSummaryDto[]>('/api/envelopes'),
      listAccounts(api),
    ])
    const wanted = normalize(args.envelope)
    const exact = envelopes.filter((e) => normalize(e.name) === wanted)
    const matches =
      exact.length > 0
        ? exact
        : envelopes.filter((e) => normalize(e.name).includes(wanted))
    const envelope = matches.length === 1 ? matches[0] : undefined
    if (!envelope) {
      throw new ToolInputError(
        `L'enveloppe « ${args.envelope} » ${matches.length > 1 ? 'est ambiguë' : 'est introuvable'}. Enveloppes : ${envelopes.map((e) => e.name).join(', ') || 'aucune (create_envelope)'}. ${NOTHING}`,
      )
    }
    const account = pickAccount(accounts, args.account)
    const current = await split(api, account)
    const line = freeLine(account, current, amountCents)
    const held =
      current.envelopes.find((e) => e.envelopeId === envelope.id)
        ?.amountCents ?? 0

    if (args.confirm !== true) {
      return [
        PREVIEW_HEADER,
        `« ${envelope.name} » sur ${account.name} : ${euros(held)} → ${euros(held + amountCents)}`,
        line,
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }

    const after = await api.send<AccountEnvelopesDto>(
      'POST',
      `/api/envelopes/${envelope.id}/top-up`,
      { accountId: account.id, amountCents },
    )
    const holds =
      after.envelopes.find((e) => e.envelopeId === envelope.id)?.amountCents ??
      held + amountCents
    return [
      `${euros(amountCents)} ajoutés à « ${envelope.name} » sur ${account.name} : ${euros(holds)} y sont mis de côté, « libre » ${euros(after.freeCents ?? 0)} (solde inchangé).`,
      IN_APP,
    ].join('\n')
  },
})
