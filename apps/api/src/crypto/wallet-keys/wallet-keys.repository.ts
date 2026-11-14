import { BadRequestException, ConflictException } from '@nestjs/common'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import {
  CRYPTO_CHAINS_BY_FAMILY,
  type CryptoChain,
  type CryptoKeyFamily,
  cryptoWalletKeysTable,
  type SelectCryptoWalletKey,
} from '#/database/schema'
import { checkPublicKey, PUBLIC_KEY_ERROR_MESSAGES } from './public-key'
import type { WalletKeyDto, WalletKeyInputDto } from './wallet-keys.dto'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

export interface PreparedWalletKey {
  family: CryptoKeyFamily
  publicKey: string
  chains: CryptoChain[]
  label: string | null
}

export const DUPLICATE_KEY_MESSAGE =
  'This public key is already tracked by an account'

/**
 * Validates and normalizes keys typed by the owner (format, checksum, chains
 * of the key's family). Error messages never contain the key.
 */
export function prepareWalletKeys(
  inputs: readonly WalletKeyInputDto[],
): PreparedWalletKey[] {
  const prepared = inputs.map((input): PreparedWalletKey => {
    const check = checkPublicKey(input.publicKey)
    if (!check.ok) {
      throw new BadRequestException(PUBLIC_KEY_ERROR_MESSAGES[check.error])
    }
    const allowed: readonly CryptoChain[] =
      CRYPTO_CHAINS_BY_FAMILY[check.family]
    const chains = input.chains ?? [allowed[0]]
    if (chains.some((chain) => !allowed.includes(chain))) {
      throw new BadRequestException(
        check.family === 'bitcoin'
          ? 'A Bitcoin key is read on the bitcoin chain only'
          : 'An EVM address is read on EVM chains only',
      )
    }
    return {
      family: check.family,
      publicKey: check.publicKey,
      chains: [...new Set(chains)],
      label: input.label ?? null,
    }
  })
  const keys = prepared.map((key) => key.publicKey)
  if (new Set(keys).size !== keys.length) {
    throw new BadRequestException('The same public key is given twice')
  }
  return prepared
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}

export function toWalletKeyDto(row: SelectCryptoWalletKey): WalletKeyDto {
  return {
    id: row.id,
    accountId: row.accountId,
    family: row.family,
    publicKey: row.publicKey,
    chains: row.chains,
    label: row.label,
    createdAt: row.createdAt,
  }
}

/**
 * Inserts prepared keys for an account. A key already tracked (by any
 * account) is a 409: a wallet is never counted twice.
 */
export async function insertWalletKeys(
  executor: Executor,
  accountId: string,
  keys: readonly PreparedWalletKey[],
): Promise<SelectCryptoWalletKey[]> {
  if (keys.length === 0) return []
  try {
    return await executor
      .insert(cryptoWalletKeysTable)
      .values(keys.map((key) => ({ accountId, ...key })))
      .returning()
  } catch (error) {
    // The Postgres error detail holds the key: never rethrow it.
    if (isUniqueViolation(error)) {
      throw new ConflictException(DUPLICATE_KEY_MESSAGE)
    }
    throw error
  }
}
