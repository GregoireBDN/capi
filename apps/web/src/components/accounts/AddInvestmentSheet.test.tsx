import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountDto, CreateAccountDto } from '#/api/types.gen'
import { AddInvestmentButton, validateInvestment } from './AddInvestmentSheet'

const api = vi.hoisted(() => ({
  accountsControllerCreate: vi.fn(),
  accountSnapshotsControllerUpsert: vi.fn(),
  accountSnapshotsControllerBulk: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  }),
)

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))

// Radix RadioGroup (radio cards) measures itself; jsdom has no ResizeObserver.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/** Synthetic data only. */
const NEW_ID = 'b0000000-0000-4000-8000-000000000001'

function account(overrides: Partial<AccountDto> = {}): AccountDto {
  return {
    id: NEW_ID,
    name: 'PEA',
    type: 'brokerage',
    institution: null,
    position: 0,
    archivedAt: null,
    balanceCents: null,
    balanceDate: null,
    cryptoSource: null,
    cryptoProvider: null,
    cryptoSyncedAt: null,
    investedBaseCents: null,
    investedBaseOn: null,
    openedOn: null,
    createdAt: '2026-11-13T10:00:00.000Z',
    updatedAt: '2026-11-13T10:00:00.000Z',
    ...overrides,
  }
}

function ok<T>(data: T, status = 200) {
  return Promise.resolve({ data, response: new Response(null, { status }) })
}

function failure(status: number) {
  return Promise.resolve({
    error: { message: 'Bad Request' },
    response: new Response(null, { status }),
  })
}

function renderWithClient(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  return { invalidate }
}

describe('AddInvestmentSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 13 November 2026, 00:30 in Paris (still the 12th in UTC).
    vi.setSystemTime(new Date('2026-11-12T23:30:00Z'))
    for (const fn of Object.values(api)) fn.mockReset()
    for (const fn of [toast.success, toast.warning, toast.error]) fn.mockReset()
    api.accountsControllerCreate.mockImplementation(
      ({ body }: { body: CreateAccountDto }) =>
        ok(account({ ...body, institution: body.institution ?? null }), 201),
    )
    api.accountSnapshotsControllerUpsert.mockImplementation(() =>
      ok({ id: 's1', date: '2026-11-13', valueCents: 1, note: null }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds a PEA with its current value in one field', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { invalidate } = renderWithClient(<AddInvestmentButton />)

    await user.click(
      screen.getByRole('button', { name: 'Ajouter un placement' }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Ajouter un placement' }),
    ).toBeInTheDocument()
    // PEA, named after its type and dated today in Paris, by default.
    expect(screen.getByRole('radio', { name: 'PEA' })).toBeChecked()
    expect(screen.getByLabelText('Nom')).toHaveValue('PEA')
    expect(screen.getByLabelText('À la date du')).toHaveValue('2026-11-13')

    await user.type(screen.getByLabelText('Valeur actuelle'), '12 345,67')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await screen.findByRole('heading', { name: 'Historique de « PEA »' })
    expect(api.accountsControllerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { name: 'PEA', type: 'brokerage', institution: null },
      }),
    )
    expect(api.accountSnapshotsControllerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: NEW_ID, date: '2026-11-13' },
        body: { valueCents: 1_234_567, contributionsCents: null, note: null },
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Placement « PEA » ajouté')
    // The dashboard (net worth) and the savings page refresh at once.
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey)
    expect(keys).toContainEqual(['dashboard'])
    expect(keys).toContainEqual(['savings'])

    // The history is optional.
    await user.click(screen.getByRole('button', { name: 'Plus tard' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Historique de « PEA »' }),
      ).not.toBeInTheDocument(),
    )
    expect(api.accountSnapshotsControllerBulk).not.toHaveBeenCalled()
  })

  it('adds a life insurance with its contributions, then pastes its history', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.accountSnapshotsControllerBulk.mockImplementation(() =>
      ok({ created: 2, updated: 0 }),
    )
    renderWithClient(<AddInvestmentButton />)

    await user.click(
      screen.getByRole('button', { name: 'Ajouter un placement' }),
    )
    await user.click(
      await screen.findByRole('radio', { name: 'Assurance vie' }),
    )
    // The name follows the type while it hasn't been typed.
    expect(screen.getByLabelText('Nom')).toHaveValue('Assurance vie')
    await user.type(screen.getByLabelText('Établissement'), 'Assureur test')
    await user.type(screen.getByLabelText('Valeur actuelle'), '20 000')
    await user.clear(screen.getByLabelText('À la date du'))
    await user.type(screen.getByLabelText('À la date du'), '2026-10-31')
    await user.type(screen.getByLabelText('Investi jusqu’ici'), '18 000')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await screen.findByRole('heading', {
      name: 'Historique de « Assurance vie »',
    })
    expect(api.accountsControllerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          name: 'Assurance vie',
          type: 'life_insurance',
          institution: 'Assureur test',
        },
      }),
    )
    expect(api.accountSnapshotsControllerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: NEW_ID, date: '2026-10-31' },
        body: {
          valueCents: 2_000_000,
          contributionsCents: 1_800_000,
          note: null,
        },
      }),
    )

    await user.click(screen.getByLabelText('Historique'))
    await user.paste('31/08/2026;19 500;17 500\n30/09/2026;19 800')
    await user.click(
      await screen.findByRole('button', { name: 'Enregistrer 2 valeurs' }),
    )

    await waitFor(() =>
      expect(api.accountSnapshotsControllerBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: NEW_ID },
          body: {
            rows: [
              {
                date: '2026-08-31',
                valueCents: 1_950_000,
                contributionsCents: 1_750_000,
              },
              {
                date: '2026-09-30',
                valueCents: 1_980_000,
                contributionsCents: null,
              },
            ],
          },
        }),
      ),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', {
          name: 'Historique de « Assurance vie »',
        }),
      ).not.toBeInTheDocument(),
    )
  })

  it('asks for the current value before creating anything', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithClient(<AddInvestmentButton />)

    await user.click(
      screen.getByRole('button', { name: 'Ajouter un placement' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Ajouter' }))

    expect(screen.getByText('Indiquez la valeur')).toBeInTheDocument()
    expect(api.accountsControllerCreate).not.toHaveBeenCalled()
  })

  it('closes with a warning when the value could not be saved', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.accountSnapshotsControllerUpsert.mockImplementation(() => failure(500))
    renderWithClient(<AddInvestmentButton />)

    await user.click(
      screen.getByRole('button', { name: 'Ajouter un placement' }),
    )
    await user.type(await screen.findByLabelText('Valeur actuelle'), '100')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(toast.warning).toHaveBeenCalled())
    expect(
      screen.queryByRole('heading', { name: 'Historique de « PEA »' }),
    ).not.toBeInTheDocument()
  })
})

describe('validateInvestment', () => {
  const values = {
    type: 'brokerage' as const,
    name: 'PEA',
    institution: '',
    value: '1 000',
    date: '2026-11-13',
    contributions: '',
  }

  it('accepts a value dated today', () => {
    expect(validateInvestment(values, '2026-11-13')).toEqual({})
  })

  it('refuses a future date, a negative value and a bad contributions amount', () => {
    expect(
      validateInvestment(
        {
          ...values,
          value: '-5',
          date: '2026-11-14',
          contributions: 'abc',
          name: ' ',
        },
        '2026-11-13',
      ),
    ).toEqual({
      name: 'Indiquez un nom',
      value: 'La valeur ne peut pas être négative',
      date: 'La date ne peut pas être dans le futur',
      contributions: 'Montant invalide (ex. 10 000)',
    })
  })
})
