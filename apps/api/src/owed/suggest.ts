/**
 * Which open items a repayment transfer most likely covers (#359), so the
 * owner only confirms. Pure, no I/O.
 */

export interface OpenItem {
  id: string
  /** Day of the expense: older items are repaid first. */
  date: string
  /** What is still owed on it, positive cents. */
  leftCents: number
}

export interface SuggestedLink {
  receivableId: string
  amountCents: number
}

export interface RepaymentSuggestion {
  links: SuggestedLink[]
  /** The links add up to the transfer exactly. */
  exact: boolean
}

/** Items searched for a combination; older ones beyond are left out. */
const SEARCH_ITEMS = 20
/** Combinations tried at most, so a long list never stalls a request. */
const SEARCH_BUDGET = 200_000

/**
 * The oldest items that add up to `amountCents` exactly, else the
 * combination closest to it without going over (older items first on a
 * tie), each linked in full. Empty when no item fits.
 */
export function suggestRepayment(
  amountCents: number,
  items: readonly OpenItem[],
): RepaymentSuggestion {
  const open = items
    .filter((item) => item.leftCents > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, SEARCH_ITEMS)
  if (amountCents <= 0 || open.length === 0) return { links: [], exact: false }

  // What the items from `i` on add up to, to prune branches that cannot
  // beat the best sum found so far.
  const suffix = new Array<number>(open.length + 1).fill(0)
  for (let i = open.length - 1; i >= 0; i--) {
    suffix[i] = suffix[i + 1] + open[i].leftCents
  }

  let best: number[] = []
  let bestSum = 0
  let budget = SEARCH_BUDGET
  const chosen: number[] = []

  // Depth first, taking an item before skipping it: the first combination
  // reaching a sum is the one with the oldest items.
  const search = (index: number, sum: number): boolean => {
    if (sum > bestSum) {
      bestSum = sum
      best = [...chosen]
      if (sum === amountCents) return true
    }
    if (index >= open.length || --budget <= 0) return false
    if (sum + suffix[index] <= bestSum) return false
    const left = open[index].leftCents
    if (sum + left <= amountCents) {
      chosen.push(index)
      if (search(index + 1, sum + left)) return true
      chosen.pop()
    }
    return search(index + 1, sum)
  }
  search(0, 0)

  return {
    links: best.map((index) => ({
      receivableId: open[index].id,
      amountCents: open[index].leftCents,
    })),
    exact: bestSum === amountCents,
  }
}

/** Folds case and accents, for matching bank labels with a contact's words. */
export function foldLabel(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whether a bank label contains one of the contact's words. */
export function labelMatches(
  label: string,
  matchLabels: readonly string[],
): boolean {
  const folded = foldLabel(label)
  return matchLabels.some((word) => {
    const needle = foldLabel(word)
    return needle.length > 0 && folded.includes(needle)
  })
}
