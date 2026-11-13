import { Skeleton } from '@finances/ui'

/**
 * Router pending component (`defaultPendingComponent`): a generic page
 * skeleton shown in place of the previous page when a navigation takes longer
 * than the router's `defaultPendingMs` (route guard on a slow network), so a
 * tap doesn't look ignored. Pages then show their own skeletons while their
 * data loads.
 */
export function PagePending() {
  return (
    <div
      role="status"
      aria-label="Chargement de la page"
      className="w-full space-y-6"
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="hidden h-20 md:block" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </div>
  )
}
