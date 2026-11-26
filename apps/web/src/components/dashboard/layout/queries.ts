import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  dashboardLayoutControllerGet,
  dashboardLayoutControllerReplace,
  dashboardLayoutControllerReset,
} from '#/api'
import type { DashboardLayoutDto, DashboardWidgetDto } from '#/api/types.gen'
import { unwrap } from '#/lib/queries'

export const layoutKeys = {
  layout: ['dashboard', 'layout'] as const,
}

/** The dashboard's elements (#495), today's layout while none is saved. */
export const dashboardLayoutQuery = queryOptions({
  queryKey: layoutKeys.layout,
  queryFn: () => unwrap(dashboardLayoutControllerGet({ throwOnError: false })),
})

function store(client: QueryClient) {
  return (layout: DashboardLayoutDto) => {
    client.setQueryData(layoutKeys.layout, layout)
    return layout
  }
}

/** Saves the whole layout. */
export function saveDashboardLayout(
  client: QueryClient,
  widgets: DashboardWidgetDto[],
) {
  return unwrap(
    dashboardLayoutControllerReplace({
      body: { widgets },
      throwOnError: false,
    }),
  ).then(store(client))
}

/** Back to today's dashboard. */
export function resetDashboardLayout(client: QueryClient) {
  return unwrap(dashboardLayoutControllerReset({ throwOnError: false })).then(
    store(client),
  )
}
