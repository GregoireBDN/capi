// close_months (#342): preview without confirm writes nothing, confirm closes
// the open months oldest first, a repeated call changes nothing more, a read
// token is refused. Synthetic data only.
import { describe, expect, it } from 'vitest'
import type {
  MonthCloseDto,
  MonthCloseListDto,
  MonthCloseStep,
} from '../api/types.js'
import { pea, period } from '../test/fixtures.js'
import { connect, jsonError } from '../test/mock-api.js'
import { dashboardMonth } from './month-close-writes.js'

// `connect` runs on 14/11/2026: the current month is November 2026.
const MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
const CLOSED_AT = '2026-11-02T09:00:00.000Z'

function closeDto(
  month: string,
  { closed = false, open = [] as MonthCloseStep[] } = {},
): MonthCloseDto {
  const keys: MonthCloseStep[] = [
    'imports',
    'review_queue',
    'recurring',
    'budget',
    'savings',
    'investments',
    'close',
  ]
  return {
    month,
    period: period({ month, status: 'complete', throughDay: null }),
    closable: true,
    status: closed ? 'closed' : 'open',
    closedAt: closed ? CLOSED_AT : null,
    steps: keys.map((key) => ({
      key,
      done: key === 'close' ? closed : !open.includes(key),
    })),
    imports: { accounts: [], gaps: [] },
    reviewQueue: { count: open.includes('review_queue') ? 3 : 0 },
    recurring: { suggestedCount: 0, priceChanges: [], chargedAfterEnd: [] },
    investments: {
      accounts: open.includes('investments')
        ? [
            {
              id: pea.id,
              name: 'PEA',
              type: 'brokerage',
              group: 'investments',
              lastDate: '2026-07-31',
            },
          ]
        : [],
    },
  } as unknown as MonthCloseDto
}

/**
 * A fake month-close API: `closed` holds the closed months and grows with
 * every successful close; `fail` answers a status for some months' close.
 */
function monthCloseApi(
  closed: string[],
  {
    open = {} as Record<string, MonthCloseStep[]>,
    fail = {} as Record<string, number>,
  } = {},
) {
  const routes: Record<string, unknown> = {
    'GET /api/month-close': (): MonthCloseListDto => ({
      closed: [...closed]
        .sort()
        .map((month) => ({ month, closedAt: CLOSED_AT })),
    }),
  }
  for (const month of MONTHS) {
    routes[`GET /api/month-close/${month}`] = () =>
      closeDto(month, { closed: closed.includes(month), open: open[month] })
    routes[`POST /api/month-close/${month}/close`] = () => {
      const status = fail[month]
      if (status) return jsonError(status, { message: 'Refusé' })
      if (closed.includes(month)) {
        return jsonError(409, { message: 'Ce mois est déjà clôturé.' })
      }
      closed.push(month)
      return closeDto(month, { closed: true })
    }
  }
  return routes
}

const closes = (calls: { method: string; url: URL }[]) =>
  calls
    .filter((c) => c.method === 'POST')
    .map((c) => c.url.pathname.split('/')[3])

describe('close_months', () => {
  it('previews every open month since the first close, writing nothing', async () => {
    const { call, writes } = await connect(
      monthCloseApi(['2026-07'], {
        open: { '2026-08': ['review_queue', 'investments'] },
      }),
    )
    const { text, isError } = await call('close_months', { allBefore: true })
    expect(isError).toBe(false)
    expect(writes()).toHaveLength(0)
    expect(text).toContain('APERÇU')
    expect(text).toContain('- août 2026 : à clôturer · étapes faites 4/6')
    expect(text).toContain(
      '  ✗ Opérations à revoir : 3 opération(s) du mois à revoir',
    )
    expect(text).toContain(
      '  ✗ Valeurs des placements : sans valeur à la fin du mois : PEA',
    )
    expect(text).toContain(
      '- septembre 2026 : à clôturer · étapes faites 6/6, tout est fait',
    )
    expect(text).toContain('- octobre 2026 : à clôturer')
    expect(text).toContain('Déjà clôturés, rien à faire : juillet 2026.')
    expect(text).not.toContain('juin 2026')
    expect(text).toContain(
      "le tableau de bord s'ouvrira sur le mois en cours (novembre 2026)",
    )
    expect(text).toContain('confirm: true')
  })

  it('closes the open months oldest first, then changes nothing more', async () => {
    const closed = ['2026-07']
    const { call, calls } = await connect(monthCloseApi(closed))
    const { text, isError } = await call('close_months', {
      allBefore: true,
      confirm: true,
    })
    expect(isError).toBe(false)
    expect(closes(calls)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(text).toContain(
      '3 mois clôturé(s) : août 2026, septembre 2026, octobre 2026.',
    )
    expect(text).toContain(
      "Le tableau de bord s'ouvre sur le mois en cours (novembre 2026).",
    )
    expect(text).toContain('Revue du mois › Rouvrir')

    const again = await call('close_months', {
      allBefore: true,
      confirm: true,
    })
    expect(again.isError).toBe(false)
    expect(closes(calls)).toHaveLength(3)
    expect(again.text).toContain(
      'Rien à clôturer : tous les mois de juillet 2026 à octobre 2026 sont déjà clôturés.',
    )
  })

  it('asks for a start month when no month was ever closed', async () => {
    const closed: string[] = []
    const { call, calls } = await connect(monthCloseApi(closed))
    const refused = await call('close_months', {
      allBefore: true,
      confirm: true,
    })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain(
      'indiquez le premier mois à clôturer avec from',
    )
    expect(closes(calls)).toHaveLength(0)

    const { text } = await call('close_months', {
      allBefore: true,
      from: '2026-09',
      confirm: true,
    })
    expect(closes(calls)).toEqual(['2026-09', '2026-10'])
    expect(text).toContain('2 mois clôturé(s) : septembre 2026, octobre 2026.')
  })

  it('closes one month and says which month the dashboard opens on', async () => {
    const { call, calls } = await connect(monthCloseApi(['2026-07', '2026-09']))
    const preview = await call('close_months', { month: '2026-10' })
    expect(preview.text).toContain('- octobre 2026 : à clôturer')
    expect(preview.text).not.toContain('septembre 2026 :')

    const { text } = await call('close_months', {
      month: '2026-10',
      confirm: true,
    })
    expect(closes(calls)).toEqual(['2026-10'])
    expect(text).toContain('1 mois clôturé(s) : octobre 2026.')
    expect(text).toContain(
      "Le tableau de bord s'ouvre sur août 2026, le plus ancien mois encore ouvert.",
    )

    const again = await call('close_months', {
      month: '2026-10',
      confirm: true,
    })
    expect(closes(calls)).toHaveLength(1)
    expect(again.text).toContain(
      'octobre 2026 est déjà clôturé (le 02/11/2026) : rien à faire.',
    )
  })

  it.each([
    [{ month: '2026-11' }, "novembre 2026 n'est pas terminé"],
    [{ allBefore: true, from: '2026-12' }, "décembre 2026 n'est pas terminé"],
    [{ month: '2026-10', allBefore: true }, 'Indiquez soit month'],
    [{}, 'Indiquez soit month'],
    [{ month: '2026-10', from: '2026-08' }, "from ne s'utilise qu'avec"],
  ])('refuses %o before calling the API', async (args, message) => {
    const { call, calls } = await connect(monthCloseApi([]))
    const { text, isError } = await call('close_months', {
      ...args,
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toContain(message)
    expect(calls).toHaveLength(0)
  })

  it('explains that a read token cannot close', async () => {
    const { call } = await connect(
      monthCloseApi(['2026-09'], { fail: { '2026-10': 403 } }),
    )
    const { text, isError } = await call('close_months', {
      allBefore: true,
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toMatch(/lecture seule.*Rien n'a été modifié/s)
  })

  it('skips a month closed meanwhile in the app', async () => {
    const closed = ['2026-08']
    const routes = monthCloseApi(closed)
    // Listed as open, but closed by the time the tool closes it.
    routes['GET /api/month-close'] = (): MonthCloseListDto => ({
      closed: [{ month: '2026-08', closedAt: CLOSED_AT }],
    })
    closed.push('2026-09')
    const { call, calls } = await connect(routes)
    const { text, isError } = await call('close_months', {
      allBefore: true,
      confirm: true,
    })
    expect(isError).toBe(false)
    expect(closes(calls)).toEqual(['2026-09', '2026-10'])
    expect(text).toContain('1 mois clôturé(s) : octobre 2026.')
    expect(text).toContain(
      'Déjà clôturés, rien à faire : août 2026, septembre 2026.',
    )
  })

  it('reports what was closed when a later month fails', async () => {
    const { call } = await connect(
      monthCloseApi(['2026-08'], { fail: { '2026-10': 500 } }),
    )
    const { text, isError } = await call('close_months', {
      allBefore: true,
      confirm: true,
    })
    expect(isError).toBe(false)
    expect(text).toContain('Erreur après 1 mois clôturé(s)')
    expect(text).toContain('Clôturés : septembre 2026.')
    expect(text).toContain('Pas clôturés : octobre 2026.')
  })
})

describe('dashboardMonth', () => {
  it('mirrors the dashboard default month (#321)', () => {
    expect(dashboardMonth(new Set(), '2026-11')).toBe('2026-10')
    expect(dashboardMonth(new Set(['2026-08', '2026-10']), '2026-11')).toBe(
      '2026-09',
    )
    expect(dashboardMonth(new Set(['2026-09', '2026-10']), '2026-11')).toBe(
      '2026-11',
    )
  })
})
