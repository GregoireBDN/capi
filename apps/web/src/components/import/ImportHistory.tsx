import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Skeleton,
} from '@finances/ui'
import { HistoryIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { importsControllerFindOne, importsControllerRemove } from '#/api'
import type { ImportDetailDto, ImportSummaryDto } from '#/api'
import { importKeys, importsQuery, unwrap } from './api'
import { genericErrorMessage } from './errors'
import {
  formatDateTime,
  formatPeriod,
  plural,
  sourceLabel,
  undoDescription,
} from './format'

interface ImportHistoryProps {
  /** Reopens a pending import's preview. */
  onResume: (detail: ImportDetailDto) => void
  /** Id of the import currently previewed, whose actions are hidden. */
  activeId?: string
}

export function ImportHistory({ onResume, activeId }: ImportHistoryProps) {
  const queryClient = useQueryClient()
  const history = useQuery(importsQuery)
  // The detail of the import to undo: it counts what undoing loses (#371).
  const [toUndo, setToUndo] = useState<ImportDetailDto | null>(null)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: importKeys.imports }),
      queryClient.invalidateQueries({ queryKey: importKeys.accounts }),
    ])

  const remove = useMutation({
    mutationFn: (item: ImportSummaryDto) =>
      unwrap(
        importsControllerRemove({
          path: { id: item.id },
          throwOnError: false,
        }),
      ),
    onSuccess: async (result) => {
      setToUndo(null)
      await refresh()
      toast.success(
        result.result === 'undone'
          ? `Import annulé : ${plural(result.removedTransactions, 'opération supprimée', 'opérations supprimées')}${
              result.restoredManual > 0
                ? `, ${plural(result.restoredManual, 'saisie remise', 'saisies remises')}`
                : ''
            }`
          : 'Aperçu supprimé',
      )
    },
    onError: (error) => toast.error(genericErrorMessage(error)),
  })

  const prepareUndo = useMutation({
    mutationFn: (item: ImportSummaryDto) =>
      unwrap(
        importsControllerFindOne({
          path: { id: item.id },
          throwOnError: false,
        }),
      ),
    onSuccess: (detail) => setToUndo(detail),
    onError: async (error) => {
      toast.error(genericErrorMessage(error))
      await refresh()
    },
  })

  const resume = useMutation({
    mutationFn: (item: ImportSummaryDto) =>
      unwrap(
        importsControllerFindOne({
          path: { id: item.id },
          throwOnError: false,
        }),
      ),
    onSuccess: (detail) => {
      if (detail.status === 'pending' && detail.preview) onResume(detail)
      else void refresh()
    },
    onError: async (error) => {
      toast.error(genericErrorMessage(error))
      await refresh()
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="text-muted-foreground size-4" />
          Historique des imports
        </CardTitle>
        <CardDescription>
          Annuler un import supprime les opérations qu’il a ajoutées ; les
          saisies qu’il avait rapprochées sont remises.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {history.isPending ? (
          <div className="space-y-2" aria-label="Chargement de l’historique">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : history.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-destructive">
              {genericErrorMessage(history.error)}
            </p>
            <Button
              size="sm"
              variant="secondary"
              outline
              onClick={() => void history.refetch()}
            >
              Réessayer
            </Button>
          </div>
        ) : history.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun import pour le moment.
          </p>
        ) : (
          <ul className="divide-y">
            {history.data.map((item) => (
              <HistoryItem
                key={item.id}
                item={item}
                active={item.id === activeId}
                busy={
                  (remove.isPending && remove.variables.id === item.id) ||
                  (resume.isPending && resume.variables.id === item.id)
                }
                preparing={
                  prepareUndo.isPending && prepareUndo.variables.id === item.id
                }
                onUndo={() => prepareUndo.mutate(item)}
                onDiscard={() => remove.mutate(item)}
                onResume={() => resume.mutate(item)}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={toUndo !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setToUndo(null)
        }}
        onConfirm={() => {
          if (toUndo) remove.mutate(toUndo)
        }}
        title="Annuler cet import ?"
        description={
          toUndo
            ? undoDescription({
                fileName: toUndo.fileName,
                accountName: toUndo.accountName,
                inserted: toUndo.counts.inserted,
                edited: toUndo.undo?.editedCount ?? 0,
                absorbed: toUndo.undo?.absorbedManualCount ?? 0,
              })
            : undefined
        }
        confirmLabel="Annuler l’import"
        cancelLabel="Conserver"
        variant="danger"
        loading={remove.isPending}
      />
    </Card>
  )
}

interface HistoryItemProps {
  item: ImportSummaryDto
  active: boolean
  busy: boolean
  /** The undo's figures are being read. */
  preparing: boolean
  onUndo: () => void
  onDiscard: () => void
  onResume: () => void
}

function HistoryItem({
  item,
  active,
  busy,
  preparing,
  onUndo,
  onDiscard,
  onResume,
}: HistoryItemProps) {
  const committed = item.status === 'committed'
  const { counts } = item
  const summary = committed
    ? [
        plural(counts.inserted, 'ajoutée', 'ajoutées'),
        counts.duplicates > 0 && plural(counts.duplicates, 'doublon'),
        counts.skipped > 0 && plural(counts.skipped, 'écartée', 'écartées'),
        counts.issues > 0 &&
          plural(counts.issues, 'ligne illisible', 'lignes illisibles'),
      ]
    : [
        plural(counts.new, 'nouvelle', 'nouvelles'),
        counts.duplicates > 0 && plural(counts.duplicates, 'doublon'),
        counts.conflicts > 0 && `${counts.conflicts} à confirmer`,
      ]

  return (
    <li
      className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
      aria-label={`Import ${item.fileName}`}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium" title={item.fileName}>
            {item.fileName}
          </p>
          {committed ? (
            <Badge variant="success" outline>
              Validé
            </Badge>
          ) : (
            <Badge variant="warning" outline>
              En attente
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {formatDateTime(item.committedAt ?? item.createdAt)} ·{' '}
          {item.accountName} · {sourceLabel(item)}
        </p>
        <p className="text-muted-foreground text-xs">
          Période {formatPeriod(item.periodStart, item.periodEnd)} ·{' '}
          {summary.filter(Boolean).join(', ')}
        </p>
      </div>
      {!active && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {committed ? (
            <Button
              size="sm"
              variant="danger"
              outline
              disabled={busy}
              loading={preparing}
              onClick={onUndo}
            >
              Annuler l’import
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="secondary"
                outline
                loading={busy}
                onClick={onResume}
              >
                Reprendre
              </Button>
              <Button
                size="sm"
                variant="secondary"
                ghost
                disabled={busy}
                onClick={onDiscard}
              >
                Supprimer
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  )
}
