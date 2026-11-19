import {
  BarChart,
  formatMonthLong,
  formatMonthShort,
  NativeSelect,
  NativeSelectOption,
} from '@finances/ui'
import type { ChartConfig, ChartDatum } from '@finances/ui'
import { useMemo } from 'react'
import type { SpendingTrendDto } from '#/api/types.gen'
import { seriesColor, seriesLabel, UNCATEGORIZED_LABEL } from './labels'
import { SpendingCategoryIcon } from './SpendingCategoryIcon'
import { UNCATEGORIZED } from './search'

export interface TrendCategoryOption {
  id: string
  name: string
}

interface SpendingTrendProps {
  data: SpendingTrendDto
  /** Category shown alone (`none` = uncategorized), or all when undefined. */
  selected: string | undefined
  onSelectedChange: (next: string | undefined) => void
  categories: readonly TrendCategoryOption[]
}

/** Data keys must be CSS-safe: they become `--color-<key>` variables. */
function seriesKey(key: string): string {
  return `s-${key}`
}

/**
 * Monthly spending over the last months: the top categories stacked (plus
 * "Autres"), or one category alone with its average as a reference line.
 */
export function SpendingTrend({
  data,
  selected,
  onSelectedChange,
  categories,
}: SpendingTrendProps) {
  const { rows, config } = useMemo(() => {
    const seriesConfig: ChartConfig = Object.fromEntries(
      data.series.map((series) => [
        seriesKey(series.key),
        {
          label: seriesLabel(series),
          color: seriesColor(series),
          icon: (
            <SpendingCategoryIcon
              item={series.type === 'other' ? 'other' : series}
              size="sm"
            />
          ),
        },
      ]),
    )
    const monthRows: ChartDatum[] = data.months.map((month, index) => ({
      month,
      ...Object.fromEntries(
        data.series.map((series) => [
          seriesKey(series.key),
          series.valuesCents[index],
        ]),
      ),
    }))
    return { rows: monthRows, config: seriesConfig }
  }, [data])

  const single = selected !== undefined
  const name = single
    ? selected === UNCATEGORIZED
      ? UNCATEGORIZED_LABEL
      : (categories.find((c) => c.id === selected)?.name ?? 'Catégorie')
    : 'Principales catégories'
  const empty = data.totalsCents.every((value) => value === 0)
  const first = data.months[0]
  const last = data.months.at(-1)

  return (
    <div className="space-y-3">
      <NativeSelect
        aria-label="Catégorie de la tendance"
        value={selected ?? ''}
        onChange={(event) => onSelectedChange(event.target.value || undefined)}
        className="w-full @2xl:w-64"
      >
        <NativeSelectOption value="">Principales catégories</NativeSelectOption>
        {categories.map((category) => (
          <NativeSelectOption key={category.id} value={category.id}>
            {category.name}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value={UNCATEGORIZED}>
          {UNCATEGORIZED_LABEL}
        </NativeSelectOption>
      </NativeSelect>

      {empty ? (
        <div className="text-muted-foreground flex h-[220px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm">
          Aucune dépense sur ces {data.months.length} mois
        </div>
      ) : (
        <BarChart
          data={rows}
          index="month"
          config={config}
          stacked={!single}
          height={220}
          indexFormatter={formatMonthShort}
          tooltipIndexFormatter={formatMonthLong}
          showLegend={!single}
          dataTable="details"
          indexLabel="Mois"
          label={`Dépenses par mois, ${name.toLowerCase()}, de ${first ? formatMonthLong(first) : ''} à ${last ? formatMonthLong(last) : ''}`}
          referenceLines={
            data.averageCents !== null
              ? [{ value: data.averageCents, label: 'Moyenne' }]
              : undefined
          }
        />
      )}
      {data.averageCents !== null && !empty && (
        <p className="text-muted-foreground text-xs">
          Ligne pointillée : moyenne des {data.averageMonths} mois complets
          affichés.
        </p>
      )}
    </div>
  )
}
