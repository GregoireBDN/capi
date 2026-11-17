import '#/load-env'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BIP44_XPUB, BIP49_YPUB, BIP84_ZPUB } from './wallet-sync/test-vectors'

/**
 * Migration 0024 (#248): keys saved before it keep reading the address type
 * of their prefix. Run on a copy of `crypto_wallet_keys` in its old shape, in
 * a scratch schema inside a rolled-back transaction (the enum type already
 * exists in the migrated test database, so its CREATE TYPE is skipped).
 * Public test vectors only.
 */

const MIGRATION = resolve(
  __dirname,
  '../../drizzle/0024_bitcoin_address_types.sql',
)
const SCHEMA = 'migration_0024'
const ROLLBACK = Symbol('rollback')

describe.skipIf(!process.env.DATABASE_URL)(
  'migration 0024: bitcoin address types (database)',
  () => {
    let client: postgres.Sql

    beforeAll(() => {
      client = postgres(process.env.DATABASE_URL!, {
        max: 1,
        onnotice: () => {},
      })
    })

    afterAll(async () => {
      await client.end()
    })

    it('sets the prefix type on existing Bitcoin keys and leaves EVM keys alone', async () => {
      await client
        .begin(async (sql) => {
          await sql.unsafe(`
            CREATE SCHEMA ${SCHEMA};
            SET LOCAL search_path TO ${SCHEMA}, public;
            CREATE TABLE ${SCHEMA}.crypto_wallet_keys
              (LIKE public.crypto_wallet_keys INCLUDING DEFAULTS);
            ALTER TABLE ${SCHEMA}.crypto_wallet_keys
              DROP COLUMN address_types,
              DROP COLUMN detect_address_types;
          `)
          const account = '00000000-0000-4000-8000-000000000001'
          for (const [family, key, chain] of [
            ['bitcoin', BIP44_XPUB, 'bitcoin'],
            ['bitcoin', BIP49_YPUB, 'bitcoin'],
            ['bitcoin', BIP84_ZPUB, 'bitcoin'],
            ['evm', '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359', 'ethereum'],
          ]) {
            await sql.unsafe(
              `INSERT INTO crypto_wallet_keys (account_id, family, public_key, chains)
               VALUES ($1, $2, $3, ARRAY[$4]::crypto_chain[])`,
              [account, family, key, chain],
            )
          }
          const statements = readFileSync(MIGRATION, 'utf8')
            .split('--> statement-breakpoint')
            .filter((statement) => !/CREATE TYPE/.test(statement))
          for (const statement of statements) await sql.unsafe(statement)

          const rows = await sql.unsafe<
            { public_key: string; address_types: string; detect: boolean }[]
          >(
            `SELECT public_key, address_types::text, detect_address_types AS detect
             FROM crypto_wallet_keys ORDER BY public_key`,
          )
          expect(
            Object.fromEntries(
              rows.map((row) => [
                row.public_key.slice(0, 4),
                [row.address_types, row.detect],
              ]),
            ),
          ).toEqual({
            '0xfB': [null, false],
            xpub: ['{legacy}', false],
            ypub: ['{nested_segwit}', false],
            zpub: ['{native_segwit}', false],
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    })
  },
)
