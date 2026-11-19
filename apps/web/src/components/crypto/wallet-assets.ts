import type { SnapshotDto, ValuedHoldingDto } from '#/api/types.gen'
import { sumQuantities } from './format'

/*
 * The wallet page's figures (#294): holdings by asset, the split by asset
 * and the chart's ranges. Pure functions, tested on their own.
 */

/** One asset of the wallet, its lines (one per chain) summed exactly. */
export interface WalletAsset {
  assetId: string
  symbol: string
  name: string
  quantity: string
  /** Null when no line of it has a price. */
  valueCents: number | null
  lines: ValuedHoldingDto[]
  /** The line whose price is shown (they share the asset's price). */
  priced: ValuedHoldingDto | null
}

/**
 * The holdings by asset (#294): ETH read on Ethereum and Arbitrum is one
 * asset; priced assets by value, largest first, those without a price after
 * them by symbol.
 */
export function groupHoldings(
  holdings: readonly ValuedHoldingDto[],
): WalletAsset[] {
  const byAsset = new Map<string, ValuedHoldingDto[]>()
  for (const holding of holdings) {
    byAsset.set(holding.assetId, [
      ...(byAsset.get(holding.assetId) ?? []),
      holding,
    ])
  }
  const assets = [...byAsset.values()].map((lines): WalletAsset => {
    const valued = lines.filter((line) => line.valueCents !== null)
    return {
      assetId: lines[0].assetId,
      symbol: lines[0].symbol,
      name: lines[0].name,
      quantity: sumQuantities(lines.map((line) => line.quantity)),
      valueCents:
        valued.length === 0
          ? null
          : valued.reduce((sum, line) => sum + (line.valueCents ?? 0), 0),
      // The largest line first (Ethereum before Arbitrum).
      lines: [...lines].sort(
        (a, b) => (b.valueCents ?? 0) - (a.valueCents ?? 0),
      ),
      priced: lines.find((line) => line.priceEur !== null) ?? null,
    }
  })
  return assets.sort((a, b) =>
    a.valueCents === null || b.valueCents === null
      ? a.valueCents === b.valueCents
        ? a.symbol.localeCompare(b.symbol)
        : a.valueCents === null
          ? 1
          : -1
      : b.valueCents - a.valueCents || a.symbol.localeCompare(b.symbol),
  )
}

/** Colours of the split, by weight; the rest share `--chart-other`. */
const SPLIT_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
]

/** « 55 % », « < 1 % ». */
export function shareText(valueCents: number, totalCents: number): string {
  const share = (valueCents / totalCents) * 100
  return share > 0 && share < 1 ? '< 1 %' : `${Math.round(share)} %`
}

export interface SplitPart {
  key: string
  label: string
  valueCents: number
  color: string
}

/** The four largest assets, then « Autres ». */
export function splitParts(assets: readonly WalletAsset[]): SplitPart[] {
  const valued = assets.filter(
    (asset): asset is WalletAsset & { valueCents: number } =>
      asset.valueCents !== null && asset.valueCents > 0,
  )
  const top = valued.slice(0, valued.length > 5 ? 4 : 5)
  const rest = valued.slice(top.length)
  return [
    ...top.map((asset, index) => ({
      key: asset.assetId,
      label: asset.symbol,
      valueCents: asset.valueCents,
      color: SPLIT_COLORS[index] ?? 'var(--chart-5)',
    })),
    ...(rest.length > 0
      ? [
          {
            key: 'others',
            label: 'Autres',
            valueCents: rest.reduce((sum, asset) => sum + asset.valueCents, 0),
            color: 'var(--chart-other)',
          },
        ]
      : []),
  ]
}

export type Range = '6m' | '1y' | 'all'

export const RANGE_LABELS: Record<Range, string> = {
  '6m': '6 mois',
  '1y': '1 an',
  all: 'Tout',
}

/** `2026-11-19` minus `months` months (clamped to the month's end). */
export function monthsBefore(day: string, months: number): string {
  const [year, month, date] = day.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 - months, 1))
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  target.setUTCDate(Math.min(date, last))
  return target.toISOString().slice(0, 10)
}

/** The ranges that show something more than the shorter one. */
export function chartRanges(
  snapshots: readonly SnapshotDto[],
  today: string,
): Range[] {
  const first = snapshots[0]?.date
  if (!first) return []
  const ranges: Range[] = []
  if (first < monthsBefore(today, 6)) ranges.push('6m')
  if (first < monthsBefore(today, 12)) ranges.push('1y')
  return ranges.length === 0 ? [] : [...ranges, 'all']
}
