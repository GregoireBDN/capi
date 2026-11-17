import '#/load-env'
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import * as schema from '#/database/schema'
import { CryptoPricesService } from '../crypto-prices.service'
import { CryptoService } from '../crypto.service'
import { BitcoinAddressDeriver } from './bitcoin-derivation'
import { BIP84_ZPUB } from './test-vectors'
import {
  type BitcoinAddressState,
  ChainProviderError,
  type EvmChain,
  type EvmTokenContract,
} from './chain-provider'
import { mergeLines, WalletSyncService } from './wallet-sync.service'
import { WalletTokensService } from './wallet-tokens.service'

/**
 * Wallet sync against the dedicated test database (see `vitest.config.ts`),
 * every test in a rolled-back transaction. Chain and price providers are
 * mocks; keys are public test vectors (BIP84 test mnemonic, EIP-55 example),
 * token contracts and balances are made up.
 */

type Db = PostgresJsDatabase<typeof schema>

const ROLLBACK = Symbol('rollback')
const TTL = 10 * 60_000
const NOW = new Date('2026-11-05T10:00:00Z')
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

const EVM_ADDRESS = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'
const USDC_ETHEREUM = '0x1111111111111111111111111111111111111111'
const USDC_BSC = '0x2222222222222222222222222222222222222222'

const deriver = new BitcoinAddressDeriver()
const RECEIVE = deriver.derive(BIP84_ZPUB, 0, 0, 60)
const CHANGE = deriver.derive(BIP84_ZPUB, 1, 0, 30)

/**
 * Receive branch: used at 0 (emptied), 3 and 23 (19 unused between, within
 * the gap limit), then 20 unused (24–43): the one at 44 is beyond the gap and
 * never read. Change branch: used at 0.
 */
const BITCOIN_STATES = new Map<string, BitcoinAddressState>([
  [RECEIVE[0], { balanceSats: 0n, used: true }],
  [RECEIVE[3], { balanceSats: 50_000n, used: true }],
  [RECEIVE[23], { balanceSats: 25_000n, used: true }],
  [RECEIVE[44], { balanceSats: 999_999n, used: true }],
  [CHANGE[0], { balanceSats: 10_000n, used: true }],
])

const PRICES: Record<string, string> = {
  bitcoin: '60000',
  ethereum: '2500',
  'usd-coin': '0.9',
  solana: '150',
  binancecoin: '500',
}

describe.skipIf(!process.env.DATABASE_URL)(
  'WalletSyncService (database)',
  () => {
    let client: postgres.Sql
    let db: Db

    beforeAll(() => {
      client = postgres(process.env.DATABASE_URL!, { max: 1 })
      db = drizzle(client, { schema })
    })

    afterAll(async () => {
      await client.end()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    function providers() {
      const asked: string[] = []
      const bitcoin = {
        addressStates: vi.fn((addresses: readonly string[]) => {
          asked.push(...addresses)
          return Promise.resolve(
            addresses.map(
              (address) =>
                BITCOIN_STATES.get(address) ?? { balanceSats: 0n, used: false },
            ),
          )
        }),
      }
      const evm = {
        chains: ['ethereum', 'bsc'] as EvmChain[],
        balances: vi.fn(
          (
            chain: EvmChain,
            _address: string,
            tokens: readonly EvmTokenContract[],
          ) =>
            Promise.resolve({
              native: chain === 'ethereum' ? 1_500_000_000_000_000_000n : 0n,
              tokens: tokens.map((token) =>
                token.address === USDC_ETHEREUM ? 1_234_567_890n : 0n,
              ),
            }),
        ),
      }
      const tokens = {
        tokenDeployments: vi.fn((assetId: string) =>
          Promise.resolve(
            assetId === 'usd-coin'
              ? {
                  ethereum: { address: USDC_ETHEREUM, decimals: 6 },
                  bsc: { address: USDC_BSC, decimals: 18 },
                }
              : {},
          ),
        ),
      }
      return { asked, bitcoin, evm, tokens }
    }

    interface Fixture {
      tx: Db
      crypto: CryptoService
      walletSync: WalletSyncService
      tokens: WalletTokensService
      mocks: ReturnType<typeof providers>
      wallet: () => Promise<string>
    }

    async function inRollback(
      fn: (f: Fixture) => Promise<void>,
      { enabled = true }: { enabled?: boolean } = {},
    ) {
      await db
        .transaction(async (tx) => {
          const database = { db: tx } as never
          const accounts = new AccountsService(database)
          const prices = new CryptoPricesService(database, {
            provider: {
              fetchEurPrices: (ids: readonly string[]) =>
                Promise.resolve(
                  new Map(
                    ids
                      .filter((id) => id in PRICES)
                      .map((id) => [id, PRICES[id]] as const),
                  ),
                ),
              searchAssets: () => Promise.resolve([]),
            },
            ttlMs: TTL,
          })
          const mocks = providers()
          const walletSync = new WalletSyncService(database, {
            bitcoin: enabled ? mocks.bitcoin : null,
            evm: enabled ? mocks.evm : null,
            tokens: enabled ? mocks.tokens : null,
            intervalMs: TTL,
          })
          const crypto = new CryptoService(
            database,
            accounts,
            prices,
            walletSync,
          )
          const tokens = new WalletTokensService(database, accounts, walletSync)
          const wallet = async () =>
            (
              await accounts.create({
                name: 'Ledger',
                type: 'crypto',
                cryptoSource: 'wallet',
                walletKeys: [
                  { publicKey: BIP84_ZPUB },
                  {
                    publicKey: EVM_ADDRESS,
                    chains: ['ethereum', 'bsc', 'base'],
                  },
                ],
              })
            ).id
          await fn({
            tx: tx as unknown as Db,
            crypto,
            walletSync,
            tokens,
            mocks,
            wallet,
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    const lines = (
      holdings: {
        symbol: string
        location: string
        quantity: string
        origin: string
      }[],
    ) =>
      holdings
        .map((h) => `${h.origin} ${h.symbol} ${h.location} ${h.quantity}`)
        .sort()

    it('reads receive and change addresses up to the gap limit, native coins and tokens', async () => {
      await inRollback(async ({ crypto, tokens, mocks, wallet, tx }) => {
        const id = await wallet()
        await tokens.add(id, {
          assetId: 'usd-coin',
          symbol: 'USDC',
          name: 'USDC',
        })
        await crypto.create(
          id,
          {
            assetId: 'solana',
            symbol: 'SOL',
            name: 'Solana',
            quantity: '2',
            location: 'Phantom',
          },
          NOW,
        )

        const result = await crypto.sync(id, NOW)

        // Receive 0–43 (20 unused after the one at 23), change 0–20.
        expect(mocks.asked).toEqual([
          ...RECEIVE.slice(0, 44),
          ...CHANGE.slice(0, 21),
        ])
        expect(mocks.asked).not.toContain(RECEIVE[44])
        // Base has no endpoint configured: skipped.
        expect(mocks.evm.balances.mock.calls.map((call) => call[0])).toEqual([
          'ethereum',
          'bsc',
        ])
        expect(lines(result.holdings)).toEqual([
          'manual SOL Phantom 2',
          'sync BTC Bitcoin 0.00085',
          'sync ETH Ethereum 1.5',
          'sync USDC Ethereum 1234.56789',
        ])
        expect(result.sync).toEqual({
          enabled: true,
          syncedAt: NOW.toISOString(),
          failedAt: null,
          failedChains: [],
          retryAt: null,
        })
        // 0.00085 × 60 000 + 1.5 × 2 500 + 1 234.56789 × 0.9 + 2 × 150 €
        expect(result.snapshot).toMatchObject({
          valueCents: 5_100 + 375_000 + 111_111 + 30_000,
        })
        const [account] = await tx
          .select()
          .from(schema.accountsTable)
          .where(eq(schema.accountsTable.id, id))
        expect(account.cryptoSyncedAt).toEqual(NOW)
        expect(account.cryptoSyncFailedAt).toBeNull()
      })
    })

    it('replaces the synced lines on the next sync and never touches manual ones', async () => {
      await inRollback(async ({ crypto, mocks, wallet }) => {
        const id = await wallet()
        await crypto.create(
          id,
          {
            assetId: 'ethereum',
            symbol: 'ETH',
            name: 'Ethereum',
            quantity: '3',
            location: 'Ethereum',
          },
          NOW,
        )
        await crypto.sync(id, NOW)
        mocks.bitcoin.addressStates.mockImplementation((addresses) =>
          Promise.resolve(
            addresses.map(() => ({ balanceSats: 0n, used: false })),
          ),
        )
        mocks.evm.balances.mockImplementation((chain, _address, tokens) =>
          Promise.resolve({
            native: chain === 'bsc' ? 2_000_000_000_000_000_000n : 0n,
            tokens: tokens.map(() => 0n),
          }),
        )
        const result = await crypto.sync(id, later(1))
        expect(lines(result.holdings)).toEqual([
          'manual ETH Ethereum 3',
          'sync BNB BNB Chain 2',
        ])
      })
    })

    it('keeps the last synced holdings, flagged stale, when every chain fails', async () => {
      await inRollback(async ({ crypto, mocks, wallet }) => {
        const id = await wallet()
        const first = await crypto.sync(id, NOW)
        mocks.bitcoin.addressStates.mockRejectedValue(
          new ChainProviderError('network'),
        )
        mocks.evm.balances.mockRejectedValue(new ChainProviderError('timeout'))

        const result = await crypto.sync(id, later(1))
        expect(lines(result.holdings)).toEqual(lines(first.holdings))
        expect(result.sync).toEqual({
          enabled: true,
          syncedAt: NOW.toISOString(),
          failedAt: later(1).toISOString(),
          failedChains: [
            { chain: 'bitcoin', reason: 'network', retryAt: null },
            { chain: 'ethereum', reason: 'timeout', retryAt: null },
            { chain: 'bsc', reason: 'timeout', retryAt: null },
          ],
          retryAt: null,
        })

        mocks.evm.balances.mockRejectedValue(new TypeError('boom'))
        await expect(crypto.sync(id, later(2))).resolves.toMatchObject({
          sync: { failedAt: later(2).toISOString() },
        })

        mocks.bitcoin.addressStates.mockImplementation((addresses) =>
          Promise.resolve(
            addresses.map(() => ({ balanceSats: 0n, used: false })),
          ),
        )
        mocks.evm.balances.mockResolvedValue({ native: 0n, tokens: [] })
        const recovered = await crypto.sync(id, later(3))
        expect(recovered.sync).toMatchObject({
          syncedAt: later(3).toISOString(),
          failedAt: null,
          failedChains: [],
        })
      })
    })

    it('keeps the chains read when another one fails', async () => {
      await inRollback(async ({ crypto, mocks, wallet, tx }) => {
        const id = await wallet()
        const first = await crypto.sync(id, NOW)
        expect(lines(first.holdings)).toEqual([
          'sync BTC Bitcoin 0.00085',
          'sync ETH Ethereum 1.5',
        ])
        // Bitcoin emptied, Ethereum doubled, BNB Chain times out.
        mocks.bitcoin.addressStates.mockImplementation((addresses) =>
          Promise.resolve(
            addresses.map(() => ({ balanceSats: 0n, used: false })),
          ),
        )
        mocks.evm.balances.mockImplementation((chain, _address, tokens) =>
          chain === 'bsc'
            ? Promise.reject(new ChainProviderError('timeout'))
            : Promise.resolve({
                native: 3_000_000_000_000_000_000n,
                tokens: tokens.map(() => 0n),
              }),
        )
        await tx.insert(schema.cryptoHoldingsTable).values({
          accountId: id,
          assetId: 'binancecoin',
          symbol: 'BNB',
          name: 'BNB',
          quantity: '4',
          location: 'BNB Chain',
          origin: 'sync',
        })

        const result = await crypto.sync(id, later(1))
        expect(lines(result.holdings)).toEqual([
          'sync BNB BNB Chain 4',
          'sync ETH Ethereum 3',
        ])
        expect(result.sync).toEqual({
          enabled: true,
          syncedAt: later(1).toISOString(),
          failedAt: later(1).toISOString(),
          failedChains: [{ chain: 'bsc', reason: 'timeout', retryAt: null }],
          retryAt: null,
        })
      })
    })

    it('backs off a rate-limited chain, honouring Retry-After, whoever asks', async () => {
      await inRollback(async ({ crypto, mocks, wallet }) => {
        const id = await wallet()
        await crypto.sync(id, NOW)
        const bitcoinCalls = () => mocks.bitcoin.addressStates.mock.calls.length
        const evmCalls = () => mocks.evm.balances.mock.calls.length
        mocks.bitcoin.addressStates.mockRejectedValue(
          new ChainProviderError('rate_limited', 429, 30 * 60_000),
        )

        const limited = await crypto.sync(id, later(1))
        const retryAt = later(31).toISOString()
        expect(lines(limited.holdings)).toEqual([
          'sync BTC Bitcoin 0.00085',
          'sync ETH Ethereum 1.5',
        ])
        expect(limited.sync).toMatchObject({
          syncedAt: later(1).toISOString(),
          failedAt: later(1).toISOString(),
          failedChains: [{ chain: 'bitcoin', reason: 'rate_limited', retryAt }],
          retryAt,
        })

        // During the backoff, neither "Synchroniser" nor page loads (once
        // the wallet is due again) ask the rate-limited endpoint.
        const before = bitcoinCalls()
        const evmBefore = evmCalls()
        await crypto.sync(id, later(2))
        await crypto.summary(later(13))
        expect(bitcoinCalls()).toBe(before)
        expect(evmCalls()).toBe(evmBefore + 4)
        const waiting = await crypto.holdings(id, later(13))
        expect(waiting.sync).toMatchObject({
          failedChains: [{ chain: 'bitcoin', reason: 'rate_limited', retryAt }],
          retryAt,
        })

        // After it, the chain is read again and the backoff ends.
        mocks.bitcoin.addressStates.mockImplementation((addresses) =>
          Promise.resolve(
            addresses.map(
              (address) =>
                BITCOIN_STATES.get(address) ?? { balanceSats: 0n, used: false },
            ),
          ),
        )
        const recovered = await crypto.sync(id, later(31))
        expect(bitcoinCalls()).toBeGreaterThan(before)
        expect(recovered.sync).toMatchObject({
          failedAt: null,
          failedChains: [],
          retryAt: null,
        })
      })
    })

    it('doubles the backoff on rate limits in a row, capped, and resets it after a read', async () => {
      await inRollback(async ({ crypto, mocks, wallet }) => {
        const id = await wallet()
        mocks.evm.balances.mockRejectedValue(
          new ChainProviderError('rate_limited', 429),
        )
        const first = await crypto.sync(id, NOW)
        // No Retry-After: one minute, per chain endpoint.
        expect(first.sync?.failedChains).toEqual([
          {
            chain: 'ethereum',
            reason: 'rate_limited',
            retryAt: later(1).toISOString(),
          },
          {
            chain: 'bsc',
            reason: 'rate_limited',
            retryAt: later(1).toISOString(),
          },
        ])
        const second = await crypto.sync(id, later(1))
        expect(second.sync?.retryAt).toBe(later(3).toISOString())
        // A Retry-After beyond the cap waits one hour at most.
        mocks.evm.balances.mockRejectedValue(
          new ChainProviderError('rate_limited', 429, 60 * 60_000),
        )
        const third = await crypto.sync(id, later(3))
        expect(third.sync?.retryAt).toBe(later(63).toISOString())

        mocks.evm.balances.mockResolvedValue({ native: 0n, tokens: [] })
        await crypto.sync(id, later(63))
        mocks.evm.balances.mockRejectedValue(
          new ChainProviderError('rate_limited', 429),
        )
        const again = await crypto.sync(id, later(64))
        expect(again.sync?.retryAt).toBe(later(65).toISOString())
      })
    })

    it('never logs keys, addresses or quantities', async () => {
      const logged: unknown[] = []
      for (const level of ['log', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(Logger.prototype, level).mockImplementation(
          (...args: unknown[]) => {
            logged.push(...args)
          },
        )
      }
      await inRollback(async ({ crypto, mocks, wallet }) => {
        const id = await wallet()
        await crypto.sync(id, NOW)
        mocks.bitcoin.addressStates.mockRejectedValue(
          new ChainProviderError('rate_limited', 429),
        )
        await crypto.sync(id, later(1))
      })
      const text = JSON.stringify(logged)
      expect(text).toContain(
        'Wallet sync failed on bitcoin (rate_limited), next attempt in 60 s',
      )
      for (const secret of [
        BIP84_ZPUB,
        EVM_ADDRESS,
        RECEIVE[3],
        CHANGE[0],
        '0.00085',
        '1.5',
      ]) {
        expect(text).not.toContain(secret)
      }
    })

    it('syncs before a valuation at most once per interval, and on demand at most every 30 s', async () => {
      await inRollback(async ({ crypto, mocks, wallet }) => {
        const id = await wallet()
        const calls = () => mocks.evm.balances.mock.calls.length
        await crypto.holdings(id, NOW)
        expect(calls()).toBe(2)
        await crypto.holdings(id, later(5))
        await crypto.summary(later(5))
        expect(calls()).toBe(2)
        await crypto.sync(id, new Date(later(5).getTime() + 10_000))
        expect(calls()).toBe(4)
        await crypto.sync(id, new Date(later(5).getTime() + 20_000))
        expect(calls()).toBe(4)
        await crypto.summary(later(16))
        expect(calls()).toBe(6)
      })
    })

    it('sends nothing and refuses "Synchroniser" when the sync is disabled', async () => {
      await inRollback(
        async ({ crypto, mocks, wallet, tokens }) => {
          const id = await wallet()
          await expect(crypto.sync(id, NOW)).rejects.toBeInstanceOf(
            BadRequestException,
          )
          const holdings = await crypto.holdings(id, NOW)
          expect(holdings.sync).toEqual({
            enabled: false,
            syncedAt: null,
            failedAt: null,
            failedChains: [],
            retryAt: null,
          })
          await tokens.add(id, {
            assetId: 'usd-coin',
            symbol: 'USDC',
            name: 'USDC',
          })
          expect(mocks.bitcoin.addressStates).not.toHaveBeenCalled()
          expect(mocks.evm.balances).not.toHaveBeenCalled()
          expect(mocks.tokens.tokenDeployments).not.toHaveBeenCalled()
        },
        { enabled: false },
      )
    })

    it('refuses to sync other accounts', async () => {
      await inRollback(async ({ crypto, tx }) => {
        const [manual] = await tx
          .insert(schema.accountsTable)
          .values({ name: 'Manual', type: 'crypto', cryptoSource: 'manual' })
          .returning()
        await expect(crypto.sync(manual.id, NOW)).rejects.toThrow(
          'Only wallet accounts are synced',
        )
        const holdings = await crypto.holdings(manual.id, NOW)
        expect(holdings.sync).toBeNull()
      })
    })

    it('manages the tokens a wallet reads', async () => {
      await inRollback(async ({ tokens, mocks, wallet, tx }) => {
        const id = await wallet()
        await expect(
          tokens.add(id, {
            assetId: 'ethereum',
            symbol: 'ETH',
            name: 'Ethereum',
          }),
        ).rejects.toThrow('Native coins')
        await expect(
          tokens.add(id, {
            assetId: 'cardano',
            symbol: 'ADA',
            name: 'Cardano',
          }),
        ).rejects.toThrow('not a token of a supported EVM chain')
        const usdc = await tokens.add(id, {
          assetId: 'usd-coin',
          symbol: 'USDC',
          name: 'USDC',
        })
        await expect(
          tokens.add(id, { assetId: 'usd-coin', symbol: 'USDC', name: 'USDC' }),
        ).rejects.toBeInstanceOf(ConflictException)
        // A failed lookup does not block adding: the sync resolves it later.
        mocks.tokens.tokenDeployments.mockRejectedValueOnce(new Error('down'))
        await tokens.add(id, {
          assetId: 'tether',
          symbol: 'USDT',
          name: 'Tether',
        })
        expect((await tokens.list(id)).map((t) => t.symbol)).toEqual([
          'USDC',
          'USDT',
        ])
        await tokens.remove(id, usdc.id)
        await expect(tokens.remove(id, usdc.id)).rejects.toBeInstanceOf(
          NotFoundException,
        )
        expect(
          await tx
            .select()
            .from(schema.cryptoWalletTokensTable)
            .where(
              and(
                eq(schema.cryptoWalletTokensTable.accountId, id),
                eq(schema.cryptoWalletTokensTable.assetId, 'usd-coin'),
              ),
            ),
        ).toEqual([])
      })
    })
  },
)

describe('mergeLines', () => {
  const asset = { id: 'token', symbol: 'TKN', name: 'Token' }

  it('sums keys per asset and chain and keeps exact decimals', () => {
    expect(
      mergeLines([
        { asset, chain: 'ethereum', units: 1n, decimals: 6 },
        { asset, chain: 'ethereum', units: 2n, decimals: 6 },
        { asset, chain: 'base', units: 5n, decimals: 6 },
      ]),
    ).toEqual([
      { asset, chain: 'ethereum', quantity: '0.000003' },
      { asset, chain: 'base', quantity: '0.000005' },
    ])
  })

  it('rounds beyond 18 decimals half to even and drops empty or absurd balances', () => {
    expect(
      mergeLines([
        { asset, chain: 'ethereum', units: 15n, decimals: 19 },
        { asset, chain: 'base', units: 25n, decimals: 19 },
        { asset, chain: 'bsc', units: 4n, decimals: 19 },
        { asset, chain: 'polygon', units: 10n ** 40n, decimals: 18 },
        { asset, chain: 'arbitrum', units: 0n, decimals: 18 },
      ]).map((line) => [line.chain, line.quantity]),
    ).toEqual([
      ['ethereum', '0.000000000000000002'],
      ['base', '0.000000000000000002'],
    ])
  })
})
