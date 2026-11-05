import { createFileRoute } from '@tanstack/react-router'
import { ReviewQueue } from '#/components/review/ReviewQueue'

export const Route = createFileRoute('/_app/review')({
  head: () => ({ meta: [{ title: 'À revoir · Finances' }] }),
  component: ReviewQueue,
})
