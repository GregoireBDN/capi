import type {
  CategorySpendingDto,
  SpendingByCategoryDto,
  SpendingTrendSeriesDto,
} from '#/api/types.gen'
import { formatMonth } from '#/lib/calendar'
import { comparedDays } from '#/lib/period'
import { UNCATEGORIZED } from './search'

/** Name of the bucket of expenses without a category. */
export const UNCATEGORIZED_LABEL = 'Non catégorisé'
/** Name of the remaining categories folded together. */
export const OTHER_LABEL = 'Autres'

/**
 * Neutral swatch of the uncategorized bucket: distinct from "Autres"
 * (`--chart-other`) and from every category colour.
 */
export const UNCATEGORIZED_COLOR = 'var(--chart-target)'

/** Colour of « Autres », the remaining categories folded together. */
export const OTHER_COLOR = 'var(--chart-other)'

/** Stable identifier of a ranked category (`none` for the uncategorized bucket). */
export function categoryKey(item: { categoryId: string | null }): string {
  return item.categoryId ?? UNCATEGORIZED
}

export function categoryLabel(item: CategorySpendingDto): string {
  return item.name ?? UNCATEGORIZED_LABEL
}

/** Colour of a category; `undefined` lets the chart pick a categorical slot. */
export function categoryColor(item: {
  categoryId: string | null
  color: string | null
}): string | undefined {
  if (item.categoryId === null) return UNCATEGORIZED_COLOR
  return item.color ?? undefined
}

export function seriesLabel(series: SpendingTrendSeriesDto): string {
  if (series.type === 'other') return OTHER_LABEL
  return series.name ?? UNCATEGORIZED_LABEL
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
