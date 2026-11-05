/**
 * Folds text for `contains` matching: accents removed, lower case, every run
 * of non-alphanumeric characters (spaces, `/`, `*`, `.`, `-`, ...) collapsed
 * into a single space, trimmed.
 *
 * Applied to both the rule pattern and the transaction text, so
 * `"Café du Coin"` matches `"PAIEMENT CB CAFE  DU/COIN"`.
 */
export function foldForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
