import { createHash } from 'node:crypto'
import type { CryptoImportFormat } from '#/database/schema/domain-enums'
import type { ParsedMovement } from './crypto-import.types'

/**
 * Dedupe hash of each movement, in file order:
 *
 *     sha256("crypto:v1" | format | occurredAt | wallet | operation | asset | quantity | occurrence)
 *
 * `occurrence` is the 0-based index of the movement among the identical ones
 * (same instant, wallet, operation, asset and quantity) of the file, so two
 * identical lines on the same second (two equal fees) are both kept, while a
 * re-imported file, or an overlapping export that holds the same lines, gets
 * the same hashes. The exchange id is left out: older exports have none.
 * A Ledger Live line (#426) adds its transaction hash's digest, so two
 * equal operations of two transactions in the same second stay apart; its
 * account name is left out (renaming an account in Ledger Live changes
 * nothing). Same idea as the bank imports' `computeDedupeHashes`.
 */
export function computeMovementHashes(
  format: CryptoImportFormat,
  movements: readonly ParsedMovement[],
): string[] {
  const occurrences = new Map<string, number>()
  return movements.map((movement) => {
    const key = [
      format,
      movement.occurredAt,
      format === 'ledger_live_csv' ? '' : (movement.wallet ?? ''),
      movement.operation,
      movement.asset,
      movement.quantity,
      ...(format === 'ledger_live_csv' ? [movement.txHashDigest ?? ''] : []),
    ].join('|')
    const occurrence = occurrences.get(key) ?? 0
    occurrences.set(key, occurrence + 1)
    return createHash('sha256')
      .update(`crypto:v1|${key}|${occurrence}`)
      .digest('hex')
  })
}
