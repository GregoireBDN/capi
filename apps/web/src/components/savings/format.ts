import { formatMonthLong } from '@finances/ui'

/** `2026-12-31` → `décembre 2026` (projected reach dates are month ends). */
export function formatMonthOf(date: string): string {
  return formatMonthLong(date.slice(0, 7))
}
