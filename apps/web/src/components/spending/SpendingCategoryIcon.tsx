import { CategoryIcon } from '@capi/ui'
import { CircleHelpIcon, EllipsisIcon } from 'lucide-react'
import { OTHER_COLOR, UNCATEGORIZED_COLOR } from './labels'

interface SpendingCategoryIconProps {
  /**
   * A category (id, icon, colour), an Épargne account (`accountId`), the
   * bucket without either (`categoryId` null) or the remaining ones folded
   * together (`other`).
   */
  item:
    | {
        categoryId: string | null
        accountId?: string | null
        icon: string | null
        color: string | null
      }
    | 'other'
  size?: 'sm' | 'md'
}

/**
 * `CategoryIcon` of a Dépenses row or series (#287): a question mark for the
 * expenses without a category, an ellipsis for « Autres ».
 */
export function SpendingCategoryIcon({
  item,
  size = 'md',
}: SpendingCategoryIconProps) {
  if (item === 'other') {
    return (
      <CategoryIcon
        icon={null}
        color={OTHER_COLOR}
        fallback={EllipsisIcon}
        size={size}
      />
    )
  }
  if (item.categoryId === null && !item.accountId) {
    return (
      <CategoryIcon
        icon={null}
        color={UNCATEGORIZED_COLOR}
        fallback={CircleHelpIcon}
        size={size}
      />
    )
  }
  return <CategoryIcon icon={item.icon} color={item.color} size={size} />
}
