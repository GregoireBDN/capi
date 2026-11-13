import { createFileRoute } from '@tanstack/react-router'
import { CategoriesPage } from '#/components/categories/CategoriesPage'

export const Route = createFileRoute('/_app/categories')({
  head: () => ({ meta: [{ title: 'Catégories · Finances' }] }),
  component: CategoriesPage,
})
