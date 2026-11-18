import { cn } from '@finances/ui/lib/utils'
import type { CategoryIcon } from '#/api/types.gen'
import { CATEGORY_ICON_KEYS, CATEGORY_ICONS } from './category-icons'

interface IconPickerProps {
  value: CategoryIcon | null
  onChange: (icon: CategoryIcon) => void
  /** Colour of the category, for the chosen icon. */
  color: string
  /** Accessible name of the group, e.g. "Icône de Courses". */
  label: string
  disabled?: boolean
}

/** Icon choice for a category (#266): a grid of 44px buttons. */
export function IconPicker({
  value,
  onChange,
  color,
  label,
  disabled,
}: IconPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1"
    >
      {CATEGORY_ICON_KEYS.map((key) => {
        const { icon: Icon, label: name } = CATEGORY_ICONS[key]
        const selected = key === value
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={name}
            title={name}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={cn(
              'text-muted-foreground hover:bg-muted focus-visible:ring-ring flex size-8 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50',
              selected && 'ring-foreground ring-2',
            )}
            style={
              selected
                ? {
                    color,
                    backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
                  }
                : undefined
            }
          >
            <Icon className="size-[0.9rem]" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
