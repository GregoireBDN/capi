/** What a key does on a focused row of the transactions list. */
export type RowShortcut =
  | 'next'
  | 'previous'
  | 'category'
  | 'note'
  | 'amount'
  | 'oneOff'
  | 'select'
  | 'leave'

const KEYS: Record<string, RowShortcut> = {
  ArrowDown: 'next',
  j: 'next',
  ArrowUp: 'previous',
  k: 'previous',
  c: 'category',
  n: 'note',
  m: 'amount',
  o: 'oneOff',
  x: 'select',
}

/** Whether `element` takes typed text (shortcuts must not steal its keys). */
export function isTextEntry(element: Element | null): boolean {
  if (!element) return false
  if (element instanceof HTMLTextAreaElement) return true
  if (element instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit'].includes(element.type)
  }
  return element instanceof HTMLElement && element.isContentEditable
}

/**
 * Shortcut of a key pressed in a row, or null to leave it to the browser:
 * never while typing in a field or with a modifier; in the row's category
 * select only Escape (back to the row), the arrows choosing a category.
 */
export function rowShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  target: Element,
): RowShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  if (isTextEntry(target)) return null
  if (target instanceof HTMLSelectElement) {
    return event.key === 'Escape' ? 'leave' : null
  }
  return (
    KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key] ?? null
  )
}

/** Whether a key press is "undo" (Ctrl/⌘+Z, not Shift for redo). */
export function isUndoKey(
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
  >,
): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === 'z'
  )
}
