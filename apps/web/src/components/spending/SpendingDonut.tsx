import { DonutChart, formatWholeEuros } from '@capi/ui'
import type { SpendingByCategoryDto } from '#/api/types.gen'
import {
  categoryColor,
  categoryKey,
  categoryLabel,
  OTHER_LABEL,
} from './labels'
import { FIGURE_LABEL, KIND_LABEL, NOTHING, RANKING_TITLE } from './kinds'
import { SpendingCategoryIcon } from './SpendingCategoryIcon'

/**
 * The month's part by row (expenses or income by category, savings by
 * account); small slices fold into "Autres". Only rows with a positive net
 * amount get a slice, but the centre shows the month's net total (refunds,
 * withdrawals included) so it matches the tile and the transactions page.
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
      label: categoryLabel(item, data.kind),
      value: item.spentCents,
      color: categoryColor(item),
      icon: <SpendingCategoryIcon item={item} size="sm" />,
    }))
  return (
    <DonutChart
      data={slices}
      otherLabel={OTHER_LABEL}
      otherIcon={<SpendingCategoryIcon item="other" size="sm" />}
      centerLabel={FIGURE_LABEL[data.kind]}
      centerFormatter={() => formatWholeEuros(data.totalCents)}
      height={220}
      label={`${KIND_LABEL[data.kind]} de ${monthLabel} ${RANKING_TITLE[data.kind].toLowerCase()}`}
      emptyMessage={`${NOTHING[data.kind]} ce mois-ci`}
    />
  )
}
