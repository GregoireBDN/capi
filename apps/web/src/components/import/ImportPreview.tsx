import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, CardContent } from '@finances/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { importsControllerCommit, importsControllerRemove } from '#/api'
import type { ImportDetailDto } from '#/api'
import { ApiRequestError, categoriesQuery, importKeys, unwrap } from './api'
import {
  EMPTY_CHOICES,
  buildCommitPayload,
  countForReview,
  willImport,
} from './commit-payload'
import type { PreviewChoices } from './commit-payload'
import { commitErrorMessage, genericErrorMessage } from './errors'
import { envelopeKeys } from '#/components/expenses/queries'
import { plural } from './format'
import {
  AlreadyImportedBanner,
  ContinuityPanel,
  ManualExpensesPanel,
  ParseIssuesPanel,
  PreviewSummary,
} from './PreviewReport'
import { PreviewRows } from './PreviewRows'

export interface CommitOutcome {
  detail: ImportDetailDto
  /** Imported rows left without a category (sent to the review queue). */
  forReview: number
}

interface ImportPreviewProps {
  detail: ImportDetailDto
  onCommitted: (outcome: CommitOutcome) => void
  /** The pending import was discarded, or can no longer be committed. */
  onClosed: () => void
}

export function ImportPreview({
  detail,
  onCommitted,
  onClosed,
}: ImportPreviewProps) {
  const queryClient = useQueryClient()
  const categories = useQuery(categoriesQuery)
  const [choices, setChoices] = useState<PreviewChoices>(EMPTY_CHOICES)
  const rows = detail.preview?.rows ?? []
  const toImport = rows.filter((row) => willImport(row, choices)).length

  const refreshAfterWrite = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: importKeys.imports }),
      queryClient.invalidateQueries({ queryKey: importKeys.accounts }),
      queryClient.invalidateQueries({ queryKey: envelopeKeys.all }),
    ])

  const commit = useMutation({
    mutationFn: () =>
      unwrap(
        importsControllerCommit({
          path: { id: detail.id },
          body: buildCommitPayload(rows, choices),
          throwOnError: false,
        }),
      ),
    onSuccess: async (committed) => {
      await refreshAfterWrite()
      toast.success(
        plural(
          committed.counts.inserted,
          'opération importée',
          'opérations importées',
        ),
      )
      onCommitted({
        detail: committed,
        forReview: countForReview(rows, choices),
      })
    },
    onError: async (error) => {
      toast.error(commitErrorMessage(error))
      // A preview that was committed elsewhere or expired cannot be retried.
      if (
        error instanceof ApiRequestError &&
        (error.status === 404 || error.status === 409)
      ) {
        await refreshAfterWrite()
        onClosed()
      }
    },
  })

  const discard = useMutation({
    mutationFn: () =>
      unwrap(
        importsControllerRemove({
          path: { id: detail.id },
          throwOnError: false,
        }),
      ),
    onSuccess: async () => {
      await refreshAfterWrite()
      toast.success('Import annulé : aucune opération n’a été enregistrée')
      onClosed()
    },
    onError: (error) => toast.error(genericErrorMessage(error)),
  })

  const busy = commit.isPending || discard.isPending

  return (
    <div className="space-y-4">
      <PreviewSummary detail={detail} />
      <AlreadyImportedBanner detail={detail} />
      {detail.preview && (
        <>
          <ContinuityPanel report={detail.preview.continuity} />
          <ParseIssuesPanel issues={detail.preview.issues} />
          <ManualExpensesPanel preview={detail.preview} />
          <PreviewRows
            rows={rows}
            categories={categories.data ?? []}
            choices={choices}
            onConflictChange={(rowIndex, action) =>
              setChoices((prev) => ({
                ...prev,
                conflicts: { ...prev.conflicts, [rowIndex]: action },
              }))
            }
            onCategoryChange={(rowIndex, categoryId) =>
              setChoices((prev) => ({
                ...prev,
                categories: { ...prev.categories, [rowIndex]: categoryId },
              }))
            }
          />
        </>
      )}

      <Card
        size="sm"
        className="bg-background/95 sticky bottom-[env(safe-area-inset-bottom)] z-10 backdrop-blur"
      >
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            {toImport > 0
              ? `${plural(toImport, 'opération sera importée', 'opérations seront importées')}.`
              : 'Aucune opération à importer.'}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              variant="secondary"
              outline
              className="min-w-0"
              disabled={busy}
              loading={discard.isPending}
              onClick={() => discard.mutate()}
            >
              Annuler
            </Button>
            <Button
              className="min-w-0"
              disabled={busy}
              loading={commit.isPending}
              aria-label="Confirmer l’import"
              onClick={() => commit.mutate()}
            >
              <span className="sm:hidden">Valider</span>
              <span className="hidden sm:inline">Confirmer l’import</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
