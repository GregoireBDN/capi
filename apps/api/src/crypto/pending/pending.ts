import type {
  CryptoMovementKind,
  CryptoMovementResolution,
} from '#/database/schema/domain-enums'
import { formatQuantity } from '#/imports/crypto/quantity'
import { isOpening, withinFee } from '../cost-basis'
import type { LoadedCostBasis, LoadedMovement } from '../cost-basis.service'

/*
 * « À préciser » (#373): the movements of an account the replay could not
 * explain, one row each, with the movements of the owner's other accounts
 * that could be their other side. Pure: read from the loaded replay.
 */

/** Most candidates one row offers. */
export const PENDING_CANDIDATES_MAX = 10

/**
 * `opening`: coins of a wallet's first read whose cost is unknown (« arrivés
 * avant le … »); `arrival`: coins that arrived from nowhere known;
 * `departure`: coins that left for nowhere known.
 */
export type PendingType = 'opening' | 'arrival' | 'departure'

export interface PendingCandidate {
  movementId: string
  accountId: string
  accountName: string
  kind: CryptoMovementKind
  /** Exact decimal magnitude. */
  quantity: string
  at: number
}

export interface PendingItem {
  movementId: string
  type: PendingType
  assetId: string
  symbol: string
  /** Exact decimal magnitude (an opening: its part of unknown cost). */
  quantity: string
  /** When it happened at the earliest (the previous read), else `at`. */
  from: number
  at: number
  candidates: PendingCandidate[]
}

export interface AnsweredItem {
  movementId: string
  type: PendingType
  assetId: string
  symbol: string
  quantity: string
  at: number
  /** How it was answered: a transfer, or the owner's resolution. */
  answer: 'transfer' | CryptoMovementResolution
  costCents: number | null
  /** The other account of a transfer. */
  counterpartAccountName: string | null
  /** The other side's movement of a transfer chosen by hand (unlinkable). */
  linkedMovementId: string | null
}

const DEPARTURES: readonly CryptoMovementKind[] = ['withdrawal', 'observed_out']
const ARRIVALS: readonly CryptoMovementKind[] = ['deposit', 'observed_in']

function magnitude(units: bigint): bigint {
  return units < 0n ? -units : units
}

function spanOf(movement: LoadedMovement): [number, number] {
  return [movement.observedSince ?? movement.at, movement.at]
}

/** The type of a movement in « À préciser », or null when never asked. */
export function pendingType(movement: LoadedMovement): PendingType | null {
  if (movement.assetId === null) return null
  if (isOpening(movement)) return 'opening'
  if (ARRIVALS.includes(movement.kind)) return 'arrival'
  if (DEPARTURES.includes(movement.kind)) return 'departure'
  return null
}

/**
 * Whether the owner may say `other` is the other side of `movement`: same
 * asset, another account, the arrival at most what left (a fee aside), not
 * before it left. Neither linked nor answered.
 */
export function canPick(
  movement: LoadedMovement,
  other: LoadedMovement,
  linked: ReadonlySet<string>,
): boolean {
  if (linked.has(other.id) || other.resolution !== null) return false
  if (other.accountId === movement.accountId) return false
  if (other.assetId === null || other.assetId !== movement.assetId) return false
  const departure = DEPARTURES.includes(movement.kind) ? movement : other
  const arrival = departure === movement ? other : movement
  if (!DEPARTURES.includes(departure.kind)) return false
  if (!ARRIVALS.includes(arrival.kind) || isOpening(arrival)) return false
  if (!withinFee(magnitude(departure.quantity), magnitude(arrival.quantity))) {
    return false
  }
  return spanOf(arrival)[1] >= spanOf(departure)[0]
}

/**
 * An opening's other side: a withdrawal of the asset from an exchange
 * before the account's first read, not linked nor named to an account.
 */
function canFeedOpening(
  opening: LoadedMovement,
  other: LoadedMovement,
  linked: ReadonlySet<string>,
): boolean {
  return (
    other.kind === 'withdrawal' &&
    other.assetId === opening.assetId &&
    other.accountId !== opening.accountId &&
    other.at < opening.at &&
    other.counterpartAccountId === null &&
    other.resolution === null &&
    !linked.has(other.id)
  )
}

function candidate(
  basis: LoadedCostBasis,
  movement: LoadedMovement,
): PendingCandidate {
  return {
    movementId: movement.id,
    accountId: movement.accountId,
    accountName: basis.accounts.get(movement.accountId)?.name ?? '',
    kind: movement.kind,
    quantity: formatQuantity(magnitude(movement.quantity)),
    at: movement.at,
  }
}

/**
 * The account's movements to answer, oldest first, and those answered by
 * hand. A movement linked to its other side, answered, or (an exchange's)
 * named to another account is not asked; an opening only for its part of
 * unknown cost. Fiat and unknown tickers never are.
 */
export function pendingOf(
  basis: LoadedCostBasis,
  accountId: string,
): { items: PendingItem[]; answered: AnsweredItem[] } {
  const linked = new Map<string, string>()
  for (const link of basis.links) {
    linked.set(link.outId, link.inId)
    linked.set(link.inId, link.outId)
  }
  const linkedIds = new Set(linked.keys())
  const all = [...basis.movements.values()]
  const own = all
    .filter((movement) => movement.accountId === accountId)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
  const items: PendingItem[] = []
  const answered: AnsweredItem[] = []
  for (const movement of own) {
    const type = pendingType(movement)
    if (type === null) continue
    const quantity =
      type === 'opening'
        ? (basis.openingUnknown.get(movement.id) ?? 0n)
        : magnitude(movement.quantity)
    const base = {
      movementId: movement.id,
      type,
      assetId: movement.assetId!,
      symbol: movement.asset,
      quantity: formatQuantity(quantity),
      at: movement.at,
    }
    const other = linked.get(movement.id)
    if (other !== undefined || movement.resolution !== null) {
      const counterpart = other ? basis.movements.get(other) : undefined
      answered.push({
        ...base,
        answer: other !== undefined ? 'transfer' : movement.resolution!,
        costCents: movement.costCents,
        counterpartAccountName: counterpart
          ? (basis.accounts.get(counterpart.accountId)?.name ?? null)
          : null,
        linkedMovementId: other ?? null,
      })
      continue
    }
    if (type === 'opening' && quantity === 0n) continue
    // An exchange's withdrawal or deposit named to another account is a
    // transfer the replay already follows (or its other side will ask).
    if (
      (movement.kind === 'withdrawal' || movement.kind === 'deposit') &&
      movement.counterpartAccountId !== null
    ) {
      continue
    }
    const candidates = all
      .filter((other) =>
        type === 'opening'
          ? canFeedOpening(movement, other, linkedIds)
          : canPick(movement, other, linkedIds),
      )
      // The closest in time first.
      .sort(
        (a, b) =>
          Math.abs(a.at - movement.at) - Math.abs(b.at - movement.at) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, PENDING_CANDIDATES_MAX)
      .map((other) => candidate(basis, other))
    items.push({
      ...base,
      from: movement.observedSince ?? movement.at,
      candidates,
    })
  }
  return { items, answered }
}
