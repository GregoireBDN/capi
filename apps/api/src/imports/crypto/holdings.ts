import { divideHalfEven } from '#/common/decimal'
import type { CryptoMovementKind } from '#/database/schema/domain-enums'
import { FIAT_TICKERS } from './assets'
import type { AssetMapping, ProjectedHolding } from './crypto-import.types'
import { formatQuantity, parseQuantity, quantityToCents } from './quantity'

/** What the holdings computation needs of a movement. */
export interface HoldingMovement {
  occurredAt: string
  kind: CryptoMovementKind
  asset: string
  quantity: string
  eurCents: number | null
  id?: string
}

interface State {
  mapping: AssetMapping | null
  symbol: string
  tickers: Set<string>
  /** Units of 10^-18. */
  quantity: bigint
  /** EUR cents still invested in the quantity held. */
  cost: bigint
  costKnown: boolean
}

interface GroupEntry {
  key: string
  delta: bigint
  kinds: Set<CryptoMovementKind>
  /** EUR the export gives for the purchase lines of the group. */
  rowCost: bigint
  rowCostMissing: boolean
  /** Lines in and out of the same price id (a swap of renamed tickers). */
  hasIn: boolean
  hasOut: boolean
}

/**
 * Holdings of an exchange account from its movements: the quantity of each
 * asset is the sum of its movements, per price id (renamed tickers merge).
 * Fiat (EUR…) is left out. Moves between the exchange's own wallets
 * (`transfer_internal`: Spot ↔ Funding, Earn subscriptions) leave the
 * holdings unchanged, whether or not the export shows both sides.
 *
 * `investedCents` is the EUR cost of the quantity held, fees included, when
 * the export says so. Movements of the same second form one operation:
 * - EUR spent in it (Binance `Spend` and EUR `Fee` lines) is the cost of the
 *   one asset it brings in; a conversion carries the cost of what it gives
 *   away over to that asset;
 * - otherwise a purchase line's own EUR total (Coinbase) is its cost, and
 *   income (rewards, staking) comes at no cost;
 * - any other inflow (a deposit from a wallet, a purchase without its EUR
 *   amount, an unknown operation) makes the cost unknown (null) until the
 *   asset is emptied;
 * - an outflow (sale, conversion, withdrawal, fee) removes its share of the
 *   cost, in proportion to the quantity;
 * - a conversion between two tickers of one asset (a migration) keeps it.
 *
 * Exact: quantities are `bigint`s at 18 decimals, costs integer cents.
 */
export function computeHoldings(
  movements: readonly HoldingMovement[],
  resolve: (ticker: string) => AssetMapping | null,
): ProjectedHolding[] {
  const states = new Map<string, State>()
  const keyOf = (ticker: string) => {
    const mapping = resolve(ticker)
    const key = mapping ? mapping.assetId : `?${ticker}`
    let state = states.get(key)
    if (!state) {
      state = {
        mapping,
        symbol: mapping?.symbol ?? ticker,
        tickers: new Set(),
        quantity: 0n,
        cost: 0n,
        costKnown: true,
      }
      states.set(key, state)
    }
    state.tickers.add(ticker)
    return key
  }

  const ordered = movements
    .map((movement, position) => ({ movement, position }))
    .sort(
      (a, b) =>
        a.movement.occurredAt.localeCompare(b.movement.occurredAt) ||
        a.position - b.position,
    )
    .map(({ movement }) => movement)

  for (let start = 0; start < ordered.length; ) {
    let end = start
    while (
      end < ordered.length &&
      ordered[end].occurredAt === ordered[start].occurredAt
    ) {
      end++
    }
    applyGroup(ordered.slice(start, end), states, keyOf)
    start = end
  }

  return [...states.values()]
    .filter((state) => state.quantity !== 0n)
    .map((state): ProjectedHolding => {
      const status =
        state.quantity < 0n ? 'negative' : state.mapping ? 'ok' : 'unmapped'
      return {
        tickers: [...state.tickers].sort(),
        assetId: state.mapping?.assetId ?? null,
        symbol: state.symbol,
        name: state.mapping?.name ?? null,
        quantity: formatQuantity(state.quantity),
        investedCents:
          state.costKnown && state.quantity > 0n ? Number(state.cost) : null,
        status,
      }
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
}

function applyGroup(
  group: HoldingMovement[],
  states: Map<string, State>,
  keyOf: (ticker: string) => string,
) {
  let eurDelta = 0n
  const entries = new Map<string, GroupEntry>()
  for (const movement of group) {
    if (movement.kind === 'transfer_internal') continue
    const quantity = parseQuantity(movement.quantity) ?? 0n
    if (FIAT_TICKERS.has(movement.asset)) {
      if (movement.asset === 'EUR') eurDelta += quantity
      continue
    }
    const key = keyOf(movement.asset)
    let entry = entries.get(key)
    if (!entry) {
      entry = {
        key,
        delta: 0n,
        kinds: new Set(),
        rowCost: 0n,
        rowCostMissing: false,
        hasIn: false,
        hasOut: false,
      }
      entries.set(key, entry)
    }
    entry.delta += quantity
    entry.kinds.add(movement.kind)
    if (quantity > 0n) entry.hasIn = true
    if (quantity < 0n) entry.hasOut = true
    if (movement.kind === 'buy' && quantity > 0n) {
      if (movement.eurCents === null) entry.rowCostMissing = true
      else entry.rowCost += BigInt(movement.eurCents)
    }
  }

  // A conversion between two tickers of one asset (`-AGIX`, `+FET`) changes
  // the quantity, never the cost.
  for (const [key, entry] of entries) {
    if (!entry.kinds.has('convert') || !entry.hasIn || !entry.hasOut) continue
    const state = states.get(key)!
    state.quantity += entry.delta
    settle(state)
    entries.delete(key)
  }

  let pool = 0n
  let poolKnown = true
  let convertedOut = false
  for (const entry of entries.values()) {
    if (entry.delta >= 0n) continue
    const state = states.get(entry.key)!
    const out = -entry.delta
    let removed = 0n
    if (state.quantity > 0n) {
      const share = out < state.quantity ? out : state.quantity
      removed = divideHalfEven(state.cost * share, state.quantity)
    }
    state.cost -= removed
    state.quantity -= out
    if (entry.kinds.has('convert')) {
      convertedOut = true
      pool += removed
      poolKnown &&= state.costKnown && state.quantity >= 0n
    }
    settle(state)
  }

  const ins = [...entries.values()].filter((entry) => entry.delta > 0n)
  const eurSpent = eurDelta < 0n ? -eurDelta : 0n
  for (const entry of ins) {
    const state = states.get(entry.key)!
    let cost: bigint | null
    if (ins.length === 1 && (eurSpent > 0n || convertedOut)) {
      cost =
        convertedOut && !poolKnown
          ? null
          : BigInt(quantityToCents(eurSpent)) + pool
    } else if (entry.kinds.has('buy') && !entry.rowCostMissing) {
      cost = entry.rowCost
    } else if ([...entry.kinds].every((kind) => kind === 'income')) {
      cost = 0n
    } else {
      cost = null
    }
    state.quantity += entry.delta
    if (cost === null) state.costKnown = false
    else state.cost += cost
    settle(state)
  }
}

/** An emptied asset starts afresh; a negative one has no known cost. */
function settle(state: State) {
  if (state.quantity === 0n) {
    state.cost = 0n
    state.costKnown = true
  } else if (state.quantity < 0n) {
    state.cost = 0n
    state.costKnown = false
  }
}
