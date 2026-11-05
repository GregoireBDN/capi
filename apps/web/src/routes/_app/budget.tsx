import { createFileRoute } from '@tanstack/react-router'
import { TargetIcon } from 'lucide-react'
import { PlaceholderPage } from '#/components/app-shell/PlaceholderPage'

export const Route = createFileRoute('/_app/budget')({
  head: () => ({ meta: [{ title: 'Budget · Finances' }] }),
  component: () => (
    <PlaceholderPage
      title="Budget"
      icon={TargetIcon}
      description="Vous suivrez ici vos dépenses de chaque catégorie par rapport à vos objectifs mensuels."
    />
  ),
})
