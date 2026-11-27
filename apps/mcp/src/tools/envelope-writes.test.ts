// create_envelope and add_to_envelope (#518): a preview without confirm
// writes nothing, confirm writes once, more than « libre » is refused before
// any write, a read token gets « lecture seule ». Synthetic data only.
import { describe, expect, it } from 'vitest'
import type { AccountEnvelopesDto, EnvelopeSummaryDto } from '../api/types.js'
import { checking, livret } from '../test/fixtures.js'
import { connect, jsonError } from '../test/mock-api.js'

const JAPAN_ID = '00000000-0000-4000-8000-0000000000e1'

function envelope(
  overrides: Partial<EnvelopeSummaryDto> = {},
): EnvelopeSummaryDto {
  return {
    id: JAPAN_ID,
    name: 'Voyage Japon',
    icon: null,
    color: null,
    targetCents: 240_000,
    dueDate: '2027-06-15',
    archived: false,
    categoryIds: [],
    totalCents: 30_000,
    paidCents: 0,
    putAsideCents: 30_000,
    accounts: [
      { accountId: livret.id, accountName: livret.name, amountCents: 30_000 },
    ],
    plan: {
      remainingCents: 210_000,
      progressRatio: 0.125,
      reached: false,
      monthsLeft: 7,
      targetDatePassed: false,
      requiredMonthlyCents: 30_000,
    },
    ...overrides,
  }
}

function accountSplit(
  accountId: string,
  allocatedCents: number,
  balanceCents = 500_000,
  envelopes: AccountEnvelopesDto['envelopes'] = [],
): AccountEnvelopesDto {
  return {
    accountId,
    balanceCents,
    balanceDate: '2026-11-10',
    envelopes,
    allocatedCents,
    freeCents: balanceCents - allocatedCents,
    shortfallCents: 0,
    splitKey: [],
    freeBasisPoints: 10_000,
  }
}

/** A fake envelopes API: `list` holds the envelopes and grows on create. */
function envelopesApi(list: EnvelopeSummaryDto[] = [], status?: number) {
  return {
    'GET /api/accounts': [checking, livret],
    'GET /api/envelopes': () => list,
    [`GET /api/accounts/${livret.id}/envelopes`]: accountSplit(
      livret.id,
      100_000,
    ),
    [`GET /api/accounts/${checking.id}/envelopes`]: accountSplit(
      checking.id,
      0,
      123_456,
    ),
    'POST /api/envelopes': () => {
      if (status) return jsonError(status, { message: 'Refusé' })
      const created = envelope()
      list.push(created)
      return created
    },
    [`POST /api/envelopes/${JAPAN_ID}/top-up`]: (
      _url: URL,
      body: { amountCents: number },
    ) =>
      status
        ? jsonError(status, { message: 'Refusé' })
        : accountSplit(livret.id, 100_000 + body.amountCents, 500_000, [
            {
              envelopeId: JAPAN_ID,
              name: 'Voyage Japon',
              icon: null,
              color: null,
              archived: false,
              amountCents: 30_000 + body.amountCents,
              shareOfBalance: null,
            },
          ]),
  }
}

const CREATE = {
  name: 'Voyage Japon',
  target: '2 400',
  dueDate: '2027-06-15',
  start: [{ account: 'Livret A', amount: '300' }],
}

describe('create_envelope', () => {
  it('previews « libre » before → after and writes nothing', async () => {
    const { call, writes } = await connect(envelopesApi())
    const { text, isError } = await call('create_envelope', CREATE)
    expect(isError).toBe(false)
    expect(text).toContain('APERÇU')
    expect(text).toContain(
      'Enveloppe « Voyage Japon » · objectif 2 400,00 € · pour le 15/06/2027',
    )
    expect(text).toMatch(
      /Livret A : 300,00 € mis de côté · « libre » 4 000,00 € → 3 700,00 € \(solde inchangé : 5 000,00 €\)/,
    )
    expect(writes()).toHaveLength(0)
  })

  it('creates it once with confirm, then refuses a second one with the same name', async () => {
    const list: EnvelopeSummaryDto[] = []
    const { call, writes } = await connect(envelopesApi(list))
    const { text } = await call('create_envelope', { ...CREATE, confirm: true })
    expect(text).toContain(
      'Enveloppe créée (aucun solde ni statistique ne change)',
    )
    expect(text).toContain('- Voyage Japon : 300,00 € sur 2 400,00 €')
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.body).toEqual({
      name: 'Voyage Japon',
      targetCents: 240_000,
      dueDate: '2027-06-15',
      start: [{ accountId: livret.id, amountCents: 30_000 }],
    })

    const again = await call('create_envelope', {
      ...CREATE,
      name: 'voyage japon',
      confirm: true,
    })
    expect(again.text).toContain('existe déjà')
    expect(again.text).toContain('add_to_envelope')
    expect(writes()).toHaveLength(1)
  })

  it('refuses more than « libre » and bad amounts before any write', async () => {
    const { call, writes } = await connect(envelopesApi())
    for (const args of [
      { ...CREATE, start: [{ account: 'Livret A', amount: '4 000,01' }] },
      { ...CREATE, target: '-50' },
      { ...CREATE, target: '0' },
      {
        ...CREATE,
        start: [
          { account: 'Livret A', amount: '10' },
          { account: 'livret a', amount: '20' },
        ],
      },
    ]) {
      const { text, isError } = await call('create_envelope', {
        ...args,
        confirm: true,
      })
      expect(isError, JSON.stringify(args)).toBe(true)
      expect(text).toContain("Rien n'a été modifié")
    }
    expect(writes()).toHaveLength(0)
  })

  it('explains that a read token cannot create', async () => {
    const { call } = await connect(envelopesApi([], 403))
    const { text, isError } = await call('create_envelope', {
      ...CREATE,
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toMatch(/lecture seule.*Rien n'a été modifié/s)
  })
})

describe('add_to_envelope', () => {
  const ADD = { envelope: 'japon', account: 'Livret A', amount: '200' }

  it('previews what the envelope holds and « libre », writing nothing', async () => {
    const { call, writes } = await connect(envelopesApi([envelope()]))
    const { text } = await call('add_to_envelope', ADD)
    expect(text).toContain('APERÇU')
    expect(text).toContain('« Voyage Japon » sur Livret A : 0,00 € → 200,00 €')
    expect(text).toContain('« libre » 4 000,00 € → 3 800,00 €')
    expect(writes()).toHaveLength(0)
  })

  it('adds from « libre » with confirm, through the top-up route only', async () => {
    const { call, writes } = await connect(envelopesApi([envelope()]))
    const { text } = await call('add_to_envelope', { ...ADD, confirm: true })
    expect(text).toContain(
      '200,00 € ajoutés à « Voyage Japon » sur Livret A : 500,00 € y sont mis de côté, « libre » 3 800,00 € (solde inchangé).',
    )
    expect(writes().map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      `POST /api/envelopes/${JAPAN_ID}/top-up`,
    ])
    expect(writes()[0]?.body).toEqual({
      accountId: livret.id,
      amountCents: 20_000,
    })
  })

  it('refuses an unknown envelope or more than « libre »', async () => {
    const { call, writes } = await connect(envelopesApi([envelope()]))
    const unknown = await call('add_to_envelope', {
      ...ADD,
      envelope: 'Voiture',
      confirm: true,
    })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toContain('introuvable')
    const tooMuch = await call('add_to_envelope', {
      ...ADD,
      amount: '4 000,01',
      confirm: true,
    })
    expect(tooMuch.isError).toBe(true)
    expect(tooMuch.text).toContain('4 000,00 € « libre »')
    expect(writes()).toHaveLength(0)
  })

  it('explains that a read token cannot add', async () => {
    const { call } = await connect(envelopesApi([envelope()], 403))
    const { text, isError } = await call('add_to_envelope', {
      ...ADD,
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toMatch(/lecture seule.*Rien n'a été modifié/s)
  })
})
