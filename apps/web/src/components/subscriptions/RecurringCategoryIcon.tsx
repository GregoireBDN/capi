import { CategoryIcon } from '@finances/ui'
import { CircleHelpIcon } from 'lucide-react'
import type { ForecastItemDto, RecurringItemDto } from '#/api/types.gen'

interface RecurringCategoryIconProps {
  item: Pick<
    RecurringItemDto | ForecastItemDto,
    'categoryName' | 'categoryIcon' | 'categoryColor'
  >
  size?: 'sm' | 'md'
}

/**
 * `CategoryIcon` of a recurring item or of an expected debit (#288): a
 * question mark when it has no category.
 */
export function RecurringCategoryIcon({
  item,
  size = 'md',
}: RecurringCategoryIconProps) {
  return (
    <CategoryIcon
      icon={item.categoryIcon}
      color={item.categoryColor}
      fallback={item.categoryName === null ? CircleHelpIcon : undefined}
      size={size}
    />
  )
}
