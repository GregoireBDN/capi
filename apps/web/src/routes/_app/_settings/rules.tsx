import { createFileRoute } from '@tanstack/react-router'
import { RulesPage } from '#/components/rules/RulesPage'

export const Route = createFileRoute('/_app/_settings/rules')({
  head: () => ({ meta: [{ title: 'Règles · Finances' }] }),
  component: RulesPage,
})
