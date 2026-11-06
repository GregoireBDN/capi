import { createFileRoute } from '@tanstack/react-router'
import { SavingsPage } from '#/components/savings/SavingsPage'

export const Route = createFileRoute('/_app/savings')({
  head: () => ({ meta: [{ title: 'Épargne · Finances' }] }),
  component: SavingsPage,
})
