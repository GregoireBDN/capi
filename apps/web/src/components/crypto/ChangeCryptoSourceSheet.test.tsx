import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountDto,
  AccountHoldingsDto,
  ValuedHoldingDto,
} from '#/api/types.gen'
import { guessCryptoSource } from './ChangeCryptoSourceSheet'
import { CryptoSourceCard } from './CryptoSourceCard'

const api = vi.hoisted(() => ({
  accountsControllerChangeCryptoSource: vi.fn(),
  accountsControllerUpdate: vi.fn(),
  accountHoldingsControllerList: vi.fn(),
  cryptoControllerSettings: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
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

/** Public test vectors only (BIP32 test vector 1, EIP-55 example). */
const XPUB =
  'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8'
const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

/** Synthetic data only. */
const ACCOUNT_ID = 'c0000000-0000-4000-8000-000000000001'

function account(overrides: Partial<AccountDto> = {}): AccountDto {
  return {
    id: ACCOUNT_ID,
    name: 'Ledger test',
    type: 'crypto',
    institution: 'Ledger',
    position: 0,
    archivedAt: null,
    balanceCents: 0,
    balanceDate: '2026-11-10',
    cryptoSource: 'manual',
    cryptoProvider: null,
    cryptoSyncedAt: null,
    investedBaseCents: null,
    investedBaseOn: null,
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T10:00:00.000Z',
    ...overrides,
  }
}

function holdings(list: Partial<ValuedHoldingDto>[] = []): AccountHoldingsDto {
  return {
    accountId: ACCOUNT_ID,
    holdings: list as ValuedHoldingDto[],
    totals: {
      valueCents: 0,
      investedCents: null,
      gainCents: null,
      missingPriceCount: 0,
      staleCount: 0,
      withoutInvestedCount: 0,
      unknown: [],
      fiatCents: 0,
    },
    complete: true,
    snapshot: null,
    priceApiEnabled: true,
    refreshFailed: false,
    refreshDue: false,
    sync: null,
    costs: [],
    realised: { yearCents: 0, totalCents: 0, count: 0, unknownCount: 0 },
  }
}

function ok<T>(data: T, status = 200) {
  return Promise.resolve({ data, response: new Response(null, { status }) })
}

function failure(status: number, message: string) {
  return Promise.resolve({
    error: { message },
    response: new Response(null, { status }),
  })
}

function renderCard(value: AccountDto = account()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <CryptoSourceCard account={value} writable />
    </QueryClientProvider>,
  )
}

describe('guessCryptoSource', () => {
  it('recognizes a wallet or an exchange from the institution', () => {
    expect(guessCryptoSource('Ledger')).toMatchObject({
      cryptoKind: 'wallet',
      provider: 'Ledger',
    })
    expect(guessCryptoSource(' binance ')).toMatchObject({
      cryptoKind: 'exchange',
      provider: 'Binance',
    })
    expect(guessCryptoSource('Coffre test').cryptoKind).toBe('')
    expect(guessCryptoSource(null).cryptoKind).toBe('')
  })
})

describe('ChangeCryptoSourceSheet', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset()
    toast.success.mockReset()
    toast.error.mockReset()
    api.accountHoldingsControllerList.mockImplementation(() => ok(holdings()))
    api.cryptoControllerSettings.mockImplementation(() =>
      ok({ priceApiEnabled: true, walletSyncEnabled: true }),
    )
    api.accountsControllerChangeCryptoSource.mockImplementation(
      ({ body }: { body: Partial<AccountDto> }) =>
        ok(account({ ...body, cryptoSource: body.cryptoSource })),
    )
    api.accountsControllerUpdate.mockImplementation(
      ({ body }: { body: Partial<AccountDto> }) =>
        ok(account({ ...body, cryptoSource: 'exchange' })),
    )
  })

  it('turns a manual Ledger account into a wallet read from its keys', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(
      screen.getByRole('button', {
        name: 'Relier à un wallet ou une plateforme',
      }),
    )
    const sheet = within(await screen.findByRole('dialog'))
    // Guessed from the institution; no "Saisie manuelle" to go back to.
    expect(sheet.getByRole('radio', { name: /^Wallet/ })).toBeChecked()
    expect(sheet.getByRole('radio', { name: 'Ledger' })).toBeChecked()
    expect(
      sheet.queryByRole('radio', { name: /^Saisie manuelle/ }),
    ).not.toBeInTheDocument()

    await user.click(sheet.getByLabelText('Clé publique'))
    await user.paste(XPUB)
    await user.click(
      sheet.getByRole('button', { name: 'Ajouter une autre clé' }),
    )
    await user.click(sheet.getByLabelText('Clé publique 2'))
    await user.paste(ADDRESS)
    await user.click(sheet.getByRole('button', { name: 'Relier au wallet' }))

    await waitFor(() =>
      expect(api.accountsControllerChangeCryptoSource).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID },
          body: {
            cryptoSource: 'wallet',
            walletKeys: [
              {
                publicKey: XPUB,
                chains: ['bitcoin'],
                label: null,
                addressType: 'native_segwit',
              },
              { publicKey: ADDRESS, chains: ['ethereum'], label: null },
            ],
          },
        }),
      ),
    )
    // Same wallet name: the institution is left as it is.
    expect(api.accountsControllerUpdate).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Compte relié au wallet : ses avoirs seront lus avec ses clés',
      ),
    )
  })

  it('turns it into an exchange and names the account after it', async () => {
    const user = userEvent.setup()
    renderCard(account({ institution: 'Coffre test' }))
    await user.click(
      screen.getByRole('button', {
        name: 'Relier à un wallet ou une plateforme',
      }),
    )
    const sheet = within(await screen.findByRole('dialog'))
    await user.click(sheet.getByRole('radio', { name: /^Plateforme/ }))
    await user.click(sheet.getByRole('radio', { name: 'Coinbase' }))
    await user.click(
      sheet.getByRole('button', { name: 'Relier à la plateforme' }),
    )
    await waitFor(() =>
      expect(api.accountsControllerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID },
          body: { institution: 'Coinbase' },
        }),
      ),
    )
    expect(api.accountsControllerChangeCryptoSource).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { cryptoSource: 'exchange', cryptoProvider: 'coinbase' },
      }),
    )
  })

  it('asks to remove the holdings typed by hand first', async () => {
    const user = userEvent.setup()
    api.accountHoldingsControllerList.mockImplementation(() =>
      ok(holdings([{ id: 'h1', symbol: 'BTC', origin: 'manual' }])),
    )
    renderCard()
    await user.click(
      screen.getByRole('button', {
        name: 'Relier à un wallet ou une plateforme',
      }),
    )
    const sheet = within(await screen.findByRole('dialog'))
    expect(
      await sheet.findByText('Ce compte a des avoirs saisis à la main'),
    ).toBeInTheDocument()
    expect(
      sheet.getByRole('button', { name: 'Relier au wallet' }),
    ).toBeDisabled()
  })

  it('explains a refusal of the API in French', async () => {
    const user = userEvent.setup()
    api.accountsControllerChangeCryptoSource.mockImplementation(() =>
      failure(409, 'This public key is already tracked by an account'),
    )
    renderCard()
    await user.click(
      screen.getByRole('button', {
        name: 'Relier à un wallet ou une plateforme',
      }),
    )
    const sheet = within(await screen.findByRole('dialog'))
    await user.click(sheet.getByLabelText('Clé publique'))
    await user.paste(XPUB)
    await user.click(sheet.getByRole('button', { name: 'Relier au wallet' }))
    // Under the key field, and as a toast.
    expect(
      await sheet.findByText('Cette clé est déjà suivie par un compte.'),
    ).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(
      'Cette clé est déjà suivie par un compte.',
    )
  })
})
