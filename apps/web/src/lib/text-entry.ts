/** Whether `element` takes typed text (key handlers must not steal its keys). */
export function isTextEntry(element: Element | null): boolean {
  if (!element) return false
  if (element instanceof HTMLTextAreaElement) return true
  if (element instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit'].includes(element.type)
  }
  return element instanceof HTMLElement && element.isContentEditable
}
