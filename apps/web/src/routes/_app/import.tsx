import { createFileRoute } from '@tanstack/react-router'
import { UploadIcon } from 'lucide-react'
import { PlaceholderPage } from '#/components/app-shell/PlaceholderPage'

export const Route = createFileRoute('/_app/import')({
  head: () => ({ meta: [{ title: 'Import · Finances' }] }),
  component: () => (
    <PlaceholderPage
      title="Import"
      icon={UploadIcon}
      description="Vous pourrez bientôt importer vos relevés bancaires CSV, avec un aperçu des nouvelles opérations et des doublons avant validation."
    />
  ),
})
