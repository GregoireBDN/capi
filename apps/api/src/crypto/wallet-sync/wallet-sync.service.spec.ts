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
import { BIP44_XPUB, BIP84_AS_XPUB, BIP84_ZPUB } from './test-vectors'
import {
  type BitcoinAddressState,
  type BitcoinChainProvider,
  ChainProviderError,
  type EvmChain,
  type EvmTokenContract,
} from './chain-provider'
import { EsploraProvider } from './esplora.provider'
import { toChecksumAddress } from '../wallet-keys/public-key'
import { WalletKeysService } from '../wallet-keys/wallet-keys.service'
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
/** A made-up token contract, EIP-55 checksummed by the API when added. */
const CONTRACT_TOKEN = toChecksumAddress(`0x${'ab12'.repeat(10)}`)
/** The same address with one letter's case flipped: a typo. */
const BAD_CHECKSUM = CONTRACT_TOKEN.replace(/(?<=^0x[0-9]*)[a-fA-F]/, (c) =>
  c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase(),
)

const deriver = new BitcoinAddressDeriver()
const RECEIVE = deriver.derive(BIP84_ZPUB, 'native_segwit', 0, 0, 60)
const CHANGE = deriver.derive(BIP84_ZPUB, 'native_segwit', 1, 0, 30)
/** First BIP49 receive address of the test mnemonic, read as a single address. */
const SINGLE_ADDRESS = '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf'

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
  [SINGLE_ADDRESS, { balanceSats: 7_000n, used: true }],
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
        tokenInfo: vi.fn((_chain: EvmChain, contract: string) =>
          Promise.resolve(
            contract.toLowerCase() === CONTRACT_TOKEN.toLowerCase()
              ? { symbol: 'TKN', name: 'Test Token', decimals: 8 }
              : null,
          ),
        ),
        balances: vi.fn(
          (
            chain: EvmChain,
            _address: string,
            tokens: readonly EvmTokenContract[],
          ) =>
            Promise.resolve({
              native: chain === 'ethereum' ? 1_500_000_000_000_000_000n : 0n,
              tokens: tokens.map((token) =>
                token.address === USDC_ETHEREUM
                  ? 1_234_567_890n
                  : token.address === CONTRACT_TOKEN
                    ? 250_000_000n
                    : 0n,
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

    /**
     * A real `EsploraProvider` over a mocked `fetch` (never the network):
     * answers from `BITCOIN_STATES`, or with `respond`'s response when it
     * gives one (e.g. a 429 after N requests).
     */
    function esplora(
      respond: (request: number) => Response | null = () => null,
    ) {
      const asked: string[] = []
      let requests = 0
      const fetchFn = vi.fn((url: URL) => {
        requests++
        const special = respond(requests)
        if (special) return Promise.resolve(special)
        const address = decodeURIComponent(url.pathname.split('/').pop()!)
        asked.push(address)
        const state = BITCOIN_STATES.get(address)
        const stats = (sats: bigint, txs: number) => ({
          funded_txo_sum: Number(sats),
          spent_txo_sum: 0,
          tx_count: txs,
        })
        return Promise.resolve(
          new Response(
            JSON.stringify({
              chain_stats: stats(state?.balanceSats ?? 0n, state?.used ? 1 : 0),
              mempool_stats: stats(0n, 0),
            }),
          ),
        )
      })
      const provider = new EsploraProvider({
        baseUrl: 'https://esplora.test/api',
        timeoutMs: 1000,
        concurrency: 1,
        minIntervalMs: 0,
        fetch: fetchFn as unknown as typeof fetch,
      })
      return { provider, asked, requests: () => requests }
    }

    const rateLimited = (retryAfter: string) =>
      new Response('', { status: 429, headers: { 'Retry-After': retryAfter } })

    interface Fixture {
      tx: Db
      accounts: AccountsService
      crypto: CryptoService
      walletSync: WalletSyncService
      tokens: WalletTokensService
      keys: WalletKeysService
      mocks: ReturnType<typeof providers>
      /** Inline waits asked by the sync (ms); resolved at once. */
      sleeps: number[]
      /** Asset ids sent to the price API. */
      priceAsks: string[]
      wallet: () => Promise<string>
    }

    async function inRollback(
      fn: (f: Fixture) => Promise<void>,
      {
        enabled = true,
        bitcoin,
        backgroundWaitMs,
      }: {
        enabled?: boolean
        bitcoin?: BitcoinChainProvider
        backgroundWaitMs?: number
      } = {},
    ) {
      await db
        .transaction(async (tx) => {
          const database = { db: tx } as never
          const accounts = new AccountsService(database)
          const priceAsks: string[] = []
          const prices = new CryptoPricesService(database, {
            provider: {
              fetchEurPrices: (ids: readonly string[]) => {
                priceAsks.push(...ids)
                return Promise.resolve(
                  new Map(
                    ids
                      .filter((id) => id in PRICES)
                      .map((id) => [id, PRICES[id]] as const),
                  ),
                )
              },
              searchAssets: () => Promise.resolve([]),
            },
            ttlMs: TTL,
          })
          const mocks = providers()
          const sleeps: number[] = []
          const walletSync = new WalletSyncService(database, {
            bitcoin: enabled ? (bitcoin ?? mocks.bitcoin) : null,
            evm: enabled ? mocks.evm : null,
            tokens: enabled ? mocks.tokens : null,
            intervalMs: TTL,
            backgroundWaitMs,
            sleep: (ms) => {
              sleeps.push(ms)
              return Promise.resolve()
            },
          })
          const crypto = new CryptoService(
            database,
            accounts,
            prices,
            walletSync,
          )
          const tokens = new WalletTokensService(database, accounts, walletSync)
          const keys = new WalletKeysService(database, accounts, walletSync)
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
            accounts,
            crypto,
            walletSync,
            tokens,
            keys,
            mocks,
            sleeps,
            priceAsks,
            wallet,
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    /** A line typed by hand on a wallet before #269 refused new ones. */
    async function manualLine(
      tx: Db,
      accountId: string,
      line: {
        assetId: string
        symbol: string
        name: string
        quantity: string
        location: string
      },
    ) {
      const [row] = await tx
        .insert(schema.cryptoHoldingsTable)
        .values({ accountId, ...line, origin: 'manual' })
        .returning()
      return row
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
        // A line typed by hand before #269 stays listed.
        await manualLine(tx, id, {
          assetId: 'solana',
          symbol: 'SOL',
          name: 'Solana',
          quantity: '2',
          location: 'Phantom',
        })

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
          syncing: false,
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

    it('reads single addresses as they are and detects the type of a Ledger xpub (#248)', async () => {
      await inRollback(async ({ accounts, crypto, mocks, tx }) => {
        const { id } = await accounts.create({
          name: 'Ledger',
          type: 'crypto',
          cryptoSource: 'wallet',
          walletKeys: [
            // Native SegWit account exported as xpub: type to detect.
            { publicKey: BIP84_AS_XPUB, addressType: 'detect' },
            // Never used in any type: stays to detect.
            { publicKey: BIP44_XPUB, addressType: 'detect' },
            { publicKey: SINGLE_ADDRESS },
          ],
        })

        const result = await crypto.sync(id, NOW)

        // 85 000 sats on the derived bc1q… addresses + 7 000 on the address.
        expect(lines(result.holdings)).toEqual(['sync BTC Bitcoin 0.00092'])
        // Detection asks the first receive address of each type once; only
        // the type found is scanned further.
        const firstOf = (type: 'legacy' | 'nested_segwit') =>
          deriver.derive(BIP84_AS_XPUB, type, 0, 0, 1)[0]
        for (const address of [firstOf('legacy'), firstOf('nested_segwit')]) {
          expect(mocks.asked.filter((a) => a === address)).toHaveLength(1)
        }
        expect(mocks.asked).toContain(RECEIVE[0])
        expect(mocks.asked).toContain(CHANGE[20])
        expect(mocks.asked).toContain(SINGLE_ADDRESS)

        const keys = await tx
          .select()
          .from(schema.cryptoWalletKeysTable)
          .where(eq(schema.cryptoWalletKeysTable.accountId, id))
        const byKey = new Map(keys.map((key) => [key.publicKey, key]))
        expect(byKey.get(BIP84_AS_XPUB)).toMatchObject({
          addressTypes: ['native_segwit'],
          detectAddressTypes: false,
        })
        expect(byKey.get(BIP44_XPUB)).toMatchObject({
          addressTypes: null,
          detectAddressTypes: true,
        })
        expect(byKey.get(SINGLE_ADDRESS)).toMatchObject({
          addressTypes: ['nested_segwit'],
        })
      })
    })

    it('replaces the synced lines on the next sync and never touches manual ones', async () => {
      await inRollback(async ({ crypto, mocks, wallet, tx }) => {
        const id = await wallet()
        await manualLine(tx, id, {
          assetId: 'ethereum',
          symbol: 'ETH',
          name: 'Ethereum',
          quantity: '3',
          location: 'Ethereum',
        })
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
          syncing: false,
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
          syncing: false,
        })
      })
    })

    /** The wallet's observed movements, oldest first (#373). */
    async function observed(tx: Db, accountId: string) {
      const rows = await tx
        .select()
        .from(schema.cryptoMovementsTable)
        .where(eq(schema.cryptoMovementsTable.accountId, accountId))
        .orderBy(
          schema.cryptoMovementsTable.occurredAt,
          schema.cryptoMovementsTable.asset,
        )
      return rows.map(
        (row) =>
          `${row.kind} ${row.asset} ${row.quantity.replace(/\.?0+$/, '')} ${row.observedSince?.toISOString() ?? 'opening'}`,
      )
    }

    it('records what each complete read finds risen or fallen, nothing when unchanged (#373)', async () => {
      await inRollback(async ({ crypto, mocks, wallet, tx }) => {
        const id = await wallet()
        await crypto.sync(id, NOW)
        // The first read is the opening position.
        expect(await observed(tx, id)).toEqual([
          'observed_in BTC 0.00085 opening',
          'observed_in ETH 1.5 opening',
        ])
        await crypto.sync(id, later(1))
        expect(await observed(tx, id)).toHaveLength(2)
        // Bitcoin emptied, Ethereum doubled: dated after the last read.
        mocks.bitcoin.addressStates.mockImplementation((addresses) =>
          Promise.resolve(
            addresses.map(() => ({ balanceSats: 0n, used: false })),
          ),
        )
        mocks.evm.balances.mockImplementation((chain, _address, tokens) =>
          Promise.resolve({
            native: chain === 'ethereum' ? 3_000_000_000_000_000_000n : 0n,
            tokens: tokens.map(() => 0n),
          }),
        )
        await crypto.sync(id, later(2))
        expect((await observed(tx, id)).slice(2)).toEqual([
          `observed_out BTC -0.00085 ${later(1).toISOString()}`,
          `observed_in ETH 1.5 ${later(1).toISOString()}`,
        ])
        const [account] = await tx
          .select()
          .from(schema.accountsTable)
          .where(eq(schema.accountsTable.id, id))
        expect(account.cryptoObservedAt).toEqual(later(2))
      })
    })

    it('records no movement on a failed or partial read (#373)', async () => {
      await inRollback(async ({ crypto, mocks, wallet, tx }) => {
        const id = await wallet()
        await crypto.sync(id, NOW)
        // BNB Chain fails while Ethereum doubles: no movement at all.
        mocks.evm.balances.mockImplementation((chain, _address, tokens) =>
          chain === 'bsc'
            ? Promise.reject(new ChainProviderError('timeout'))
            : Promise.resolve({
                native: 3_000_000_000_000_000_000n,
                tokens: tokens.map(() => 0n),
              }),
        )
        await crypto.sync(id, later(1))
        expect(await observed(tx, id)).toHaveLength(2)
        // A Bitcoin scan cut short by a rate limit: none either.
        mocks.evm.balances.mockImplementation((chain, _address, tokens) =>
          Promise.resolve({
            native: chain === 'ethereum' ? 3_000_000_000_000_000_000n : 0n,
            tokens: tokens.map(() => 0n),
          }),
        )
        mocks.bitcoin.addressStates.mockRejectedValue(
          new ChainProviderError('rate_limited', 429),
        )
        await crypto.sync(id, later(2))
        expect(await observed(tx, id)).toHaveLength(2)
        const [account] = await tx
          .select()
          .from(schema.accountsTable)
          .where(eq(schema.accountsTable.id, id))
        expect(account.cryptoObservedAt).toEqual(NOW)
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
        await crypto.refreshPortfolio(later(13), 'auto')
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

    it('resumes a Bitcoin scan cut short by a rate limit where it stopped (#268)', async () => {
      // mempool.space answers 30 requests, then 429 with a long Retry-After.
      let limit = 30
      const mock = esplora((n) => (n > limit ? rateLimited('120') : null))
      await inRollback(
        async ({ crypto, wallet, sleeps }) => {
          const id = await wallet()
          const first = await crypto.sync(id, NOW)
          // Receive 0–29 read, then the rate limit: no inline wait (120 s).
          expect(mock.asked).toEqual(RECEIVE.slice(0, 30))
          expect(sleeps).toEqual([])
          expect(first.sync?.failedChains).toEqual([
            {
              chain: 'bitcoin',
              reason: 'rate_limited',
              retryAt: new Date(NOW.getTime() + 120_000).toISOString(),
            },
          ])
          // The chain stays failed: no Bitcoin line from a partial scan.
          expect(lines(first.holdings)).toEqual(['sync ETH Ethereum 1.5'])

          limit = Infinity
          mock.asked.length = 0
          const second = await crypto.sync(id, later(3))
          // Only what the first attempt did not read.
          expect(mock.asked).toEqual([
            ...RECEIVE.slice(30, 44),
            ...CHANGE.slice(0, 21),
          ])
          expect(lines(second.holdings)).toEqual([
            'sync BTC Bitcoin 0.00085',
            'sync ETH Ethereum 1.5',
          ])
          expect(second.sync).toMatchObject({
            failedAt: null,
            failedChains: [],
          })
        },
        { bitcoin: mock.provider },
      )
    })

    it('re-syncs a scanned key from its used addresses and gap windows, not from address 0', async () => {
      await inRollback(async ({ crypto, mocks, wallet }) => {
        const id = await wallet()
        await crypto.sync(id, NOW)
        expect(mocks.asked).toHaveLength(44 + 21)
        mocks.asked.length = 0

        const again = await crypto.sync(id, later(1))
        // Used 0, 3 and 23 + the 20 after the last used one; change: 0 + 20.
        expect(mocks.asked).toEqual([
          RECEIVE[0],
          RECEIVE[3],
          ...RECEIVE.slice(23, 44),
          ...CHANGE.slice(0, 21),
        ])
        expect(mocks.asked).toHaveLength(23 + 21)
        expect(lines(again.holdings)).toContain('sync BTC Bitcoin 0.00085')
      })
    })

    it('spares Bitcoin on page loads while its last complete scan is recent', async () => {
      await inRollback(async ({ crypto, tokens, mocks, wallet }) => {
        const id = await wallet()
        await crypto.refresh(id, NOW, 'auto')
        const bitcoinCalls = () => mocks.bitcoin.addressStates.mock.calls.length
        const evmCalls = () => mocks.evm.balances.mock.calls.length
        const before = bitcoinCalls()
        expect(before).toBeGreaterThan(0)

        // A new token makes the wallet due at once ("Actualiser les cours"
        // syncs what is due): EVM is read again, the Bitcoin key scanned at
        // NOW is not, and its line stays.
        await tokens.add(id, {
          assetId: 'usd-coin',
          symbol: 'USDC',
          name: 'USDC',
        })
        const evmBefore = evmCalls()
        const reloaded = await crypto.refresh(id, later(1))
        expect(evmCalls()).toBeGreaterThan(evmBefore)
        expect(bitcoinCalls()).toBe(before)
        expect(lines(reloaded.holdings)).toContain('sync BTC Bitcoin 0.00085')

        // "Synchroniser" scans it sooner.
        await crypto.sync(id, later(2))
        expect(bitcoinCalls()).toBeGreaterThan(before)

        // Page loads scan it again once the interval has passed.
        const afterSync = bitcoinCalls()
        await crypto.refreshPortfolio(later(13), 'auto')
        expect(bitcoinCalls()).toBeGreaterThan(afterSync)
      })
    })

    it('waits out a Retry-After up to 60 s once inside the scan, then fails the chain', async () => {
      const mock = esplora((n) => (n === 5 ? rateLimited('45') : null))
      await inRollback(
        async ({ crypto, wallet, sleeps }) => {
          const id = await wallet()
          const result = await crypto.sync(id, NOW)
          expect(sleeps).toEqual([45_000])
          // The address refused is asked again after the pause.
          expect(mock.asked).toEqual([
            ...RECEIVE.slice(0, 44),
            ...CHANGE.slice(0, 21),
          ])
          expect(mock.requests()).toBe(44 + 21 + 1)
          expect(result.sync).toMatchObject({
            failedAt: null,
            failedChains: [],
          })
        },
        { bitcoin: mock.provider },
      )

      const twice = esplora((n) =>
        n === 5 || n === 9 ? rateLimited('45') : null,
      )
      await inRollback(
        async ({ crypto, wallet, sleeps }) => {
          const id = await wallet()
          const result = await crypto.sync(id, NOW)
          // One wait per sync: the second rate limit fails the chain; its
          // backoff starts after the time spent waiting.
          expect(sleeps).toEqual([45_000])
          expect(result.sync?.failedChains).toEqual([
            {
              chain: 'bitcoin',
              reason: 'rate_limited',
              retryAt: new Date(NOW.getTime() + 45_000 + 60_000).toISOString(),
            },
          ])
        },
        { bitcoin: twice.provider },
      )
    })

    it('tells how many addresses each key found in its type (#268)', async () => {
      await inRollback(async ({ accounts, crypto, keys }) => {
        const { id } = await accounts.create({
          name: 'Ledger',
          type: 'crypto',
          cryptoSource: 'wallet',
          walletKeys: [
            { publicKey: BIP84_ZPUB },
            // Never used in legacy (the mocked chain knows none of its
            // addresses): the owner chose the wrong type.
            { publicKey: BIP44_XPUB, addressType: 'legacy' },
          ],
        })
        const before = await keys.list(id)
        expect(before.map((key) => key.scans)).toEqual([[], []])

        await crypto.sync(id, NOW)
        const after = new Map(
          (await keys.list(id)).map((key) => [key.publicKey, key.scans]),
        )
        expect(after.get(BIP84_ZPUB)).toEqual([
          { addressType: 'native_segwit', usedAddresses: 4, completedAt: NOW },
        ])
        expect(after.get(BIP44_XPUB)).toEqual([
          { addressType: 'legacy', usedAddresses: 0, completedAt: NOW },
        ])
      })
    })

    it('refuses new manual holdings on a wallet, and lets the old ones be deleted (#269)', async () => {
      await inRollback(async ({ crypto, wallet, tx }) => {
        const id = await wallet()
        const line = {
          assetId: 'solana',
          symbol: 'SOL',
          name: 'Solana',
          quantity: '2',
          location: 'Phantom',
        }
        await expect(crypto.create(id, line, NOW)).rejects.toThrow(
          'Wallet holdings come from the chain',
        )
        const old = await manualLine(tx, id, line)
        await expect(
          crypto.update(id, old.id, { ...line, quantity: '3' }, NOW),
        ).rejects.toBeInstanceOf(BadRequestException)
        await crypto.remove(id, old.id)
        const left = await crypto.holdings(id, later(1))
        expect(left.holdings.map((h) => h.symbol)).not.toContain('SOL')
      })
    })

    it('no longer reads the assets of manual lines: only added tokens (#269)', async () => {
      await inRollback(async ({ crypto, mocks, wallet, tx }) => {
        const id = await wallet()
        await manualLine(tx, id, {
          assetId: 'usd-coin',
          symbol: 'USDC',
          name: 'USDC',
          quantity: '1',
          location: 'Ledger',
        })
        const result = await crypto.sync(id, NOW)
        expect(mocks.tokens.tokenDeployments).not.toHaveBeenCalled()
        expect(lines(result.holdings)).not.toContain(
          'sync USDC Ethereum 1234.56789',
        )
      })
    })

    it('adds a token by its contract address and reads it at the next sync (#269)', async () => {
      await inRollback(async ({ crypto, tokens, mocks, wallet, priceAsks }) => {
        const id = await wallet()
        const added = await tokens.add(id, {
          chain: 'ethereum',
          contract: CONTRACT_TOKEN.toLowerCase(),
        })
        expect(added).toMatchObject({
          assetId: `erc20.1.${CONTRACT_TOKEN.toLowerCase()}`,
          symbol: 'TKN',
          name: 'Test Token',
          chain: 'ethereum',
          contract: CONTRACT_TOKEN,
          priced: false,
        })
        expect(mocks.evm.tokenInfo).toHaveBeenCalledWith(
          'ethereum',
          CONTRACT_TOKEN,
        )
        await expect(
          tokens.add(id, { chain: 'ethereum', contract: CONTRACT_TOKEN }),
        ).rejects.toBeInstanceOf(ConflictException)

        const result = await crypto.sync(id, NOW)
        // Read on its chain only, with its own decimals (8).
        const tokenCalls = mocks.evm.balances.mock.calls.filter(([, , list]) =>
          list.some((token) => token.address === CONTRACT_TOKEN),
        )
        expect(tokenCalls.map(([chain]) => chain)).toEqual(['ethereum'])
        const line = result.holdings.find((h) => h.symbol === 'TKN')
        expect(line).toMatchObject({
          quantity: '2.5',
          location: 'Ethereum',
          origin: 'sync',
          priceEur: null,
          valueCents: null,
        })
        // Never sent to the price API (the id names the contract).
        expect(priceAsks.length).toBeGreaterThan(0)
        expect(priceAsks.some((asked) => asked.startsWith('erc20.'))).toBe(
          false,
        )
        // No price to wait for: the account is still valued.
        expect(result.complete).toBe(true)
        expect(result.totals.missingPriceCount).toBe(0)
        expect(result.snapshot).toMatchObject({ valueCents: 5_100 + 375_000 })
      })
    })

    it('refuses a contract that is not a token, a bad checksum, or a chain not read', async () => {
      await inRollback(async ({ tokens, wallet }) => {
        const id = await wallet()
        await expect(
          tokens.add(id, {
            chain: 'ethereum',
            contract: '0x4444444444444444444444444444444444444444',
          }),
        ).rejects.toThrow('No token contract at this address')
        await expect(
          tokens.add(id, {
            chain: 'ethereum',
            contract: BAD_CHECKSUM,
          }),
        ).rejects.toThrow('checksum')
        await expect(
          tokens.add(id, { chain: 'base', contract: CONTRACT_TOKEN }),
        ).rejects.toThrow('Wallet sync is disabled')
      })
    })

    it('shows a wallet’s value once its background sync ends after the page load (#269)', async () => {
      // A Bitcoin scan slower than what a page load waits for.
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      const slow: BitcoinChainProvider = {
        addressStates: async (addresses) => {
          await gate
          return addresses.map(
            (address) =>
              BITCOIN_STATES.get(address) ?? { balanceSats: 0n, used: false },
          )
        },
      }
      await inRollback(
        async ({ crypto, wallet, tx }) => {
          const id = await wallet()
          const loaded = await crypto.refresh(id, NOW, 'auto')
          // The page did not wait: nothing synced yet, nothing valued, the
          // sync still running (#381: the page polls while it is).
          expect(loaded.holdings).toEqual([])
          expect(loaded.snapshot).toBeNull()
          expect(loaded.sync?.syncing).toBe(true)
          expect(loaded.refreshDue).toBe(false)

          release()
          await vi.waitFor(async () => {
            const after = await crypto.holdings(id, NOW)
            // Valued once the sync is done: 1.5 ETH and 0.00085 BTC.
            expect(after.snapshot?.valueCents).toBe(375_000 + 5_100)
          })
          // Shown, never stored (#366): the daily close writes the day.
          expect(
            await tx
              .select()
              .from(schema.balanceSnapshotsTable)
              .where(eq(schema.balanceSnapshotsTable.accountId, id)),
          ).toEqual([])
        },
        { bitcoin: slow, backgroundWaitMs: 20 },
      )
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
        await crypto.refresh(id, NOW, 'auto')
        expect(calls()).toBe(2)
        await crypto.refresh(id, later(5), 'auto')
        await crypto.refreshPortfolio(later(5), 'auto')
        expect(calls()).toBe(2)
        await crypto.sync(id, new Date(later(5).getTime() + 10_000))
        expect(calls()).toBe(4)
        await crypto.sync(id, new Date(later(5).getTime() + 20_000))
        expect(calls()).toBe(4)
        await crypto.refreshPortfolio(later(16), 'auto')
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
            syncing: false,
          })
          expect(holdings.refreshDue).toBe(false)
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
