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

export function pickAccount(accounts: AccountDto[], input: string): AccountDto {
  return pick(
    accounts,
    input,
    (a) => [a.name],
    'Le compte',
    (a) => a.name,
  )
}

export async function resolveAccount(
  api: ApiClient,
  input: string,
): Promise<AccountDto> {
  return pickAccount(await listAccounts(api), input)
}

/** Every account, archived ones included. */
export function listAccounts(api: ApiClient): Promise<AccountDto[]> {
  return api.get<AccountDto[]>('/api/accounts', { includeArchived: true })
}

export function listCategories(api: ApiClient): Promise<CategoryDto[]> {
  return api.get<CategoryDto[]>('/api/categories')
}

/** True when `input` names the uncategorized bucket. */
export function isUncategorized(input: string): boolean {
  return [
    'uncategorized',
    'sans categorie',
    'non categorise',
    'aucune',
  ].includes(normalize(input))
}

/** `null` = the uncategorized bucket. */
export function pickCategory(
  categories: CategoryDto[],
  input: string,
): CategoryDto | null {
  if (isUncategorized(input)) return null
  return pick(
    categories,
    input,
    (c) => [c.slug, c.name],
    'La catégorie',
    (c) => `${c.name} (${c.slug})`,
  )
}

/** `null` = the uncategorized bucket. */
export async function resolveCategory(
  api: ApiClient,
  input: string,
): Promise<CategoryDto | null> {
  if (isUncategorized(input)) return null
  return pickCategory(await listCategories(api), input)
}

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
