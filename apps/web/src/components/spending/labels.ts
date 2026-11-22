import type {
  CategorySpendingDto,
  SpendingByCategoryDto,
  SpendingKind,
  SpendingTrendSeriesDto,
} from '#/api/types.gen'
import { formatMonth } from '#/lib/calendar'
import { comparedDays } from '#/lib/period'
import { UNCATEGORIZED } from './search'

/** Name of the bucket of expenses without a category. */
export const UNCATEGORIZED_LABEL = 'Non catégorisé'
/** Épargne's bucket: moves to investments whose account is not known. */
export const UNKNOWN_ACCOUNT_LABEL = 'Compte non précisé'
/** Name of the remaining categories folded together. */
export const OTHER_LABEL = 'Autres'

/**
 * Neutral swatch of the uncategorized bucket: distinct from "Autres"
 * (`--chart-other`) and from every category colour.
 */
export const UNCATEGORIZED_COLOR = 'var(--chart-target)'

/** Colour of « Autres », the remaining categories folded together. */
export const OTHER_COLOR = 'var(--chart-other)'

/**
 * Stable identifier of a ranked row: its category, its account (Épargne),
 * or `none` for the bucket without either.
 */
export function categoryKey(item: {
  categoryId: string | null
  accountId?: string | null
}): string {
  return item.categoryId ?? item.accountId ?? UNCATEGORIZED
}

export function categoryLabel(
  item: Pick<CategorySpendingDto, 'name'>,
  kind: SpendingKind = 'expense',
): string {
  return (
    item.name ??
    (kind === 'savings' ? UNKNOWN_ACCOUNT_LABEL : UNCATEGORIZED_LABEL)
  )
}

/** Colour of a row; `undefined` lets the chart pick a categorical slot. */
export function categoryColor(item: {
  categoryId: string | null
  accountId?: string | null
  color: string | null
}): string | undefined {
  if (item.categoryId === null && !item.accountId) return UNCATEGORIZED_COLOR
  return item.color ?? undefined
}

export function seriesLabel(
  series: SpendingTrendSeriesDto,
  kind: SpendingKind = 'expense',
): string {
  if (series.type === 'other') return OTHER_LABEL
  return (
    series.name ??
    (kind === 'savings' ? UNKNOWN_ACCOUNT_LABEL : UNCATEGORIZED_LABEL)
  )
}

export function seriesColor(
  series: SpendingTrendSeriesDto,
): string | undefined {
  if (series.type === 'other') return OTHER_COLOR
  if (series.type === 'uncategorized') return UNCATEGORIZED_COLOR
  return series.color ?? undefined
}

/** `2026-10` → "octobre" (the year only when it differs from `reference`'s). */
export function monthName(month: string, reference?: string): string {
  const label = formatMonth(month).toLowerCase()
  if (reference && reference.slice(0, 4) === month.slice(0, 4)) {
    return label.replace(/\s\d{4}$/, '')
  }
  return label
}

/**
 * What the month is compared with: the previous month's name ("octobre"),
 * or its same first days while the month is partial ("1–3 oct.").
 */
export function comparedName(
  data: Pick<SpendingByCategoryDto, 'period' | 'previousMonth' | 'month'>,
): string {
  return comparedDays(data.period) ?? monthName(data.previousMonth, data.month)
}
