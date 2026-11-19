import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountDto, InvestmentsSummaryDto } from '#/api/types.gen'
import { AccountsPage } from './AccountsPage'

const api = vi.hoisted(() => ({
  accountsControllerList: vi.fn(),
  investmentsControllerSummary: vi.fn(),
}))

vi.mock('#/api', () => api)
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string
    params?: Record<string, string>
    children: ReactNode
  }) => (
    <a href={to.replace('$accountId', params?.accountId ?? '')} {...props}>
      {children}
    </a>
  ),
}))

/** Synthetic data only. */
function account(overrides: Partial<AccountDto>): AccountDto {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Compte test',
    type: 'checking',
    institution: 'Banque test',
    position: 0,
    archivedAt: null,
    balanceCents: 123_456,
    balanceDate: '2026-11-03',
    cryptoSource: null,
    cryptoProvider: null,
    cryptoSyncedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const checking = account({})
const pea = account({
  id: '30000000-0000-4000-8000-000000000002',
  name: 'PEA test',
  type: 'brokerage',
  institution: null,
  position: 1,
  balanceCents: 200_000,
  balanceDate: '2026-09-30',
})
const lifeInsurance = account({
  id: '30000000-0000-4000-8000-000000000003',
  name: 'Contrat test',
  type: 'life_insurance',
  institution: 'Assureur test',
  position: 2,
  balanceCents: 110_000,
  balanceDate: '2026-10-31',
})

const summary: InvestmentsSummaryDto = {
  totals: {
    valueCents: 310_000,
    contributionsCents: 83_000,
    gainCents: 27_000,
    returnRate: 0.33,
    withoutContributionsCount: 1,
    withoutValueCount: 0,
    staleCount: 1,
  },
  accounts: [
    {
      id: pea.id,
      name: pea.name,
      type: pea.type,
      institution: null,
      valueCents: 200_000,
      valueDate: '2026-09-30',
      contributionsCents: null,
      contributionsDate: null,
      contributionsSource: null,
      typedContributionsCents: null,
      linkedTransfersCount: 0,
      linkedAfterValueCents: 0,
      gainCents: null,
      returnRate: null,
      daysSinceLatest: 36,
      staleAfterDays: 35,
      stale: true,
    },
    {
      id: lifeInsurance.id,
      name: lifeInsurance.name,
      type: lifeInsurance.type,
      institution: 'Assureur test',
      valueCents: 110_000,
      valueDate: '2026-10-31',
      contributionsCents: 83_000,
      contributionsDate: '2026-10-31',
      contributionsSource: 'typed',
      typedContributionsCents: null,
      linkedTransfersCount: 0,
      linkedAfterValueCents: 0,
      gainCents: 27_000,
      returnRate: 0.33,
      daysSinceLatest: 5,
      staleAfterDays: 35,
      stale: false,
    },
  ],
}

function ok<T>(data: T) {
  return Promise.resolve({ data, response: { ok: true, status: 200 } })
}

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const text = (value: string) => value.replace(/\s/g, ' ')

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountsPage />
    </QueryClientProvider>,
  )
}

describe('AccountsPage', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    api.accountsControllerList.mockImplementation(
      ({ query }: { query?: { includeArchived?: boolean } } = {}) =>
        ok(
          query?.includeArchived
            ? [
                checking,
                pea,
                lifeInsurance,
                account({
                  id: '30000000-0000-4000-8000-000000000009',
                  name: 'Ancien livret',
                  type: 'savings',
                  archivedAt: '2026-06-01T00:00:00.000Z',
                  balanceDate: '2025-12-31',
                }),
              ]
            : [checking, pea, lifeInsurance],
        ),
    )
    api.investmentsControllerSummary.mockImplementation(() => ok(summary))
  })

  it('lists the accounts with one target per row and a fixed second line', async () => {
    renderPage()

    const row = await screen.findByRole('link', { name: /Compte test/ })
    expect(row).toHaveAttribute('href', `/accounts/${checking.id}`)
    expect(row).toHaveTextContent('Compte courant · Banque test · au 3 nov.')

    // Stale: « à mettre à jour » on the right; the name says it is a PEA.
    const peaRow = screen.getByRole('link', { name: /PEA test/ })
    expect(peaRow).toHaveTextContent('au 30 sept.')
    expect(peaRow).toHaveTextContent('à mettre à jour')
    expect(peaRow).not.toHaveTextContent('PEA / compte-titres')

    // Gain over contributions on the right.
    expect(
      screen.getByRole('link', { name: /Contrat test/ }),
    ).toHaveTextContent(text('Assurance vie · Assureur test · au 31 oct.'))
    expect(
      screen.getByRole('link', { name: /Contrat test/ }),
    ).toHaveTextContent(text('+270,00 € · +33 %'))

    // Archived accounts use the same rows; the year shows when it isn't this one.
    expect(
      await screen.findByRole('link', { name: /Ancien livret/ }),
    ).toHaveTextContent(/^Ancien livretBanque test · au 31 déc\. 2025/)

    // Phones (#344): the name, then the value and its rate or the stale
    // value's date.
    expect(peaRow).toHaveTextContent('À mettre à jour, valeur 30 sept.')
    expect(
      screen.getByRole('link', { name: /Contrat test/ }),
    ).toHaveTextContent(/€\+33 %/)
    for (const item of document.querySelectorAll(
      '[data-slot="item-list-row"]',
    )) {
      expect(item).toHaveClass('@container/item-row')
    }

    // No per-row button in the lists.
    for (const list of document.querySelectorAll('[data-slot="item-list"]')) {
      expect(
        within(list as HTMLElement).queryByRole('button'),
      ).not.toBeInTheDocument()
    }
  })

  it('makes « Ajouter un compte » the primary page action', async () => {
    renderPage()
    await screen.findByRole('link', { name: /Compte test/ })
    const add = screen.getAllByRole('button', { name: 'Ajouter un compte' })[0]
    const invest = screen.getAllByRole('button', {
      name: 'Ajouter un placement',
    })[0]
    expect(add.compareDocumentPosition(invest)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })
})
