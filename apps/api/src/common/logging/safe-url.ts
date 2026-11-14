/**
 * Query strings carry the owner's data: the transactions search text
 * (`?q=`: merchant names, label fragments), account and category ids,
 * amount filters. Logs keep the path only (audit F9, #181).
 */
export function pathWithoutQuery(url: string): string
export function pathWithoutQuery(url: string | undefined): string | undefined
export function pathWithoutQuery(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  const end = url.search(/[?#]/)
  return end === -1 ? url : url.slice(0, end)
}
