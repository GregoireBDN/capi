/**
 * Toasts rise above a sticky bottom bar (#380): a bar marked with
 * `data-sticky-bottom-bar` (the transactions' bulk actions, the month close,
 * « Ajouter une catégorie ») would otherwise sit under the toast, its « Classer
 * » hidden by an « Annuler ». The toaster's bottom offset is the larger of its
 * own and `--toast-bottom-clearance`, which this keeps up to date.
 */

/** Attribute that marks a bar pinned to the bottom of the page. */
export const STICKY_BOTTOM_BAR_ATTRIBUTE = 'data-sticky-bottom-bar'

/** CSS variable read by the toaster's bottom offset. */
export const TOAST_CLEARANCE_VARIABLE = '--toast-bottom-clearance'

/** Space between the bar's top edge and the toast above it. */
export const TOAST_BAR_GAP = 8

/**
 * A bar whose bottom is above this band at the bottom of the screen (the
 * height a toast takes there) is out of the toasts' way.
 */
export const TOAST_ZONE_HEIGHT = 160

interface BarRect {
  top: number
  bottom: number
}

/**
 * How far from the bottom of the viewport the toasts must start to clear the
 * bars on screen, in px; 0 when no bar is in their way. A bar counts when it
 * is shown (not empty), reaches into the bottom band and is not below the
 * screen.
 */
export function bottomBarClearance(
  bars: readonly BarRect[],
  viewportHeight: number,
): number {
  let clearance = 0
  for (const bar of bars) {
    if (bar.bottom <= bar.top) continue
    if (bar.top >= viewportHeight) continue
    if (bar.bottom < viewportHeight - TOAST_ZONE_HEIGHT) continue
    clearance = Math.max(clearance, viewportHeight - bar.top + TOAST_BAR_GAP)
  }
  return Math.round(clearance)
}
