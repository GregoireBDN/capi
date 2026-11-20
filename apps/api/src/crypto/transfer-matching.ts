import type { CryptoMovementKind } from '#/database/schema/domain-enums'
import { withinFee } from './cost-basis'

/*
 * Matching the two sides of a crypto transfer (#373), the same idea as the
 * bank transfer links of #296: what left one of the owner's accounts and
 * what arrived in another, of the same asset, the arrival a little smaller
 * (a network fee paid in coins, `withinFee`) and close in time. Pure.
 */

/** Days between a departure and its arrival a match allows. */
export const TRANSFER_MATCH_DAYS = 3
const DAY_MS = 86_400_000
const WINDOW_MS = TRANSFER_MATCH_DAYS * DAY_MS

export interface MatchCandidate {
  id: string
  accountId: string
  kind: CryptoMovementKind
  /** Price id (never fiat). */
  assetId: string
  /** Magnitude, units of 10^-18. */
  quantity: bigint
  /** Epoch ms: an export line's instant, an observed movement's read. */
  at: number
  /** Observed movements: the previous read (epoch ms). */
  observedSince: number | null
  /** The account the owner (or #296) said the coins went to or came from. */
  counterpartAccountId: string | null
}

export interface MatchedPair {
  outId: string
  inId: string
}

const DEPARTURES: readonly CryptoMovementKind[] = ['withdrawal', 'observed_out']
const ARRIVALS: readonly CryptoMovementKind[] = ['deposit', 'observed_in']

/**
 * When coins really left or arrived: an export line at its instant, an
 * observed movement somewhere between the previous read and its own.
 */
function span(candidate: MatchCandidate): [number, number] {
  return candidate.observedSince === null
    ? [candidate.at, candidate.at]
    : [candidate.observedSince, candidate.at]
}

/**
 * Whether `arrival` can be the coins of `departure`: same asset, another
 * account, at most what was sent and at least what a fee leaves, arriving
 * after leaving and at most `TRANSFER_MATCH_DAYS` later, and the account
 * the owner named on either side, when named.
 */
export function canMatch(
  departure: MatchCandidate,
  arrival: MatchCandidate,
): boolean {
  if (!DEPARTURES.includes(departure.kind)) return false
  if (!ARRIVALS.includes(arrival.kind)) return false
  if (departure.accountId === arrival.accountId) return false
  if (departure.assetId !== arrival.assetId) return false
  if (!withinFee(departure.quantity, arrival.quantity)) return false
  if (
    departure.counterpartAccountId !== null &&
    departure.counterpartAccountId !== arrival.accountId
  ) {
    return false
  }
  if (
    arrival.counterpartAccountId !== null &&
    arrival.counterpartAccountId !== departure.accountId
  ) {
    return false
  }
  const [leftFrom, leftTo] = span(departure)
  const [arrivedFrom, arrivedTo] = span(arrival)
  // It arrived after it left (the latest arrival after the earliest
  // departure), and the earliest arrival at most the window after the
  // latest departure.
  return arrivedTo >= leftFrom && arrivedFrom <= leftTo + WINDOW_MS
}

/**
 * The pairs that match one way only: a departure with exactly one possible
 * arrival which has exactly that departure. A tie links nothing: the owner
 * chooses (« À préciser »).
 */
export function matchTransfers(
  candidates: readonly MatchCandidate[],
): MatchedPair[] {
  const departures = candidates.filter((c) => DEPARTURES.includes(c.kind))
  const arrivals = candidates.filter((c) => ARRIVALS.includes(c.kind))
  const forArrival = new Map<string, MatchCandidate[]>()
  const pairs: MatchedPair[] = []
  const forDeparture = new Map<string, MatchCandidate[]>()
  for (const departure of departures) {
    const matches = arrivals.filter((arrival) => canMatch(departure, arrival))
    forDeparture.set(departure.id, matches)
    for (const arrival of matches) {
      forArrival.set(arrival.id, [
        ...(forArrival.get(arrival.id) ?? []),
        departure,
      ])
    }
  }
  for (const departure of departures) {
    const matches = forDeparture.get(departure.id)!
    if (matches.length !== 1) continue
    const arrival = matches[0]
    if (forArrival.get(arrival.id)?.length !== 1) continue
    pairs.push({ outId: departure.id, inId: arrival.id })
  }
  return pairs
}
