import { BadRequestException, ConflictException } from '@nestjs/common'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import {
  type BitcoinAddressType,
  CRYPTO_CHAINS_BY_FAMILY,
  type CryptoChain,
  type CryptoKeyFamily,
  cryptoWalletKeysTable,
  type SelectCryptoWalletKey,
} from '#/database/schema'
import {
  type BitcoinKeyFormat,
  checkPublicKey,
  PREFIX_ADDRESS_TYPES,
  PUBLIC_KEY_ERROR_MESSAGES,
} from './public-key'
import type {
  WalletKeyAddressTypeChoice,
  WalletKeyDto,
  WalletKeyFormat,
  WalletKeyInputDto,
} from './wallet-keys.dto'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

export interface PreparedWalletKey {
  family: CryptoKeyFamily
  publicKey: string
  chains: CryptoChain[]
  label: string | null
  addressTypes: BitcoinAddressType[] | null
  detectAddressTypes: boolean
}

/** Default address type of an `xpub` without a choice (Ledger, Trezor…). */
export const DEFAULT_XPUB_ADDRESS_TYPE = 'native_segwit'

/**
 * Address types stored for an extended key and an owner's choice: an `xpub`
 * takes any type (or detection), a `ypub` / `zpub` only its own.
 */
export function extendedKeyAddressTypes(
  format: BitcoinKeyFormat,
  choice: WalletKeyAddressTypeChoice | undefined,
): Pick<PreparedWalletKey, 'addressTypes' | 'detectAddressTypes'> {
  const own = PREFIX_ADDRESS_TYPES[format]
  if (format !== 'xpub') {
    if (choice !== undefined && choice !== own) {
      throw new BadRequestException(
        `A ${format} key only derives its own address type (${own})`,
      )
    }
    return { addressTypes: [own], detectAddressTypes: false }
  }
  if (choice === 'detect')
    return { addressTypes: null, detectAddressTypes: true }
  return {
    addressTypes: [choice ?? DEFAULT_XPUB_ADDRESS_TYPE],
    detectAddressTypes: false,
  }
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
    let types: Pick<PreparedWalletKey, 'addressTypes' | 'detectAddressTypes'>
    if (check.family === 'evm' || check.format === 'address') {
      if (input.addressType !== undefined) {
        throw new BadRequestException(
          'An address type is only chosen for an extended public key',
        )
      }
      types = {
        addressTypes: check.family === 'evm' ? null : [check.addressType],
        detectAddressTypes: false,
      }
    } else {
      types = extendedKeyAddressTypes(check.format, input.addressType)
    }
    return {
      family: check.family,
      publicKey: check.publicKey,
      chains: [...new Set(chains)],
      label: input.label ?? null,
      ...types,
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

/** Format of a stored key: its extended key prefix or `address`. */
export function walletKeyFormat(
  row: Pick<SelectCryptoWalletKey, 'family' | 'publicKey'>,
): WalletKeyFormat | null {
  if (row.family !== 'bitcoin') return null
  const prefix = row.publicKey.slice(0, 4)
  return prefix === 'xpub' || prefix === 'ypub' || prefix === 'zpub'
    ? prefix
    : 'address'
}

/**
 * Address types a stored Bitcoin key is read as: the stored ones, else (a
 * key saved before they were stored) the type of its prefix; null while
 * detection is pending.
 */
export function effectiveAddressTypes(
  row: Pick<
    SelectCryptoWalletKey,
    'family' | 'publicKey' | 'addressTypes' | 'detectAddressTypes'
  >,
): BitcoinAddressType[] | null {
  if (row.family !== 'bitcoin') return null
  if (row.addressTypes && row.addressTypes.length > 0) return row.addressTypes
  if (row.detectAddressTypes) return null
  const format = walletKeyFormat(row)
  if (format === null || format === 'address') {
    const check = checkPublicKey(row.publicKey)
    return check.ok && check.family === 'bitcoin' && check.format === 'address'
      ? [check.addressType]
      : null
  }
  return [PREFIX_ADDRESS_TYPES[format]]
}

export function toWalletKeyDto(row: SelectCryptoWalletKey): WalletKeyDto {
  const addressTypes = effectiveAddressTypes(row)
  return {
    id: row.id,
    accountId: row.accountId,
    family: row.family,
    publicKey: row.publicKey,
    chains: row.chains,
    label: row.label,
    format: walletKeyFormat(row),
    addressTypes,
    detectingAddressType: row.family === 'bitcoin' && addressTypes === null,
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
