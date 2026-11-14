import type { ApiClient } from '../api/client.js'
import type { AccountDto, CategoryDto } from '../api/types.js'
import { ToolInputError } from './tool.js'

/** Case- and accent-insensitive comparison key. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim()
}

/** Exact id, then exact name (or slug), then a unique partial match. */
function pick<T extends { id: string }>(
  items: T[],
  input: string,
  keys: (item: T) => string[],
  noun: string,
  display: (item: T) => string,
): T {
  const byId = items.find((item) => item.id === input)
  if (byId) return byId
  const wanted = normalize(input)
  const exact = items.filter((item) =>
    keys(item).some((key) => normalize(key) === wanted),
  )
  if (exact.length === 1 && exact[0]) return exact[0]
  const partial = items.filter((item) =>
    keys(item).some((key) => normalize(key).includes(wanted)),
  )
  if (exact.length === 0 && partial.length === 1 && partial[0])
    return partial[0]
  const candidates = (
    exact.length > 1 ? exact : partial.length > 1 ? partial : items
  )
    .map(display)
    .join(', ')
  const reason =
    exact.length > 1 || partial.length > 1 ? 'est ambigu' : 'est introuvable'
  throw new ToolInputError(
    `${noun} « ${input} » ${reason}. Choix possibles : ${candidates}.`,
  )
}

export async function resolveAccount(
  api: ApiClient,
  input: string,
): Promise<AccountDto> {
  const accounts = await api.get<AccountDto[]>('/api/accounts', {
    includeArchived: true,
  })
  return pick(
    accounts,
    input,
    (a) => [a.name],
    'Le compte',
    (a) => a.name,
  )
}

/** `null` = the uncategorized bucket. */
export async function resolveCategory(
  api: ApiClient,
  input: string,
): Promise<CategoryDto | null> {
  if (
    ['uncategorized', 'sans categorie', 'non categorise', 'aucune'].includes(
      normalize(input),
    )
  ) {
    return null
  }
  const categories = await api.get<CategoryDto[]>('/api/categories')
  return pick(
    categories,
    input,
    (c) => [c.slug, c.name],
    'La catégorie',
    (c) => `${c.name} (${c.slug})`,
  )
}

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
export const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
