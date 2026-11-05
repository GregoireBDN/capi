import type { TransactionCategoryDto } from '#/api/types.gen'

/** Category name with its colour dot. */
export function CategoryBadge({
  category,
}: {
  category: Pick<TransactionCategoryDto, 'name' | 'color'>
}) {
  return (
    <span className="bg-muted inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: category.color ?? 'currentColor' }}
      />
      <span className="truncate">{category.name}</span>
    </span>
  )
}
