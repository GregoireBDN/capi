import { createFileRoute } from '@tanstack/react-router'
import { ArrowLeftRightIcon } from 'lucide-react'
import { PlaceholderPage } from '#/components/app-shell/PlaceholderPage'

export const Route = createFileRoute('/_app/transactions')({
  head: () => ({ meta: [{ title: 'Opérations · Finances' }] }),
  component: () => (
    <PlaceholderPage
      title="Opérations"
      icon={ArrowLeftRightIcon}
      description="Retrouvez bientôt ici toutes vos opérations importées, catégorisées automatiquement et faciles à filtrer."
    />
  ),
})
