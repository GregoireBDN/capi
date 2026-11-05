import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@finances/ui'
import type { CategoryDto } from '#/api/types.gen'
import { KIND_GROUP_LABELS, TRANSACTION_KINDS } from './labels'

interface CategoryPickerProps {
  categories: readonly CategoryDto[]
  /** Selected category id, or null for none. */
  value: string | null
  onChange: (categoryId: string) => void
  /** Accessible name, e.g. "Catégorie de CAFE TEST". */
  label: string
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
}

/**
 * Category select grouped by kind (Dépenses / Revenus / Mouvements internes).
 * A native select: keyboard-friendly and the system picker on phones.
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  label,
  placeholder = 'Choisir une catégorie',
  disabled,
  className,
  id,
}: CategoryPickerProps) {
  return (
    <NativeSelect
      id={id}
      aria-label={label}
      value={value ?? ''}
      disabled={disabled}
      className={className}
      onChange={(event) => {
        if (event.target.value) onChange(event.target.value)
      }}
    >
      <NativeSelectOption value="" disabled>
        {placeholder}
      </NativeSelectOption>
      {TRANSACTION_KINDS.map((kind) => {
        const group = categories.filter((category) => category.kind === kind)
        if (group.length === 0) return null
        return (
          <NativeSelectOptGroup key={kind} label={KIND_GROUP_LABELS[kind]}>
            {group.map((category) => (
              <NativeSelectOption key={category.id} value={category.id}>
                {category.name}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        )
      })}
    </NativeSelect>
  )
}
