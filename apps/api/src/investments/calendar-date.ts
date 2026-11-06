import { BadRequestException, type PipeTransform } from '@nestjs/common'

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** A `YYYY-MM-DD` string naming a day that exists (no `2026-02-30`). */
export function isCalendarDate(value: string): boolean {
  const match = DAY_PATTERN.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  )
}

/** Route parameter pipe: rejects anything but an existing calendar date. */
export class ParseCalendarDatePipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isCalendarDate(value)) {
      throw new BadRequestException('date must be an existing YYYY-MM-DD date')
    }
    return value
  }
}
