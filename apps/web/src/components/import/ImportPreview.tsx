import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, CardContent, FieldError } from '@capi/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  importProfilesControllerInspect,
  importsControllerCommit,
  importsControllerRemove,
} from '#/api'
import type { CsvInspectionDto, ImportDetailDto } from '#/api'
import {
  ApiRequestError,
  categoriesQuery,
  importKeys,
  importProfilesQuery,
  unwrap,
} from './api'
import {
  EMPTY_CHOICES,
  buildCommitPayload,
  countForReview,
  willImport,
} from './commit-payload'
import type { PreviewChoices } from './commit-payload'
import {
  commitErrorMessage,
  genericErrorMessage,
  uploadErrorMessage,
} from './errors'
import { envelopeKeys } from '#/components/expenses/queries'
import { plural } from './format'
import {
  AlreadyImportedBanner,
  ContinuityPanel,
  IgnoredColumnsPanel,
  ManualExpensesPanel,
  PreviewSummary,
} from './PreviewReport'
import { PreviewRows } from './PreviewRows'
import { ProfileMappingForm } from './ProfileMappingForm'

export interface CommitOutcome {
  detail: ImportDetailDto
  /** Imported rows left without a category (sent to the review queue). */
  forReview: number
}

interface ImportPreviewProps {
  detail: ImportDetailDto
  /**
   * The file previewed, while it is in this page's memory (not for an
   * import resumed from the history): its format can then be changed.
   */
  file?: File
  onCommitted: (outcome: CommitOutcome) => void
  /** The pending import was discarded, or can no longer be committed. */
  onClosed: () => void
  /** The file was read again with its changed format (#433). */
  onReplaced: (detail: ImportDetailDto) => void
}

export function ImportPreview({
  detail: initial,
  file,
  onCommitted,
  onClosed,
  onReplaced,
}: ImportPreviewProps) {
  const queryClient = useQueryClient()
  const categories = useQuery(categoriesQuery)
  const profiles = useQuery(importProfilesQuery)
  // Typing a line checks the preview again (#433): the latest one shows.
  const [detail, setDetail] = useState(initial)
  const [choices, setChoices] = useState<PreviewChoices>(EMPTY_CHOICES)
  const [remap, setRemap] = useState<CsvInspectionDto | null>(null)
  const rows = detail.preview?.rows ?? []
  const profile = profiles.data?.find((p) => p.id === detail.profileId)
  const canRemap =
    file !== undefined &&
    detail.source === 'csv_profile' &&
    profile !== undefined
  const toImport = rows.filter((row) => willImport(row, choices)).length
  const unreadable = detail.preview?.issues.length ?? 0

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

  const inspect = useMutation({
    mutationFn: (bytes: File) =>
      unwrap(
        importProfilesControllerInspect({
          body: { file: bytes },
          throwOnError: false,
        }),
      ),
    onSuccess: setRemap,
  })

  /** The file read again: the previous pending import is dropped. */
  const replace = async (next: ImportDetailDto) => {
    await importsControllerRemove({
      path: { id: detail.id },
      throwOnError: false,
    })
    await refreshAfterWrite()
    onReplaced(next)
  }

  const busy = commit.isPending || discard.isPending

  if (remap && file && profile) {
    return (
      <Card>
        <CardContent>
          <ProfileMappingForm
            file={file}
            accountId={detail.accountId}
            inspection={remap}
            profile={profile}
            onPreview={(next) => void replace(next)}
            onCancel={() => setRemap(null)}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <PreviewSummary detail={detail} />
      {canRemap && (
        <div className="space-y-1">
          <Button
            size="sm"
            variant="secondary"
            outline
            loading={inspect.isPending}
            disabled={busy}
            onClick={() => inspect.mutate(file)}
          >
            Changer le format
          </Button>
          {inspect.isError && (
            <FieldError>{uploadErrorMessage(inspect.error)}</FieldError>
          )}
        </div>
      )}
      <AlreadyImportedBanner detail={detail} />
      {detail.preview && (
        <>
          <ContinuityPanel report={detail.preview.continuity} />
          <IgnoredColumnsPanel columns={detail.preview.ignoredColumns} />
          <ManualExpensesPanel preview={detail.preview} />
          <PreviewRows
            detail={detail}
            categories={categories.data ?? []}
            choices={choices}
            onConflictChange={(lineNumber, action) =>
              setChoices((prev) => ({
                ...prev,
                conflicts: { ...prev.conflicts, [lineNumber]: action },
              }))
            }
            onCategoryChange={(lineNumber, categoryId) =>
              setChoices((prev) => ({
                ...prev,
                categories: { ...prev.categories, [lineNumber]: categoryId },
              }))
            }
            onDetail={setDetail}
          />
        </>
      )}

      <Card
        size="sm"
        className="bg-background/95 sticky bottom-[env(safe-area-inset-bottom)] z-10 backdrop-blur"
      >
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p>
              {toImport > 0
                ? `${plural(toImport, 'opération sera importée', 'opérations seront importées')}.`
                : 'Aucune opération à importer.'}
            </p>
            {unreadable > 0 && (
              <p className="text-muted-foreground text-xs">
                {plural(
                  unreadable,
                  'ligne illisible restera de côté',
                  'lignes illisibles resteront de côté',
                )}
                .
              </p>
            )}
          </div>
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
              aria-label="Valider l’import"
              onClick={() => commit.mutate()}
            >
              <span className="sm:hidden">Valider</span>
              <span className="hidden sm:inline">Valider l’import</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
