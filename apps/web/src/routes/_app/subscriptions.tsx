import { createFileRoute } from '@tanstack/react-router'
import { RepeatIcon } from 'lucide-react'
import { PlaceholderPage } from '#/components/app-shell/PlaceholderPage'

export const Route = createFileRoute('/_app/subscriptions')({
  head: () => ({ meta: [{ title: 'Abonnements · Finances' }] }),
  component: () => (
    <PlaceholderPage
      title="Abonnements"
      icon={RepeatIcon}
      description="Vos abonnements et charges fixes, détectés automatiquement à partir des opérations récurrentes, seront listés ici."
    />
  ),
})
