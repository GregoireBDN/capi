/**
 * Rule order helpers. The API takes every rule id, first = highest priority
 * (`POST /categorization-rules/reorder`); the page reorders a copy locally,
 * shows it at once and sends the whole list.
 */

/** `items` with the item at `from` moved to index `to` (clamped). */
export function moveItem<T>(
  items: readonly T[],
  from: number,
  to: number,
): T[] {
  const next = [...items]
  if (from < 0 || from >= next.length) return next
  const target = Math.max(0, Math.min(to, next.length - 1))
  if (target === from) return next
  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved)
  return next
}

/** `items` with the one whose id is `id` moved one step up (-1) or down (+1). */
export function moveById<T extends { id: string }>(
  items: readonly T[],
  id: string,
  step: -1 | 1,
): T[] {
  const from = items.findIndex((item) => item.id === id)
  return from === -1 ? [...items] : moveItem(items, from, from + step)
}

/**
 * Where a dragged rule lands when dropped on `overId`: in its place, so the
 * rule it was dropped on shifts down (dragged upwards) or up (downwards).
 */
export function moveOnto<T extends { id: string }>(
  items: readonly T[],
  draggedId: string,
  overId: string,
): T[] {
  const from = items.findIndex((item) => item.id === draggedId)
  const to = items.findIndex((item) => item.id === overId)
  if (from === -1 || to === -1) return [...items]
  return moveItem(items, from, to)
}
