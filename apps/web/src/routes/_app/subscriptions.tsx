import { createFileRoute } from '@tanstack/react-router'
import { SubscriptionsPage } from '#/components/subscriptions/SubscriptionsPage'

export const Route = createFileRoute('/_app/subscriptions')({
  head: () => ({ meta: [{ title: 'Abonnements · Finances' }] }),
  component: SubscriptionsPage,
})
