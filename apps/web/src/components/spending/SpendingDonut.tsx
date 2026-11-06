import { DonutChart, formatWholeEuros } from '@finances/ui'
import type { SpendingByCategoryDto } from '#/api/types.gen'
import { categoryColor, categoryKey, categoryLabel } from './labels'

/**
 * The month's spending by category; small slices fold into "Autres". Only
 * categories with net spending get a slice, but the centre shows the month's
 * net total (refunds included) so it matches the KPI and the transactions page.
 */
export function SpendingDonut({
  data,
  monthLabel,
}: {
  data: SpendingByCategoryDto
  monthLabel: string
}) {
  const slices = data.categories
    .filter((item) => item.spentCents > 0)
    .map((item) => ({
      id: categoryKey(item),
      label: categoryLabel(item),
      value: item.spentCents,
      color: categoryColor(item),
    }))
  return (
    <DonutChart
      data={slices}
      centerLabel="Dépensé"
      centerFormatter={() => formatWholeEuros(data.totalCents)}
      height={220}
      label={`Dépenses de ${monthLabel} par catégorie`}
      emptyMessage="Aucune dépense ce mois-ci"
    />
  )
}
