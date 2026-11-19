import {
  CATEGORY_ICON_NAMES,
  categoryIconComponent as sharedIconComponent,
} from '@finances/ui'
import { cn } from '@finances/ui/lib/utils'
import { CheckIcon, CircleHelpIcon, SplitIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { CategoryIcon } from '#/api/types.gen'

// The icons and their names live in `@finances/ui` (`category-icon.tsx`,
// #287), shared by the picker and `CategoryIcon`.
export { CATEGORY_ICONS } from '@finances/ui'

/** Icon keys in the order the picker shows them. */
export const CATEGORY_ICON_KEYS: readonly CategoryIcon[] = CATEGORY_ICON_NAMES

/** Icon given to a new category until one is chosen. */
export const DEFAULT_CATEGORY_ICON: CategoryIcon = 'tag'

/** The component of a stored icon; a tag when none (or an unknown one). */
export function categoryIconComponent(icon: string | null): LucideIcon {
  return sharedIconComponent(icon)
}

type AvatarCategory = { color: string | null; icon: string | null }

interface CategoryAvatarProps {
  /** The category, `'split'` for a transaction split between several, or null. */
  category: AvatarCategory | 'split' | null
  selected?: boolean
  /** Adds the warning dot of a transaction to review. */
  review?: boolean
  className?: string
}

/**
 * Round icon of a category, tinted with its colour (`color-mix`, readable in
 * both themes). A check replaces it when the row is selected.
 */
export function CategoryAvatar({
  category,
  selected = false,
  review = false,
  className,
}: CategoryAvatarProps) {
  const Icon = selected
    ? CheckIcon
    : category === 'split'
      ? SplitIcon
      : category === null
        ? CircleHelpIcon
        : categoryIconComponent(category.icon)
  const color =
    category !== null && category !== 'split' ? category.color : null
  const style: CSSProperties | undefined =
    !selected && color
      ? {
          color,
          backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
        }
      : undefined
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex size-7 shrink-0 items-center justify-center rounded-full',
        selected
          ? 'bg-primary text-primary-foreground'
          : !color && 'bg-muted text-muted-foreground',
        className,
      )}
      style={style}
    >
      <Icon className="size-[0.85rem]" />
      {review && !selected && (
        <span className="bg-warning ring-background absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2" />
      )}
    </span>
  )
}
