import type { CategoryIcon } from '#/categories/category-icons'
import type { MonthReportDto, ReportCategoryDto } from './dto/month-close.dto'

/**
 * Version of the report a close writes now (#369). Any later change of what
 * the frozen report holds or means bumps it and adds one step to `STEPS`, so
 * months closed before keep reading as they were frozen.
 *
 * - 1: reports frozen before #369: without `icon` on their categories when
 *   closed before #288, without `plan` when closed before #315.
 * - 2: every category has its `icon` (null when it had none) and the report
 *   its `plan` (null without planned income).
 */
export const REPORT_VERSION = 2

/** What the upgrade steps may take from the live data; never a figure. */
export interface ReportUpgradeContext {
  /** Each category's current icon, by id. */
  icons: ReadonlyMap<string | null, CategoryIcon | null>
}

/** A report of version 1 as it may be stored. */
type ReportV1 = Omit<MonthReportDto, 'categories' | 'plan'> & {
  categories: (Omit<ReportCategoryDto, 'icon'> & {
    icon?: CategoryIcon | null
  })[]
  plan?: MonthReportDto['plan']
}

/**
 * 1 → 2: a category frozen without its icon takes the one it has now (null
 * when it is gone), a report without a plan gets `plan: null`. The icons a
 * report was frozen with stay.
 */
function v1ToV2(report: ReportV1, context: ReportUpgradeContext): unknown {
  return {
    ...report,
    categories: report.categories.map((category) =>
      category.icon !== undefined
        ? category
        : { ...category, icon: context.icons.get(category.categoryId) ?? null },
    ),
    plan: report.plan ?? null,
  }
}

/** `STEPS[v]` turns a report of version `v` into one of version `v + 1`. */
const STEPS: Record<
  number,
  (report: never, context: ReportUpgradeContext) => unknown
> = {
  1: v1ToV2,
}

/**
 * Turns a stored report of any version into the current `MonthReportDto`,
 * one step at a time. It fills what an older shape lacks and never
 * recomputes a figure: a closed month keeps the totals it was closed with.
 */
export function upgradeReport(
  version: number,
  report: unknown,
  context: ReportUpgradeContext,
): MonthReportDto {
  if (!Number.isInteger(version) || version < 1 || version > REPORT_VERSION) {
    throw new Error(`Unknown month report version ${version}`)
  }
  let upgraded = report
  for (let v = version; v < REPORT_VERSION; v++) {
    upgraded = STEPS[v](upgraded as never, context)
  }
  return upgraded as MonthReportDto
}
