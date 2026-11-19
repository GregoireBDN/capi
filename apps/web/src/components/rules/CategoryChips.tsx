import { cn, Input, useIsMobile } from '@finances/ui'
import { SearchIcon } from 'lucide-react'
import { useState } from 'react'
import type { CategoryDto, TransactionKind } from '#/api/types.gen'
import { categoryIconComponent } from '#/components/categories/category-icons'
import {
  KIND_GROUP_LABELS,
  TRANSACTION_KINDS,
} from '#/components/transactions/labels'
import { pickableCategories } from '#/lib/categories'

/** Lowercase, without accents, for the search. */
function searchable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * Every category as a chip with its icon, by kind, with a search: one tap
 * picks it (the editor's « Classer dans » step, #299).
 */
export function CategoryChips({
  categories,
  value,
  onPick,
}: {
  categories: readonly CategoryDto[]
  value: string
  onPick: (categoryId: string) => void
}) {
  // Phones: no keyboard over the chips until the search is tapped.
  const isMobile = useIsMobile()
  const [query, setQuery] = useState('')
  const wanted = searchable(query.trim())
  const shown = pickableCategories(categories, value).filter(
    (category) => wanted === '' || searchable(category.name).includes(wanted),
  )
  const current = categories.find((c) => c.id === value)?.kind
  const kinds: TransactionKind[] = current
    ? [current, ...TRANSACTION_KINDS.filter((kind) => kind !== current)]
    : [...TRANSACTION_KINDS]
  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-[0.8rem] -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          type="search"
          autoFocus={!isMobile}
          aria-label="Rechercher une catégorie"
          placeholder="Rechercher"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
        />
      </div>
      {shown.length === 0 && (
        <p className="text-muted-foreground text-sm">Aucune catégorie.</p>
      )}
      {kinds.map((kind) => {
        const group = shown.filter((category) => category.kind === kind)
        if (group.length === 0) return null
        return (
          <section key={kind} className="space-y-2">
            <h4 className="text-muted-foreground text-xs font-medium">
              {KIND_GROUP_LABELS[kind]}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {group.map((category) => {
                const Icon = categoryIconComponent(category.icon)
                const selected = category.id === value
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPick(category.id)}
                    className={cn(
                      'focus-visible:ring-ring/50 inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-sm outline-none focus-visible:ring-[3px]',
                      selected
                        ? 'border-primary bg-primary/10 font-medium'
                        : 'hover:bg-muted/60',
                    )}
                  >
                    <Icon
                      className="size-[0.75rem] shrink-0"
                      style={{ color: category.color ?? undefined }}
                      aria-hidden="true"
                    />
                    {category.name}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
