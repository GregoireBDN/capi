import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import type { CategoryDto } from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import {
  KIND_GROUP_LABELS,
  TRANSACTION_KINDS,
} from '#/components/transactions/labels'
import { categoriesQuery } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { AddCategorySheet } from './AddCategorySheet'
import { CategoryRow } from './CategoryRow'
import { DeleteCategoryDialog } from './DeleteCategoryDialog'
import { categoryErrorMessage } from './errors'

function CategoryList({
  label,
  categories,
  onDelete,
}: {
  label: string
  categories: readonly CategoryDto[]
  onDelete: (category: CategoryDto) => void
}) {
  return (
    <ul aria-label={label} className="divide-border -mx-3 divide-y">
      {categories.map((category) => (
        <CategoryRow
          key={category.id}
          category={category}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}

/**
 * Settings page of the categories: grouped by kind, renamed inline,
 * recoloured from the chart palette, added, archived and deleted (with
 * reassignment when they are in use).
 */
export function CategoriesPage() {
  const categories = useQuery({ ...categoriesQuery, staleTime: 0 })
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<CategoryDto | null>(null)

  const all = categories.data ?? []
  const active = all.filter((category) => !category.archivedAt)
  const archived = all.filter((category) => category.archivedAt)

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24">
      <PageHeader
        title="Catégories"
        description="Touchez un nom pour le renommer, une pastille pour changer sa couleur. Une catégorie archivée n’est plus proposée mais garde son historique."
      />
      <p className="text-sm">
        <Link
          to={ROUTES.rules}
          className="text-primary underline-offset-4 hover:underline"
        >
          Règles de classement
        </Link>
      </p>

      {categories.isPending && (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {categories.isError && (
        <p role="alert" className="text-destructive text-sm">
          {categoryErrorMessage(categories.error)}
        </p>
      )}

      {categories.isSuccess &&
        TRANSACTION_KINDS.map((kind) => {
          const group = active.filter((category) => category.kind === kind)
          return (
            <Card key={kind}>
              <CardHeader>
                <CardTitle>
                  {KIND_GROUP_LABELS[kind]}{' '}
                  <span className="text-muted-foreground font-normal">
                    ({group.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {group.length > 0 ? (
                  <CategoryList
                    label={KIND_GROUP_LABELS[kind]}
                    categories={group}
                    onDelete={setDeleting}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Aucune catégorie.
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}

      {archived.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Archivées{' '}
              <span className="text-muted-foreground font-normal">
                ({archived.length})
              </span>
            </CardTitle>
            <CardDescription>
              Absentes des listes de choix ; leurs opérations, budgets et
              statistiques restent visibles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryList
              label="Catégories archivées"
              categories={archived}
              onDelete={setDeleting}
            />
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 flex justify-end">
        <Button
          className="w-full shadow-lg sm:w-auto"
          onClick={() => setAdding(true)}
          disabled={!categories.isSuccess}
        >
          <PlusIcon />
          Ajouter une catégorie
        </Button>
      </div>

      <AddCategorySheet open={adding} onOpenChange={setAdding} />
      <DeleteCategoryDialog
        category={deleting}
        categories={all}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
