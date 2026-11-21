import type {
  CryptoMovementKind,
  CryptoMovementResolution,
} from '#/database/schema/domain-enums'
import { FIAT_TICKERS } from '#/imports/crypto/assets'
import { formatQuantity, quantityToCents } from '#/imports/crypto/quantity'
import { divideHalfEven } from '#/common/decimal'

/*
 * The cost follows the coins (#373). Every crypto account keeps, per asset,
 * a pool of quantity and cost (average cost, the French « PMP »); one replay
 * over every movement of every crypto account, in date order, moves them:
 *
 * - a buy adds its quantity and its euro cost (fees included); income
 *   (rewards, staking) comes at no cost;
 * - a sale removes its share of the cost (average); what it brought in
 *   minus that share is a realised gain;
 * - a conversion (or a sale into another coin) carries the cost over to
 *   the coin it brings in: no gain;
 * - a transfer between two of the owner's accounts (a withdrawal and the
 *   arrival it is linked to) takes its share of the cost out of the source
 *   and puts it whole into the destination: a network fee paid in coins
 *   lowers the quantity, never the cost;
 * - coins whose cost the app can't know (a deposit from elsewhere, an
 *   arrival on a wallet nobody answered, an opening position) are counted
 *   apart, « sans coût connu », until the owner gives their cost (`bought`)
 *   or says they were a `gift` (cost 0); they leave in proportion like the
 *   others, so the known part keeps its average price;
 * - euros waiting on an exchange count at face value, at a cost equal to
 *   themselves.
 *
 * A wallet's opening position (its first read) is a reconciliation: what
 * was linked to it before (account-level links of #296) is there at its
 * cost, the rest is of unknown cost (or the cost given on the opening),
 * anything beyond the position left at average cost.
 *
 * Pure and exact: quantities are bigints at 18 decimals, costs integer
 * cents, rounded half to even. Never logs anything.
 */

/** Units of 10^-18 in one. */
const ONE = 10n ** 18n

export type CostAccountSource = 'exchange' | 'wallet' | 'manual'

export interface CostAccount {
  id: string
  source: CostAccountSource
  /**
   * A wallet's or manual account's last complete read (epoch ms), even an
   * empty one: a link to the account alone carries no cost after its first
   * read.
   */
  observedAt?: number | null
}

/**
 * How much smaller than what was sent an arrival may be and still be the
 * same coins, the rest a network fee paid in coins: 5 %.
 */
export const FEE_TOLERANCE_PERCENT = 5n

/** Whether `received` is `sent` less a network fee. */
export function withinFee(sent: bigint, received: bigint): boolean {
  return (
    received <= sent && received * 100n >= sent * (100n - FEE_TOLERANCE_PERCENT)
  )
}

export interface CostMovement {
  id: string
  accountId: string
  /** Epoch milliseconds. */
  at: number
  kind: CryptoMovementKind
  /** Ticker as exported (`EUR`, `RNDR`) or the observed asset's symbol. */
  asset: string
  /**
   * Price id: an observed movement's own, an export line's from its ticker;
   * null when unknown (an unmapped ticker, fiat).
   */
  assetId: string | null
  /** Signed, units of 10^-18. */
  quantity: bigint
  eurCents: number | null
  /** Observed movements: the previous read (epoch ms); null on an opening. */
  observedSince: number | null
  counterpartAccountId: string | null
  resolution: CryptoMovementResolution | null
  /** Cost the owner gave (`bought`, `gift`). */
  costCents: number | null
}

export interface CostLink {
  outId: string
  inId: string
}

/** What part of a quantity moved, with its cost. */
export interface Carried {
  /** Units of 10^-18 (positive). */
  quantity: bigint
  costCents: bigint
  /** Part of `quantity` whose cost is unknown. */
  unknownQuantity: bigint
}

export interface PoolState {
  assetId: string
  /** Exact decimal strings. */
  quantity: string
  /** Cost of the coins whose cost is known. */
  costCents: number
  unknownQuantity: string
}

export interface InvestedStep {
  /** Epoch ms of the movement that set it. */
  at: number
  /** Cost of the coins held whose cost is known, plus the euros waiting. */
  investedCents: number
  /** Euros waiting on the exchange (part of `investedCents`). */
  fiatCents: number
  /** Coins held whose cost is unknown, per price id (decimal strings). */
  unknown: { assetId: string; quantity: string }[]
}

export interface RealisedGain {
  accountId: string
  movementId: string
  at: number
  assetId: string | null
  proceedsCents: number
  /** Cost of the coins sold whose cost is known. */
  costCents: number
  /**
   * Proceeds of the known part minus its cost; null when the cost of every
   * coin sold is unknown.
   */
  gainCents: number | null
  /** Coins sold whose cost was unknown (decimal string). */
  unknownQuantity: string
}

export interface CostBasis {
  /** Per account, the steps of its invested amount, oldest first. */
  steps: Map<string, InvestedStep[]>
  /** Per account, its pools per price id at the end. */
  pools: Map<string, PoolState[]>
  gains: RealisedGain[]
  /**
   * What each departure or arrival moved, at its own quantity: a
   * withdrawal's cost, what a linked arrival received.
   */
  movementCosts: Map<string, Carried>
  /** Opening movement → the part of it whose cost the replay can't know. */
  openingUnknown: Map<string, bigint>
}

interface Pool {
  quantity: bigint
  cost: bigint
  unknown: bigint
}

const OBSERVED: readonly CryptoMovementKind[] = ['observed_in', 'observed_out']

export function isObserved(kind: CryptoMovementKind): boolean {
  return OBSERVED.includes(kind)
}

/** An observed arrival with no previous read: the account's opening. */
export function isOpening(movement: {
  kind: CryptoMovementKind
  observedSince: number | null
}): boolean {
  return movement.kind === 'observed_in' && movement.observedSince === null
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value
}

function scale(value: bigint, numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n
  return divideHalfEven(value * numerator, denominator)
}

class Pools {
  private readonly byKey = new Map<string, Pool>()
  private readonly keysOf = new Map<string, Set<string>>()

  get(accountId: string, key: string): Pool {
    const id = `${accountId}|${key}`
    let pool = this.byKey.get(id)
    if (!pool) {
      pool = { quantity: 0n, cost: 0n, unknown: 0n }
      this.byKey.set(id, pool)
      const keys = this.keysOf.get(accountId) ?? new Set<string>()
      keys.add(key)
      this.keysOf.set(accountId, keys)
    }
    return pool
  }

  /** Takes `quantity` out at average cost; a shortfall leaves of unknown cost. */
  take(accountId: string, key: string, quantity: bigint): Carried {
    const pool = this.get(accountId, key)
    if (quantity <= 0n)
      return { quantity: 0n, costCents: 0n, unknownQuantity: 0n }
    if (pool.quantity <= 0n) {
      return { quantity, costCents: 0n, unknownQuantity: quantity }
    }
    if (quantity >= pool.quantity) {
      const carried = {
        quantity,
        costCents: pool.cost,
        unknownQuantity: pool.unknown + (quantity - pool.quantity),
      }
      pool.quantity = 0n
      pool.cost = 0n
      pool.unknown = 0n
      return carried
    }
    const costCents = scale(pool.cost, quantity, pool.quantity)
    const unknownQuantity = scale(pool.unknown, quantity, pool.quantity)
    pool.quantity -= quantity
    pool.cost -= costCents
    pool.unknown -= unknownQuantity
    return { quantity, costCents, unknownQuantity }
  }

  add(accountId: string, key: string, carried: Carried): void {
    const pool = this.get(accountId, key)
    pool.quantity += carried.quantity
    pool.cost += carried.costCents
    pool.unknown += carried.unknownQuantity
    if (pool.unknown > pool.quantity) pool.unknown = pool.quantity
  }

  /** A quantity change that keeps the cost (a ticker migration). */
  adjust(accountId: string, key: string, delta: bigint): void {
    const pool = this.get(accountId, key)
    pool.quantity += delta
    if (pool.quantity <= 0n) {
      pool.quantity = 0n
      pool.cost = 0n
      pool.unknown = 0n
    } else if (pool.unknown > pool.quantity) {
      pool.unknown = pool.quantity
    }
  }

  /** The account's pools, by key. */
  entries(accountId: string): [string, Pool][] {
    const keys = this.keysOf.get(accountId) ?? new Set<string>()
    return [...keys].map((key) => [key, this.get(accountId, key)])
  }
}

/** The pool key of a movement: its price id, else its ticker. */
function keyOf(movement: CostMovement): string {
  return movement.assetId ?? `?${movement.asset}`
}

function isFiat(movement: CostMovement): boolean {
  return FIAT_TICKERS.has(movement.asset.toUpperCase())
}

/** Received coins: `quantity` at `carried`'s cost, its unknown part scaled. */
function arriving(carried: Carried, quantity: bigint): Carried {
  if (carried.quantity === 0n) {
    return { quantity, costCents: 0n, unknownQuantity: quantity }
  }
  const unknown = scale(carried.unknownQuantity, quantity, carried.quantity)
  return {
    quantity,
    costCents: carried.costCents,
    unknownQuantity: unknown > quantity ? quantity : unknown,
  }
}

type Unit =
  | { type: 'group'; at: number; order: number; movements: CostMovement[] }
  | { type: 'observed'; at: number; order: number; movement: CostMovement }
  | { type: 'link_out'; at: number; order: number; link: CostLink }
  | { type: 'link_in'; at: number; order: number; link: CostLink }

const UNIT_RANK: Record<Unit['type'], number> = {
  group: 0,
  observed: 0,
  link_out: 1,
  link_in: 2,
}

/**
 * Replays every movement of every crypto account (any order in; sorted
 * here) with the transfer links between them. Movements of unknown accounts
 * are ignored, as are links whose sides are missing or of the wrong kinds.
 */
export function replayCosts(
  accounts: readonly CostAccount[],
  movements: readonly CostMovement[],
  links: readonly CostLink[],
): CostBasis {
  const sourceOf = new Map(
    accounts.map((account) => [account.id, account.source]),
  )
  const byId = new Map<string, CostMovement>()
  for (const movement of movements) {
    if (sourceOf.has(movement.accountId)) byId.set(movement.id, movement)
  }
  const outOf = new Map<string, CostLink>()
  const inOf = new Map<string, CostLink>()
  for (const link of links) {
    const out = byId.get(link.outId)
    const arrival = byId.get(link.inId)
    if (!out || !arrival || out.accountId === arrival.accountId) continue
    if (!['withdrawal', 'observed_out'].includes(out.kind)) continue
    if (!['deposit', 'observed_in'].includes(arrival.kind)) continue
    if (isOpening(arrival) || outOf.has(out.id) || inOf.has(arrival.id)) {
      continue
    }
    outOf.set(out.id, link)
    inOf.set(arrival.id, link)
  }

  // When each account first saw each asset (its opening), and its first
  // read at all: a link to the account alone carries the cost before it.
  const openingAt = new Map<string, number>()
  const firstReadAt = new Map<string, number>()
  for (const account of accounts) {
    if (account.observedAt != null) {
      firstReadAt.set(account.id, account.observedAt)
    }
  }
  for (const movement of byId.values()) {
    if (!isObserved(movement.kind)) continue
    const readAt = movement.observedSince ?? movement.at
    const first = firstReadAt.get(movement.accountId)
    if (first === undefined || readAt < first) {
      firstReadAt.set(movement.accountId, readAt)
    }
    if (isOpening(movement)) {
      const key = `${movement.accountId}|${keyOf(movement)}`
      const known = openingAt.get(key)
      if (known === undefined || movement.at < known) {
        openingAt.set(key, movement.at)
      }
    }
  }
  const carriesTo = (accountId: string | null, key: string, at: number) => {
    if (accountId === null) return false
    const source = sourceOf.get(accountId)
    if (source === undefined || source === 'exchange') return false
    const limit =
      openingAt.get(`${accountId}|${key}`) ?? firstReadAt.get(accountId)
    return limit === undefined || at < limit
  }

  // Units: an exchange's lines of one instant form one operation; each
  // observed movement is its own; a link moves the cost out at the earlier
  // of its two sides (the coins had left by then) and in at its arrival.
  const units: Unit[] = []
  let order = 0
  const groups = new Map<string, CostMovement[]>()
  const ordered = [...byId.values()].sort(
    (a, b) => a.at - b.at || a.id.localeCompare(b.id),
  )
  for (const movement of ordered) {
    if (outOf.has(movement.id) || inOf.has(movement.id)) continue
    if (isObserved(movement.kind)) {
      units.push({
        type: 'observed',
        at: movement.at,
        order: order++,
        movement,
      })
      continue
    }
    const key = `${movement.accountId}|${movement.at}`
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
      units.push({
        type: 'group',
        at: movement.at,
        order: order++,
        movements: group,
      })
    }
    group.push(movement)
  }
  for (const link of outOf.values()) {
    const out = byId.get(link.outId)!
    const arrival = byId.get(link.inId)!
    units.push({
      type: 'link_out',
      at: Math.min(out.at, arrival.at),
      order: order++,
      link,
    })
    units.push({ type: 'link_in', at: arrival.at, order: order++, link })
  }
  units.sort(
    (a, b) =>
      a.at - b.at || UNIT_RANK[a.type] - UNIT_RANK[b.type] || a.order - b.order,
  )

  const pools = new Pools()
  const fiat = new Map<string, bigint>()
  const steps = new Map<string, InvestedStep[]>()
  const gains: RealisedGain[] = []
  const movementCosts = new Map<string, Carried>()
  const openingUnknown = new Map<string, bigint>()
  const inTransit = new Map<CostLink, Carried>()

  const record = (accountId: string, at: number) => {
    let invested = 0n
    const unknown: { assetId: string; quantity: string }[] = []
    for (const [key, pool] of pools.entries(accountId)) {
      if (pool.quantity <= 0n) continue
      invested += pool.cost
      if (pool.unknown > 0n && !key.startsWith('?')) {
        unknown.push({ assetId: key, quantity: formatQuantity(pool.unknown) })
      }
    }
    const fiatCents = fiat.get(accountId) ?? 0n
    const list = steps.get(accountId) ?? []
    const step: InvestedStep = {
      at,
      investedCents: Number(invested + fiatCents),
      fiatCents: Number(fiatCents),
      unknown: unknown.sort((a, b) => a.assetId.localeCompare(b.assetId)),
    }
    if (list.length > 0 && list[list.length - 1].at === at)
      list[list.length - 1] = step
    else list.push(step)
    steps.set(accountId, list)
  }

  for (const unit of units) {
    const touched = new Set<string>()
    if (unit.type === 'observed') {
      applyObserved(unit.movement)
      touched.add(unit.movement.accountId)
    } else if (unit.type === 'group') {
      applyGroup(unit.movements, touched)
    } else if (unit.type === 'link_out') {
      const out = byId.get(unit.link.outId)!
      const carried = pools.take(out.accountId, keyOf(out), abs(out.quantity))
      movementCosts.set(out.id, carried)
      inTransit.set(unit.link, carried)
      touched.add(out.accountId)
    } else {
      const arrival = byId.get(unit.link.inId)!
      const carried = inTransit.get(unit.link)!
      const received = arriving(carried, abs(arrival.quantity))
      pools.add(arrival.accountId, keyOf(arrival), received)
      movementCosts.set(arrival.id, received)
      touched.add(arrival.accountId)
    }
    for (const accountId of touched) record(accountId, unit.at)
  }

  function given(movement: CostMovement): bigint | null {
    if (movement.resolution === 'gift') return 0n
    if (movement.resolution === 'bought' && movement.costCents !== null) {
      return BigInt(movement.costCents)
    }
    return null
  }

  function applyObserved(movement: CostMovement) {
    const key = keyOf(movement)
    const quantity = abs(movement.quantity)
    if (movement.kind === 'observed_out') {
      movementCosts.set(
        movement.id,
        pools.take(movement.accountId, key, quantity),
      )
      return
    }
    if (isOpening(movement)) {
      // What was linked to the account before is there at its cost; the
      // rest of the position is of unknown cost (or the cost given).
      const pool = pools.get(movement.accountId, key)
      if (quantity < pool.quantity) {
        // Less than what was sent to it: network fees lower the quantity
        // only; beyond them, coins left before at average cost.
        if (withinFee(pool.quantity, quantity)) {
          pools.adjust(movement.accountId, key, quantity - pool.quantity)
        } else {
          pools.take(movement.accountId, key, pool.quantity - quantity)
        }
        openingUnknown.set(movement.id, 0n)
        return
      }
      const extra = quantity - pool.quantity
      openingUnknown.set(movement.id, extra)
      const cost = given(movement)
      pools.add(movement.accountId, key, {
        quantity: extra,
        costCents: cost ?? 0n,
        unknownQuantity: cost === null ? extra : 0n,
      })
      return
    }
    const cost = given(movement)
    const received: Carried = {
      quantity,
      costCents: cost ?? 0n,
      unknownQuantity: cost === null ? quantity : 0n,
    }
    pools.add(movement.accountId, key, received)
    movementCosts.set(movement.id, received)
  }

  function applyGroup(group: CostMovement[], touched: Set<string>) {
    const accountId = group[0].accountId
    touched.add(accountId)
    let eurDelta = 0n
    let hasEurLine = false
    interface Entry {
      key: string
      delta: bigint
      kinds: Set<CryptoMovementKind>
      lines: CostMovement[]
      rowCost: bigint
      rowCostMissing: boolean
      hasIn: boolean
      hasOut: boolean
    }
    const entries = new Map<string, Entry>()
    for (const movement of group) {
      if (movement.kind === 'transfer_internal') continue
      if (isFiat(movement)) {
        if (movement.asset.toUpperCase() === 'EUR') {
          eurDelta += movement.quantity
          hasEurLine = true
        }
        continue
      }
      const key = keyOf(movement)
      let entry = entries.get(key)
      if (!entry) {
        entry = {
          key,
          delta: 0n,
          kinds: new Set(),
          lines: [],
          rowCost: 0n,
          rowCostMissing: false,
          hasIn: false,
          hasOut: false,
        }
        entries.set(key, entry)
      }
      entry.delta += movement.quantity
      entry.kinds.add(movement.kind)
      entry.lines.push(movement)
      if (movement.quantity > 0n) entry.hasIn = true
      if (movement.quantity < 0n) entry.hasOut = true
      if (movement.kind === 'buy' && movement.quantity > 0n) {
        if (movement.eurCents === null) entry.rowCostMissing = true
        else entry.rowCost += BigInt(movement.eurCents)
      }
    }

    // A conversion between two tickers of one asset changes the quantity,
    // never the cost.
    for (const [key, entry] of entries) {
      if (!entry.kinds.has('convert') || !entry.hasIn || !entry.hasOut) continue
      pools.adjust(accountId, key, entry.delta)
      entries.delete(key)
    }

    const ins = [...entries.values()].filter((entry) => entry.delta > 0n)
    let swapped: Carried | null = null
    const sales: { entry: Entry; taken: Carried }[] = []
    for (const entry of entries.values()) {
      if (entry.delta >= 0n) continue
      const out = -entry.delta
      const withdrawals = entry.lines.filter(
        (line) => line.kind === 'withdrawal',
      )
      // A withdrawal to an account that has not read its coins yet carries
      // its cost there (#296 links); otherwise the coins leave.
      let carriedOut = 0n
      for (const line of withdrawals) {
        const quantity = abs(line.quantity)
        const taken = pools.take(accountId, entry.key, quantity)
        movementCosts.set(line.id, taken)
        carriedOut += quantity
        if (carriesTo(line.counterpartAccountId, entry.key, line.at)) {
          pools.add(line.counterpartAccountId!, entry.key, taken)
          touched.add(line.counterpartAccountId!)
        }
      }
      const rest = out > carriedOut ? out - carriedOut : 0n
      const taken = pools.take(accountId, entry.key, rest)
      const swaps = entry.kinds.has('convert') || entry.kinds.has('sell')
      if (!swaps || rest === 0n) continue
      if (entry.kinds.has('sell')) sales.push({ entry, taken })
      swapped = swapped
        ? {
            quantity: swapped.quantity + taken.quantity,
            costCents: swapped.costCents + taken.costCents,
            unknownQuantity: swapped.unknownQuantity + taken.unknownQuantity,
          }
        : taken
    }

    const eurSpent = hasEurLine && eurDelta < 0n ? -eurDelta : 0n
    // A sale into euros: what it brought in minus its cost is realised.
    if (sales.length > 0 && ins.length === 0) {
      let proceeds: bigint | null = null
      if (hasEurLine) {
        proceeds = sales.length === 1 && eurDelta > 0n ? eurDelta : null
        if (proceeds !== null) proceeds = BigInt(quantityToCents(proceeds))
      } else {
        const lines = sales.flatMap(({ entry }) =>
          entry.lines.filter((line) => line.kind === 'sell'),
        )
        if (lines.every((line) => line.eurCents !== null)) {
          proceeds = lines.reduce(
            (sum, line) => sum + BigInt(line.eurCents!),
            0n,
          )
        }
      }
      if (proceeds !== null) {
        const total = sales.reduce((sum, sale) => sum + sale.taken.quantity, 0n)
        for (const sale of sales) {
          const share =
            sales.length === 1
              ? proceeds
              : scale(proceeds, sale.taken.quantity, total)
          const known = sale.taken.quantity - sale.taken.unknownQuantity
          const line = sale.entry.lines.find((l) => l.kind === 'sell')!
          gains.push({
            accountId,
            movementId: line.id,
            at: line.at,
            assetId: line.assetId,
            proceedsCents: Number(share),
            costCents: Number(sale.taken.costCents),
            gainCents:
              known <= 0n
                ? null
                : Number(
                    scale(share, known, sale.taken.quantity) -
                      sale.taken.costCents,
                  ),
            unknownQuantity: formatQuantity(sale.taken.unknownQuantity),
          })
        }
      }
    }

    for (const entry of ins) {
      const quantity = entry.delta
      let carried: Carried
      if (ins.length === 1 && (eurSpent > 0n || swapped)) {
        // Euros spent, or the cost of what was converted or sold into it.
        const fromSwap = swapped ? arriving(swapped, quantity) : null
        carried = {
          quantity,
          costCents:
            BigInt(quantityToCents(eurSpent)) + (fromSwap?.costCents ?? 0n),
          unknownQuantity: fromSwap?.unknownQuantity ?? 0n,
        }
      } else if (entry.kinds.has('buy') && !entry.rowCostMissing) {
        carried = { quantity, costCents: entry.rowCost, unknownQuantity: 0n }
      } else if ([...entry.kinds].every((kind) => kind === 'income')) {
        carried = { quantity, costCents: 0n, unknownQuantity: 0n }
      } else if ([...entry.kinds].every((kind) => kind === 'deposit')) {
        carried = { quantity: 0n, costCents: 0n, unknownQuantity: 0n }
        for (const line of entry.lines) {
          const lineQuantity = abs(line.quantity)
          const cost = given(line)
          let received: Carried
          if (cost !== null) {
            received = {
              quantity: lineQuantity,
              costCents: cost,
              unknownQuantity: 0n,
            }
          } else if (carriesTo(line.counterpartAccountId, entry.key, line.at)) {
            const taken = pools.take(
              line.counterpartAccountId!,
              entry.key,
              lineQuantity,
            )
            touched.add(line.counterpartAccountId!)
            received = arriving(taken, lineQuantity)
          } else {
            received = {
              quantity: lineQuantity,
              costCents: 0n,
              unknownQuantity: lineQuantity,
            }
          }
          movementCosts.set(line.id, received)
          carried = {
            quantity: carried.quantity + received.quantity,
            costCents: carried.costCents + received.costCents,
            unknownQuantity: carried.unknownQuantity + received.unknownQuantity,
          }
        }
        // Lines of the entry that left (rare) were already taken out.
        if (carried.quantity !== quantity) carried = arriving(carried, quantity)
      } else {
        carried = { quantity, costCents: 0n, unknownQuantity: quantity }
      }
      pools.add(accountId, entry.key, carried)
    }

    // Euros waiting on the exchange.
    let balance = fiat.get(accountId) ?? 0n
    if (hasEurLine) {
      balance += BigInt(quantityToCents(eurDelta))
    } else {
      for (const movement of group) {
        if (movement.eurCents === null || isFiat(movement)) continue
        if (movement.kind === 'buy' && movement.quantity > 0n) {
          // Paid from the balance as far as it goes, by card beyond.
          const paid = BigInt(movement.eurCents)
          balance -= paid < balance ? paid : balance
        } else if (movement.kind === 'sell' && movement.quantity < 0n) {
          balance += BigInt(movement.eurCents)
        }
      }
    }
    fiat.set(accountId, balance < 0n ? 0n : balance)
  }

  const finalPools = new Map<string, PoolState[]>()
  for (const accountId of sourceOf.keys()) {
    const list: PoolState[] = []
    for (const [key, pool] of pools.entries(accountId)) {
      if (key.startsWith('?') || pool.quantity <= 0n) continue
      list.push({
        assetId: key,
        quantity: formatQuantity(pool.quantity),
        costCents: Number(pool.cost),
        unknownQuantity: formatQuantity(pool.unknown),
      })
    }
    finalPools.set(
      accountId,
      list.sort((a, b) => a.assetId.localeCompare(b.assetId)),
    )
  }

  return { steps, pools: finalPools, gains, movementCosts, openingUnknown }
}

/** The account's invested step in force just before `at` (epoch ms). */
export function stepBefore(
  basis: Pick<CostBasis, 'steps'>,
  accountId: string,
  at: number,
): InvestedStep | null {
  const list = basis.steps.get(accountId)
  if (!list || list.length === 0 || list[0].at >= at) return null
  let low = 0
  let high = list.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (list[middle].at < at) low = middle
    else high = middle - 1
  }
  return list[low]
}

/** Exact decimal × 10^18 → `bigint` (for callers holding decimal strings). */
export function toUnits(quantity: string): bigint {
  const negative = quantity.startsWith('-')
  const text = negative ? quantity.slice(1) : quantity
  const [integer, fraction = ''] = text.split('.')
  const units =
    BigInt(integer || '0') * ONE +
    BigInt((fraction + '0'.repeat(18)).slice(0, 18))
  return negative ? -units : units
}
