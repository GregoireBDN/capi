import { createFileRoute, redirect } from '@tanstack/react-router'
import { REVIEW_SEARCH } from '#/components/transactions/search'
import { ROUTES } from '#/lib/routes'

/**
 * The former review queue (#322): « À revoir » is a filter of Opérations,
 * every date. Old links and bookmarks land there.
 */
export const Route = createFileRoute('/_app/review')({
  beforeLoad: () => {
    throw redirect({ to: ROUTES.transactions, search: REVIEW_SEARCH })
  },
})
