import { BadRequestException } from '@nestjs/common'
import type { TransactionKind } from '#/database/schema/domain-enums'

/**
 * A categorized transaction or split part has its category's kind, always
 * (#368, ADR 0005 R1): an incoming amount in an expense category is a refund
 * of it, an outgoing one in an income category lowers that income. The
 * `transactions_kind_follows_category` trigger keeps `transactions.kind`
 * equal to the category's; the API refuses a kind sent against it.
 */
export const KIND_OF_CATEGORY_MESSAGE =
  'A categorized transaction has its category’s kind: choose a category of that kind'

/** Refuses a `kind` sent with a category of another kind (400). */
export function assertKindOfCategory(
  kind: TransactionKind | undefined,
  categoryKind: TransactionKind,
): void {
  if (kind !== undefined && kind !== categoryKind) {
    throw new BadRequestException(KIND_OF_CATEGORY_MESSAGE)
  }
}
