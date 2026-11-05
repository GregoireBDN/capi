import { queryOptions } from '@tanstack/react-query'
import {
  accountsControllerList,
  categoriesControllerList,
  importsControllerList,
} from '#/api'
import type { AccountDto } from '#/api'

/** Error raised from a generated-client result, keeping the HTTP status. */
export class ApiRequestError extends Error {
  constructor(
    /** HTTP status, or null when the request never got a response. */
    readonly status: number | null,
    /** The API's `message` (English, for logs/mapping only — never shown). */
    readonly apiMessage: string | null,
  ) {
    super(apiMessage ?? `HTTP ${status ?? 'network error'}`)
    this.name = 'ApiRequestError'
  }
}

interface ClientResult<T> {
  data?: T
  error?: unknown
  response?: Response
}

/** Nest error bodies carry `message` as a string or a list of strings. */
function apiMessageOf(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message
    if (typeof message === 'string') return message
    if (Array.isArray(message)) return message.join('; ')
  }
  return null
}

/**
 * Turns a `throwOnError: false` result into data or an `ApiRequestError`, for
 * TanStack Query functions and mutations.
 */
export async function unwrap<T>(call: Promise<ClientResult<T>>): Promise<T> {
  const result = await call
  if (result.error !== undefined || !result.response?.ok) {
    throw new ApiRequestError(
      result.response?.status ?? null,
      apiMessageOf(result.error),
    )
  }
  return result.data as T
}

export const importKeys = {
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  imports: ['imports'] as const,
}

export const accountsQuery = queryOptions({
  queryKey: importKeys.accounts,
  queryFn: () => unwrap(accountsControllerList({ throwOnError: false })),
})

export const categoriesQuery = queryOptions({
  queryKey: importKeys.categories,
  queryFn: () => unwrap(categoriesControllerList({ throwOnError: false })),
  staleTime: 5 * 60_000,
})

export const importsQuery = queryOptions({
  queryKey: importKeys.imports,
  queryFn: () => unwrap(importsControllerList({ throwOnError: false })),
})

/** Only checking and savings accounts are fed by bank exports. */
export function isTransactional(account: AccountDto): boolean {
  return account.type === 'checking' || account.type === 'savings'
}

/** Largest file the API accepts (mirrors `IMPORT_FILE_MAX_BYTES`). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

/** Not a route of this branch yet: the review queue ships separately. */
export const REVIEW_PATH = '/review'
