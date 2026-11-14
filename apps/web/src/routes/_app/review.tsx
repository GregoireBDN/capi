import { createFileRoute } from '@tanstack/react-router'
import { ReviewQueue } from '#/components/review/ReviewQueue'
import { StaleValuesReminder } from '#/components/review/StaleValuesReminder'

export const Route = createFileRoute('/_app/review')({
  head: () => ({ meta: [{ title: 'À revoir · Finances' }] }),
  component: ReviewPage,
})

function ReviewPage() {
  return <ReviewQueue reminder={<StaleValuesReminder />} />
}
