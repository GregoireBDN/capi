import { createFileRoute } from '@tanstack/react-router'
import { ImportPage } from '#/components/import/ImportPage'

export const Route = createFileRoute('/_app/import')({
  head: () => ({ meta: [{ title: 'Import · Finances' }] }),
  component: ImportPage,
})
