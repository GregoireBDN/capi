import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@finances/ui'
import { ChevronDownIcon } from 'lucide-react'
import { Fragment } from 'react'
import type { CategoryDto } from '#/api/types.gen'
import { categoryIconComponent } from '#/components/categories/category-icons'
import { pickableCategories } from '#/lib/categories'
import { KIND_GROUP_LABELS, TRANSACTION_KINDS } from './labels'

interface CategoryMenuProps {
  categories: readonly CategoryDto[]
  /** Selected category id, or null for none. */
  value: string | null
  onChange: (categoryId: string) => void
  /** Accessible name of the trigger, e.g. "Catégorie de Fakemart". */
  label: string
}

/**
 * The category of a row on wide pages (#266): its full name as text, which
 * opens the categories grouped by kind (click, Entrée or Espace). One click
 * picks; the list reads as a list, not as a form field per row.
 */
export function CategoryMenu({
  categories,
  value,
  onChange,
  label,
}: CategoryMenuProps) {
  const current = categories.find((category) => category.id === value)
  const groups = TRANSACTION_KINDS.map((kind) => ({
    kind,
    items: pickableCategories(categories, value).filter(
      (category) => category.kind === kind,
    ),
  })).filter((group) => group.items.length > 0)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={current?.name}
          className="group hover:bg-muted/60 focus-visible:ring-ring/50 data-[state=open]:bg-muted/60 flex max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-left text-sm outline-none focus-visible:ring-[3px]"
        >
          <span
            className={
              current ? 'truncate' : 'text-muted-foreground truncate italic'
            }
          >
            {current?.name ?? 'Choisir une catégorie'}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="text-muted-foreground size-[0.7rem] shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:opacity-100"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[min(26rem,var(--radix-dropdown-menu-content-available-height))] w-64"
      >
        <DropdownMenuRadioGroup value={value ?? ''} onValueChange={onChange}>
          {groups.map((group, index) => (
            <Fragment key={group.kind}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                {KIND_GROUP_LABELS[group.kind]}
              </DropdownMenuLabel>
              {group.items.map((category) => {
                const Icon = categoryIconComponent(category.icon)
                return (
                  <DropdownMenuRadioItem key={category.id} value={category.id}>
                    <Icon
                      aria-hidden="true"
                      className="size-[0.75rem]"
                      style={{ color: category.color ?? undefined }}
                    />
                    {category.name}
                  </DropdownMenuRadioItem>
                )
              })}
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
