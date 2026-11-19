import { queryOptions } from '@tanstack/react-query'
import { importsControllerList } from '#/api'
import { referenceKeys, unwrap } from '#/lib/queries'

export {
  accountsQuery,
  ApiRequestError,
  categoriesQuery,
  isBankAccount,
  unwrap,
} from '#/lib/queries'

export const importKeys = {
  ...referenceKeys,
  imports: ['imports'] as const,
}

export const importsQuery = queryOptions({
  queryKey: importKeys.imports,
  queryFn: () => unwrap(importsControllerList({ throwOnError: false })),
})

/** Largest file the API accepts (mirrors `IMPORT_FILE_MAX_BYTES`). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
