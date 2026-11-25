import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ConfirmDialog } from '@capi/ui'
import { Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { importProfilesControllerRemove } from '#/api'
import type { ImportProfileDto } from '#/api'
import { importKeys, importProfilesQuery, unwrap } from './api'
import { genericErrorMessage } from './errors'
import { formatDateTime } from './format'

/**
 * The formats saved from unknown files (#431), each deletable: a file of
 * that source is then asked to be mapped again. Nothing when there is none.
 */
export function SavedFormats() {
  const queryClient = useQueryClient()
  const profiles = useQuery(importProfilesQuery)
  const [toDelete, setToDelete] = useState<ImportProfileDto | null>(null)

  const remove = useMutation({
    mutationFn: (profile: ImportProfileDto) =>
      unwrap(
        importProfilesControllerRemove({
          path: { id: profile.id },
          throwOnError: false,
        }),
      ),
    onSuccess: (_, profile) => {
      setToDelete(null)
      toast.success(`Format « ${profile.name} » supprimé`)
      void queryClient.invalidateQueries({ queryKey: importKeys.profiles })
      void queryClient.invalidateQueries({ queryKey: importKeys.imports })
    },
    onError: (err) => toast.error(genericErrorMessage(err)),
  })

  const list = profiles.data ?? []
  if (list.length === 0) return null

  return (
    <section aria-labelledby="saved-formats" className="space-y-2">
      <h3 id="saved-formats" className="text-sm font-medium">
        Formats enregistrés
      </h3>
      <ul className="divide-y rounded-md border">
        {list.map((profile) => (
          <li
            key={profile.id}
            className="flex min-h-11 items-center justify-between gap-2 py-1 pr-1 pl-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">{profile.name}</p>
              <p className="text-muted-foreground text-xs">
                {profile.lastUsedAt
                  ? `Utilisé le ${formatDateTime(profile.lastUsedAt)}`
                  : 'Jamais utilisé'}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              iconOnly
              variant="secondary"
              ghost
              aria-label={`Supprimer le format ${profile.name}`}
              onClick={() => setToDelete(profile)}
            >
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setToDelete(null)
        }}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete)
        }}
        title="Supprimer ce format ?"
        description={
          toDelete
            ? `Les prochains fichiers de « ${toDelete.name} » ne seront plus reconnus : il faudra indiquer à nouveau leurs colonnes. Les imports déjà faits restent.`
            : undefined
        }
        confirmLabel="Supprimer"
        variant="danger"
        loading={remove.isPending}
      />
    </section>
  )
}
