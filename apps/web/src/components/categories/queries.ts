import type { QueryClient } from '@tanstack/react-query'
import {
  categoriesControllerCreate,
  categoriesControllerRemove,
  categoriesControllerUpdate,
  categoriesControllerUsage,
} from '#/api'
import type { CreateCategoryDto, UpdateCategoryDto } from '#/api/types.gen'
import { unwrap } from '#/lib/queries'

export const createCategory = (body: CreateCategoryDto) =>
  unwrap(categoriesControllerCreate({ body, throwOnError: false }))

export const updateCategory = (id: string, body: UpdateCategoryDto) =>
  unwrap(
    categoriesControllerUpdate({ path: { id }, body, throwOnError: false }),
  )

export const fetchCategoryUsage = (id: string) =>
  unwrap(categoriesControllerUsage({ path: { id }, throwOnError: false }))

export const deleteCategory = (id: string, reassignTo?: string) =>
  unwrap(
    categoriesControllerRemove({
      path: { id },
      ...(reassignTo ? { query: { reassignTo } } : {}),
      throwOnError: false,
    }),
  )

/**
 * Names and colours show on every page (charts, budget, transactions): refetch
 * everything so they change right away.
 */
export async function afterCategoriesChanged(queryClient: QueryClient) {
  await queryClient.invalidateQueries()
}
