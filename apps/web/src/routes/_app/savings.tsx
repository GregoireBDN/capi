import { createFileRoute } from '@tanstack/react-router'
import { PiggyBankIcon } from 'lucide-react'
import { PlaceholderPage } from '#/components/app-shell/PlaceholderPage'

export const Route = createFileRoute('/_app/savings')({
  head: () => ({ meta: [{ title: 'Épargne · Finances' }] }),
  component: () => (
    <PlaceholderPage
      title="Épargne"
      icon={PiggyBankIcon}
      description="L'évolution de votre épargne et de vos placements (PEA, assurance vie, épargne salariale, crypto) apparaîtra ici."
    />
  ),
})
