/**
 * Whether a key press may move the month (← / →) rather than do what the
 * focused element does with it: not while typing, not inside a widget that
 * uses the arrows itself (radio group, slider, menu, tabs, a scrolled
 * table...), not with a modifier, not while a dialog or sheet is open.
 */
export function isMonthKey(event: KeyboardEvent): 'previous' | 'next' | null {
  if (event.defaultPrevented || event.repeat) return null
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null
  }
  const direction =
    event.key === 'ArrowLeft'
      ? 'previous'
      : event.key === 'ArrowRight'
        ? 'next'
        : null
  if (direction === null) return null

  const target = event.target
  if (target instanceof Element && target !== document.body) {
    // Plain buttons and links do nothing with the arrows; anything else
    // focusable (fields, scrolled regions, roving-focus widgets) might.
    const plain =
      target.matches('button, a[href]') &&
      target.closest(
        '[role=radiogroup], [role=slider], [role=menu], [role=menubar], [role=tablist], [role=listbox], [role=grid], [role=toolbar], [role=group][data-slot=toggle-group]',
      ) === null
    if (!plain) return null
  }
  if (
    document.querySelector(
      '[role=dialog][data-state=open], [role=alertdialog][data-state=open]',
    )
  ) {
    return null
  }
  return direction
}
