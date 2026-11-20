import '#/load-env'
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import * as schema from '#/database/schema'
import {
  balanceSnapshotsTable,
  cryptoHoldingsTable,
  cryptoWalletKeysTable,
} from '#/database/schema'
import { BIP84_ZPUB } from '../wallet-sync/test-vectors'
import { WalletKeysService } from './wallet-keys.service'

/**
 * Crypto account sources and wallet keys against the dedicated test database
 * (see `vitest.config.ts`). Every test runs in a transaction that is rolled
 * back. Public test vectors only (BIP32 test vector 1, EIP-55 examples).
 */

type Db = PostgresJsDatabase<typeof schema>

const ROLLBACK = Symbol('rollback')

/** BIP32 test vector 1, chains m and m/0H. */
const XPUB =
  'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8'
const XPUB_2 =
  'xpub68Gmy5EdvgibQVfPdqkBBCHxA5htiqg55crXYuXoQRKfDBFA1WEjWgP6LHhwBZeNK1VTsfTFUHCdrfp1bgwQ9xv5ski8PX9rL2dZXvgGDnw'
const XPRV =
  'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi'
/** EIP-55 example, checksummed and lower case. */
const ADDRESS = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'

describe.skipIf(!process.env.DATABASE_URL)(
  'crypto account sources (database)',
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

    async function inRollback(
      fn: (f: {
        tx: Db
        accounts: AccountsService
        keys: WalletKeysService
      }) => Promise<void>,
    ) {
      await db
        .transaction(async (tx) => {
          const database = { db: tx } as never
          const accounts = new AccountsService(database)
          const keys = new WalletKeysService(database, accounts, {
            invalidate: () => {},
            scanSummaries: () => Promise.resolve(new Map()),
          })
          await fn({ tx: tx as unknown as Db, accounts, keys })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    it('creates crypto accounts as manual by default, other accounts without a source', async () => {
      await inRollback(async ({ accounts }) => {
        const crypto = await accounts.create({ name: 'Wallet', type: 'crypto' })
        expect(crypto).toMatchObject({
          cryptoSource: 'manual',
          cryptoProvider: null,
          cryptoSyncedAt: null,
        })
        const checking = await accounts.create({
          name: 'Checking',
          type: 'checking',
        })
        expect(checking).toMatchObject({
          cryptoSource: null,
          cryptoProvider: null,
        })
        await expect(
          accounts.create({
            name: 'Checking',
            type: 'checking',
            cryptoSource: 'manual',
          }),
        ).rejects.toBeInstanceOf(BadRequestException)
      })
    })

    it('creates an exchange account with its provider only', async () => {
      await inRollback(async ({ accounts }) => {
        const exchange = await accounts.create({
          name: 'Binance',
          type: 'crypto',
          institution: 'Binance',
          cryptoSource: 'exchange',
          cryptoProvider: 'binance',
        })
        expect(await accounts.findOne(exchange.id)).toMatchObject({
          cryptoSource: 'exchange',
          cryptoProvider: 'binance',
        })
        await expect(
          accounts.create({
            name: 'x',
            type: 'crypto',
            cryptoSource: 'exchange',
          }),
        ).rejects.toThrow('An exchange account needs a provider')
        await expect(
          accounts.create({
            name: 'x',
            type: 'crypto',
            cryptoSource: 'manual',
            cryptoProvider: 'coinbase',
          }),
        ).rejects.toThrow('Only exchange accounts have a provider')
      })
    })

    it('creates a wallet account with validated, normalized keys', async () => {
      await inRollback(async ({ accounts, keys }) => {
        const wallet = await accounts.create({
          name: 'Ledger',
          type: 'crypto',
          cryptoSource: 'wallet',
          walletKeys: [
            { publicKey: ` ${XPUB}\n`, label: 'Bitcoin' },
            {
              publicKey: ADDRESS.toLowerCase(),
              chains: ['ethereum', 'arbitrum'],
            },
          ],
        })
        expect(wallet.cryptoSource).toBe('wallet')
        const saved = await keys.list(wallet.id)
        expect(saved).toMatchObject([
          {
            family: 'bitcoin',
            publicKey: XPUB,
            chains: ['bitcoin'],
            label: 'Bitcoin',
            format: 'xpub',
            // An xpub without a choice is read as native SegWit (#248).
            addressTypes: ['native_segwit'],
            detectingAddressType: false,
          },
          {
            family: 'evm',
            publicKey: ADDRESS,
            chains: ['ethereum', 'arbitrum'],
            label: null,
            format: null,
            addressTypes: null,
            detectingAddressType: false,
          },
        ])
      })
    })

    it('saves single Bitcoin addresses and the address type of extended keys (#248)', async () => {
      await inRollback(async ({ accounts, keys }) => {
        const wallet = await accounts.create({
          name: 'Ledger',
          type: 'crypto',
          cryptoSource: 'wallet',
          walletKeys: [
            { publicKey: XPUB, addressType: 'detect' },
            // BIP173 example, stored in lower case.
            { publicKey: 'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4' },
          ],
        })
        const saved = await keys.list(wallet.id)
        const xpub = saved.find((key) => key.format === 'xpub')!
        const address = saved.find((key) => key.format === 'address')!
        expect(xpub).toMatchObject({
          format: 'xpub',
          addressTypes: null,
          detectingAddressType: true,
        })
        expect(address).toMatchObject({
          family: 'bitcoin',
          format: 'address',
          publicKey: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
          chains: ['bitcoin'],
          addressTypes: ['native_segwit'],
        })

        expect(
          await keys.update(wallet.id, xpub.id, { addressType: 'legacy' }),
        ).toMatchObject({
          addressTypes: ['legacy'],
          detectingAddressType: false,
        })
        await expect(
          keys.update(wallet.id, address.id, { addressType: 'legacy' }),
        ).rejects.toThrow('Only the address type of an xpub')

        await expect(
          keys.add(wallet.id, { publicKey: BIP84_ZPUB, addressType: 'legacy' }),
        ).rejects.toThrow('only derives its own address type')
        expect(
          await keys.add(wallet.id, {
            publicKey: BIP84_ZPUB,
            addressType: 'native_segwit',
          }),
        ).toMatchObject({ format: 'zpub', addressTypes: ['native_segwit'] })
        await expect(
          keys.add(wallet.id, {
            publicKey: '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA',
            addressType: 'legacy',
          }),
        ).rejects.toThrow('only chosen for an extended public key')
      })
    })

    it('refuses invalid keys and writes nothing', async () => {
      await inRollback(async ({ tx, accounts }) => {
        const cases: [string, string][] = [
          [XPRV, 'This is a private key'],
          [`${XPUB.slice(0, 30)}a${XPUB.slice(31)}`, 'checksum is wrong'],
          ['0xFB6916095ca1df60bB79Ce92cE3Ea74c37c5d359', 'checksum is wrong'],
          [Array(12).fill('abandon').join(' '), 'recovery phrase'],
          ['not a key', 'Not a Bitcoin extended public key'],
        ]
        for (const [publicKey, message] of cases) {
          const attempt = accounts.create({
            name: 'Wallet',
            type: 'crypto',
            cryptoSource: 'wallet',
            walletKeys: [{ publicKey }],
          })
          await expect(attempt).rejects.toBeInstanceOf(BadRequestException)
          await expect(attempt).rejects.toThrow(message)
          // Never echoes the key.
          await attempt.catch((error: Error) =>
            expect(error.message).not.toContain(publicKey),
          )
        }
        await expect(
          accounts.create({
            name: 'Wallet',
            type: 'crypto',
            cryptoSource: 'wallet',
            walletKeys: [{ publicKey: XPUB, chains: ['ethereum'] }],
          }),
        ).rejects.toThrow('bitcoin chain only')
        await expect(
          accounts.create({
            name: 'Wallet',
            type: 'crypto',
            cryptoSource: 'wallet',
          }),
        ).rejects.toThrow('A wallet account needs a public key')
        await expect(
          accounts.create({
            name: 'Wallet',
            type: 'crypto',
            cryptoSource: 'manual',
            walletKeys: [{ publicKey: XPUB }],
          }),
        ).rejects.toThrow('Only wallet accounts have public keys')

        const accountsLeft = await tx
          .select()
          .from(schema.accountsTable)
          .where(eq(schema.accountsTable.name, 'Wallet'))
        expect(accountsLeft).toEqual([])
        expect(await tx.select().from(cryptoWalletKeysTable)).toEqual([])
      })
    })

    it('tracks a key in one account only', async () => {
      await inRollback(async ({ accounts, keys }) => {
        const first = await accounts.create({
          name: 'Ledger',
          type: 'crypto',
          cryptoSource: 'wallet',
          walletKeys: [{ publicKey: ADDRESS }],
        })
        // Same address typed in lower case: same key once normalized.
        await expect(
          accounts.create({
            name: 'MetaMask',
            type: 'crypto',
            cryptoSource: 'wallet',
            walletKeys: [{ publicKey: ADDRESS.toLowerCase() }],
          }),
        ).rejects.toBeInstanceOf(ConflictException)
        await expect(
          keys.add(first.id, { publicKey: ADDRESS }),
        ).rejects.toBeInstanceOf(ConflictException)
        await expect(
          accounts.create({
            name: 'Ledger 2',
            type: 'crypto',
            cryptoSource: 'wallet',
            walletKeys: [{ publicKey: XPUB }, { publicKey: XPUB }],
          }),
        ).rejects.toThrow('given twice')
      })
    })

    it('adds and removes keys, keeping at least one', async () => {
      await inRollback(async ({ accounts, keys }) => {
        const wallet = await accounts.create({
          name: 'Ledger',
          type: 'crypto',
          cryptoSource: 'wallet',
          walletKeys: [{ publicKey: XPUB }],
        })
        const added = await keys.add(wallet.id, {
          publicKey: XPUB_2,
          label: 'Épargne',
        })
        expect(added).toMatchObject({
          family: 'bitcoin',
          chains: ['bitcoin'],
          label: 'Épargne',
        })
        expect(await keys.list(wallet.id)).toHaveLength(2)

        const [first] = await keys.list(wallet.id)
        await keys.remove(wallet.id, first.id)
        const left = await keys.list(wallet.id)
        expect(left.map((key) => key.publicKey)).toEqual([XPUB_2])
        await expect(keys.remove(wallet.id, left[0].id)).rejects.toThrow(
          'at least one public key',
        )
        await expect(keys.remove(wallet.id, first.id)).rejects.toBeInstanceOf(
          NotFoundException,
        )
      })
    })

    it('keeps keys on wallet accounts only, and not on archived ones', async () => {
      await inRollback(async ({ accounts, keys }) => {
        const manual = await accounts.create({ name: 'Manual', type: 'crypto' })
        await expect(keys.list(manual.id)).rejects.toThrow(
          'only kept on wallet crypto accounts',
        )
        await expect(
          keys.add(manual.id, { publicKey: XPUB }),
        ).rejects.toBeInstanceOf(BadRequestException)

        const wallet = await accounts.create({
          name: 'Ledger',
          type: 'crypto',
          cryptoSource: 'wallet',
          walletKeys: [{ publicKey: XPUB }],
        })
        await accounts.update(wallet.id, { archived: true })
        expect(await keys.list(wallet.id)).toHaveLength(1)
        await expect(
          keys.add(wallet.id, { publicKey: XPUB_2 }),
        ).rejects.toThrow('archived')
      })
    })

    it('turns a manual account into a wallet with several keys (#207)', async () => {
      await inRollback(async ({ tx, accounts, keys }) => {
        const manual = await accounts.create({
          name: 'Ledger',
          type: 'crypto',
          institution: 'Ledger',
        })
        // A 0 € value recorded while it held nothing.
        await tx.insert(balanceSnapshotsTable).values({
          accountId: manual.id,
          date: '2026-11-10',
          valueCents: 0,
          source: 'computed',
        })

        const wallet = await accounts.changeCryptoSource(manual.id, {
          cryptoSource: 'wallet',
          walletKeys: [
            { publicKey: XPUB },
            { publicKey: ADDRESS.toLowerCase(), chains: ['ethereum', 'base'] },
          ],
        })
        expect(wallet).toMatchObject({
          id: manual.id,
          cryptoSource: 'wallet',
          cryptoProvider: null,
          balanceCents: null,
          balanceDate: null,
        })
        expect(await keys.list(wallet.id)).toMatchObject([
          { family: 'bitcoin', publicKey: XPUB, chains: ['bitcoin'] },
          {
            family: 'evm',
            publicKey: ADDRESS,
            chains: ['ethereum', 'base'],
          },
        ])
        const left = await tx
          .select()
          .from(balanceSnapshotsTable)
          .where(eq(balanceSnapshotsTable.accountId, manual.id))
        expect(left).toEqual([])

        // Once a wallet, the source no longer changes.
        await expect(
          accounts.changeCryptoSource(manual.id, {
            cryptoSource: 'exchange',
            cryptoProvider: 'binance',
          }),
        ).rejects.toBeInstanceOf(ConflictException)
      })
    })

    it('turns a manual account into an exchange and keeps its real values', async () => {
      await inRollback(async ({ tx, accounts }) => {
        const manual = await accounts.create({
          name: 'Binance',
          type: 'crypto',
        })
        await tx.insert(balanceSnapshotsTable).values([
          {
            accountId: manual.id,
            date: '2026-10-31',
            valueCents: 125_000,
            source: 'computed',
          },
          {
            accountId: manual.id,
            date: '2026-11-10',
            valueCents: 0,
            source: 'computed',
          },
        ])
        const exchange = await accounts.changeCryptoSource(manual.id, {
          cryptoSource: 'exchange',
          cryptoProvider: 'binance',
        })
        expect(exchange).toMatchObject({
          cryptoSource: 'exchange',
          cryptoProvider: 'binance',
          balanceCents: 0,
          balanceDate: '2026-11-10',
        })
        const kept = await tx
          .select()
          .from(balanceSnapshotsTable)
          .where(eq(balanceSnapshotsTable.accountId, manual.id))
        expect(kept).toHaveLength(2)
      })
    })

    it('refuses to change the source of an account that holds something, or with bad input', async () => {
      await inRollback(async ({ tx, accounts }) => {
        const manual = await accounts.create({ name: 'Ledger', type: 'crypto' })
        await expect(
          accounts.changeCryptoSource(manual.id, { cryptoSource: 'wallet' }),
        ).rejects.toThrow('needs a public key')
        await expect(
          accounts.changeCryptoSource(manual.id, { cryptoSource: 'exchange' }),
        ).rejects.toThrow('needs a provider')
        await expect(
          accounts.changeCryptoSource(manual.id, {
            cryptoSource: 'wallet',
            walletKeys: [{ publicKey: XPRV }],
          }),
        ).rejects.toBeInstanceOf(BadRequestException)

        // A key already tracked by another wallet: nothing is changed.
        await accounts.create({
          name: 'Trezor',
          type: 'crypto',
          cryptoSource: 'wallet',
          walletKeys: [{ publicKey: XPUB_2 }],
        })
        await expect(
          accounts.changeCryptoSource(manual.id, {
            cryptoSource: 'wallet',
            walletKeys: [{ publicKey: XPUB_2 }],
          }),
        ).rejects.toBeInstanceOf(ConflictException)

        await tx.insert(cryptoHoldingsTable).values({
          accountId: manual.id,
          assetId: 'bitcoin',
          symbol: 'BTC',
          name: 'Bitcoin',
          quantity: '0.5',
          origin: 'manual',
        })
        await expect(
          accounts.changeCryptoSource(manual.id, {
            cryptoSource: 'wallet',
            walletKeys: [{ publicKey: XPUB }],
          }),
        ).rejects.toThrow('Remove the holdings typed by hand')
        expect((await accounts.findOne(manual.id)).cryptoSource).toBe('manual')

        const checking = await accounts.create({
          name: 'Checking',
          type: 'checking',
        })
        await expect(
          accounts.changeCryptoSource(checking.id, {
            cryptoSource: 'wallet',
            walletKeys: [{ publicKey: XPUB }],
          }),
        ).rejects.toBeInstanceOf(BadRequestException)
        await expect(
          accounts.changeCryptoSource(crypto.randomUUID(), {
            cryptoSource: 'wallet',
            walletKeys: [{ publicKey: XPUB }],
          }),
        ).rejects.toBeInstanceOf(NotFoundException)
      })
    })
  },
)
