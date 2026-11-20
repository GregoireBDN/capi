/**
 * The avatar's letters (#386): the first letter of the first two words of
 * the name, in capitals (« Camille Dupont » → « CD », « camille » → « C »),
 * « ? » for an empty name.
 */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toLocaleUpperCase('fr-FR') ?? '')
    .join('')
  return letters === '' ? '?' : letters
}
