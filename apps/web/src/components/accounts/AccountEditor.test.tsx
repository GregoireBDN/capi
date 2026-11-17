import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountDto, CreateAccountDto } from '#/api/types.gen'
import { AccountEditor, NewAccountButton } from './AccountEditor'

const api = vi.hoisted(() => ({
  accountsControllerCreate: vi.fn(),
  accountsControllerUpdate: vi.fn(),
  accountSnapshotsControllerUpsert: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  }),
)
const navigate = vi.hoisted(() => vi.fn())

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

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
    name: 'Compte test',
    type: 'checking',
    institution: 'Banque test',
    position: 0,
    archivedAt: null,
    balanceCents: null,
    balanceDate: null,
    cryptoSource: null,
    cryptoProvider: null,
    cryptoSyncedAt: null,
    createdAt: '2026-11-06T10:00:00.000Z',
    updatedAt: '2026-11-06T10:00:00.000Z',
    ...overrides,
  }
}

function ok<T>(data: T, status = 200) {
  return Promise.resolve({ data, response: new Response(null, { status }) })
}

function failure(status: number, message = 'Bad Request') {
  return Promise.resolve({
    error: { message },
    response: new Response(null, { status }),
  })
}

/** Public test vectors only (BIP32 test vector 1, EIP-55 example). */
const XPUB =
  'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8'
const XPRV =
  'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi'
const ADDRESS = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'

function renderWithClient(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('AccountEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-06T10:00:00Z'))
    for (const fn of [...Object.values(api), navigate]) fn.mockReset()
    for (const fn of [toast.success, toast.warning, toast.error]) fn.mockReset()
    api.accountsControllerCreate.mockImplementation(
      ({ body }: { body: CreateAccountDto }) =>
        ok(account({ ...body, institution: body.institution ?? null }), 201),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a PEA with its current value and opens its page', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.accountSnapshotsControllerUpsert.mockImplementation(() =>
      ok({ id: 's1', date: '2026-11-06', valueCents: 1, note: null }),
    )
    renderWithClient(<NewAccountButton />)

    await user.click(screen.getByRole('button', { name: 'Nouveau compte' }))
    // Every account type can be created.
    const type = await screen.findByLabelText('Type')
    expect(
      Array.from(type.querySelectorAll('option')).map((o) => o.value),
    ).toEqual([
      'checking',
      'savings',
      'brokerage',
      'life_insurance',
      'employee_savings',
      'crypto',
    ])
    await user.selectOptions(type, 'brokerage')
    // The suggested name follows the type while it hasn't been typed.
    expect(screen.getByLabelText('Nom')).toHaveValue('PEA')
    await user.type(screen.getByLabelText('Établissement'), 'Courtier test')
    await user.type(screen.getByLabelText('Valeur actuelle'), '12 345,67')
    await user.type(screen.getByLabelText('Versements nets'), '10 000')
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/accounts/$accountId',
        params: { accountId: NEW_ID },
      }),
    )
    expect(api.accountsControllerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { name: 'PEA', type: 'brokerage', institution: 'Courtier test' },
      }),
    )
    expect(api.accountSnapshotsControllerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: NEW_ID, date: '2026-11-06' },
        body: {
          valueCents: 1_234_567,
          contributionsCents: 1_000_000,
          note: null,
        },
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Compte « PEA » créé')
  })

  it('creates a wallet crypto account from its public key', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithClient(<NewAccountButton />)

    await user.click(screen.getByRole('button', { name: 'Nouveau compte' }))
    await user.selectOptions(await screen.findByLabelText('Type'), 'crypto')
    // Held on an exchange or in a wallet: no bank field, no value field.
    expect(screen.queryByLabelText('Établissement')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Valeur actuelle')).not.toBeInTheDocument()

    // Where the holdings come from must be chosen first.
    const sources = screen.getByRole('radiogroup', {
      name: 'D’où viennent les avoirs ?',
    })
    expect(
      within(sources)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual([
      expect.stringMatching(/^Plateforme d’échange/),
      expect.stringMatching(/^Wallet/),
      expect.stringMatching(/^Saisie manuelle/),
    ])
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))
    expect(
      screen.getByText('Choisissez d’où viennent les avoirs'),
    ).toBeInTheDocument()

    await user.click(within(sources).getByRole('radio', { name: /^Wallet/ }))
    const wallets = screen.getByRole('radiogroup', { name: 'Wallet' })
    expect(
      within(wallets)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['Ledger', 'Trezor', 'MetaMask', 'Autre…'])
    await user.click(within(wallets).getByRole('radio', { name: 'Ledger' }))
    // The name follows the wallet until it is typed.
    expect(screen.getByLabelText('Nom')).toHaveValue('Ledger')

    // The public key is required…
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))
    expect(
      screen.getByText('Collez la clé publique du wallet'),
    ).toBeInTheDocument()
    // …and a private key is flagged as soon as it is pasted.
    const key = screen.getByLabelText('Clé publique')
    await user.click(key)
    await user.paste(XPRV)
    expect(screen.getByText(/C’est une clé privée/)).toBeInTheDocument()

    // An EVM address asks for its chains (Ethereum by default).
    await user.clear(key)
    await user.paste(ADDRESS)
    expect(screen.queryByText(/C’est une clé privée/)).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Ethereum' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'Arbitrum' }))
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(api.accountsControllerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          name: 'Ledger',
          type: 'crypto',
          institution: 'Ledger',
          cryptoSource: 'wallet',
          walletKeys: [
            {
              publicKey: ADDRESS,
              chains: ['ethereum', 'arbitrum'],
              label: null,
            },
          ],
        },
      }),
    )
    expect(api.accountSnapshotsControllerUpsert).not.toHaveBeenCalled()
  })

  it('shows a key refused by the API on the key field', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.accountsControllerCreate.mockImplementation(() =>
      failure(400, 'The key checksum is wrong: check it for a typo.'),
    )
    renderWithClient(<NewAccountButton defaultType="crypto" />)

    await user.click(screen.getByRole('button', { name: 'Nouveau compte' }))
    await user.click(await screen.findByRole('radio', { name: /^Wallet/ }))
    await user.click(screen.getByRole('radio', { name: 'Trezor' }))
    await user.click(screen.getByLabelText('Clé publique'))
    await user.paste(XPUB)
    // A Bitcoin key is read on Bitcoin only: no chain to choose.
    // An xpub asks for its address type, Native SegWit by default (#248).
    expect(
      screen.getByRole('radio', { name: /^Native SegWit \(bc1q…\)/ }),
    ).toBeChecked()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))

    // Under the key field (toasts are mocked here).
    expect(await screen.findByText(/faute de frappe/)).toBeInTheDocument()
    expect(screen.getByLabelText('Clé publique')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(api.accountsControllerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          walletKeys: [
            {
              publicKey: XPUB,
              chains: ['bitcoin'],
              label: null,
              addressType: 'native_segwit',
            },
          ],
        }) as CreateAccountDto,
      }),
    )
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/faute de frappe/),
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it('creates an exchange crypto account with its provider', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithClient(<NewAccountButton defaultType="crypto" />)

    await user.click(screen.getByRole('button', { name: 'Nouveau compte' }))
    await user.click(
      await screen.findByRole('radio', { name: /^Plateforme d’échange/ }),
    )
    const platforms = screen.getByRole('radiogroup', { name: 'Plateforme' })
    await user.click(within(platforms).getByRole('radio', { name: 'Autre…' }))
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))
    expect(screen.getByText('Indiquez son nom')).toBeInTheDocument()

    await user.type(
      screen.getByLabelText('Nom de la plateforme'),
      'Plateforme test',
    )
    expect(screen.getByLabelText('Nom')).toHaveValue('Plateforme test')
    // No key for an exchange: its holdings come from its exports.
    expect(screen.queryByLabelText('Clé publique')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))

    await waitFor(() =>
      expect(api.accountsControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            name: 'Plateforme test',
            type: 'crypto',
            institution: 'Plateforme test',
            cryptoSource: 'exchange',
            cryptoProvider: 'other',
          },
        }),
      ),
    )

    api.accountsControllerCreate.mockClear()
    await user.click(screen.getByRole('button', { name: 'Nouveau compte' }))
    await user.click(
      await screen.findByRole('radio', { name: /^Plateforme d’échange/ }),
    )
    await user.click(screen.getByRole('radio', { name: 'Binance' }))
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))
    await waitFor(() =>
      expect(api.accountsControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            institution: 'Binance',
            cryptoSource: 'exchange',
            cryptoProvider: 'binance',
          }) as CreateAccountDto,
        }),
      ),
    )
  })

  it('creates a manual crypto account, its place optional', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithClient(<NewAccountButton defaultType="crypto" />)

    await user.click(screen.getByRole('button', { name: 'Nouveau compte' }))
    await user.click(
      await screen.findByRole('radio', { name: /^Saisie manuelle/ }),
    )
    expect(screen.queryByRole('radiogroup', { name: 'Plateforme' })).toBeNull()
    expect(screen.getByLabelText('Nom')).toHaveValue('Crypto')
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))

    await waitFor(() =>
      expect(api.accountsControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            name: 'Crypto',
            type: 'crypto',
            institution: null,
            cryptoSource: 'manual',
          },
        }),
      ),
    )
  })

  it('keeps a typed name when the type changes, and validates the fields', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithClient(<NewAccountButton />)

    await user.click(screen.getByRole('button', { name: 'Nouveau compte' }))
    const name = await screen.findByLabelText('Nom')
    await user.clear(name)
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))
    expect(screen.getByText('Indiquez un nom')).toBeInTheDocument()

    await user.type(name, 'Mon assurance')
    await user.selectOptions(screen.getByLabelText('Type'), 'life_insurance')
    expect(name).toHaveValue('Mon assurance')
    await user.type(screen.getByLabelText('Valeur actuelle'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))
    expect(
      screen.getByText('Montant invalide (ex. 12 345,67)'),
    ).toBeInTheDocument()
    expect(api.accountsControllerCreate).not.toHaveBeenCalled()
  })

  it('still opens the new account when its value could not be saved', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.accountSnapshotsControllerUpsert.mockImplementation(() => failure(400))
    renderWithClient(<NewAccountButton defaultType="employee_savings" />)

    await user.click(screen.getByRole('button', { name: 'Nouveau compte' }))
    await user.type(await screen.findByLabelText('Valeur actuelle'), '500')
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining('sa valeur n’a pas pu être enregistrée'),
    )
  })

  it('renames an account and archives it after confirmation', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.accountsControllerUpdate.mockImplementation(
      ({ body }: { body: { name?: string; archived?: boolean } }) =>
        ok(
          account({
            name: body.name ?? 'Compte test',
            archivedAt: body.archived ? '2026-11-06T10:00:00.000Z' : null,
          }),
        ),
    )
    const onOpenChange = vi.fn()
    renderWithClient(
      <AccountEditor open onOpenChange={onOpenChange} account={account()} />,
    )

    expect(screen.queryByLabelText('Type')).not.toBeInTheDocument()
    const name = screen.getByLabelText('Nom')
    await user.clear(name)
    await user.type(name, 'Compte joint')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.accountsControllerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: NEW_ID },
          body: { name: 'Compte joint', institution: 'Banque test' },
        }),
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Archiver' }))
    await user.click(
      await screen.findByRole('button', { name: 'Archiver', hidden: false }),
    )
    await waitFor(() =>
      expect(api.accountsControllerUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ body: { archived: true } }),
      ),
    )
    expect(toast.success).toHaveBeenLastCalledWith(
      'Compte « Compte test » archivé',
    )
  })

  it('renames a crypto account but keeps its exchange or wallet', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.accountsControllerUpdate.mockImplementation(
      ({ body }: { body: { name?: string } }) =>
        ok(account({ type: 'crypto', name: body.name, institution: 'Ledger' })),
    )
    renderWithClient(
      <AccountEditor
        open
        onOpenChange={vi.fn()}
        account={account({
          type: 'crypto',
          name: 'Ledger',
          institution: 'Ledger',
          cryptoSource: 'wallet',
        })}
      />,
    )

    // Shown, not editable: another wallet is another account.
    expect(screen.getByText('Wallet · Ledger')).toBeInTheDocument()
    expect(
      screen.getByText('Fixée à la création.', { exact: false }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Établissement')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()

    const name = screen.getByLabelText('Nom')
    await user.clear(name)
    await user.type(name, 'Ledger perso')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(api.accountsControllerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ body: { name: 'Ledger perso' } }),
      ),
    )
  })
})
