import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  ConfirmDialog,
  Progress,
  Skeleton,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LockIcon, LockOpenIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  AcknowledgeableStep,
  MonthCloseDto,
  UpdateMonthCloseDto,
} from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { PeriodNote } from '#/components/PeriodNote'
import { MonthCloseSteps } from './MonthCloseSteps'
import { MonthReport } from './MonthReport'
import {
  closeMonth,
  monthCloseErrorMessage,
  monthCloseKeys,
  monthCloseQuery,
  reopenMonth,
  updateMonthClose,
} from './queries'

interface MonthClosePageProps {
  month: string
  onMonthChange: (month: string) => void
}

function PageSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-16 w-full rounded-xl" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  )
}

const cleanNotes = (notes: string) =>
  notes.trim() === '' ? null : notes.trim()

/**
 * Guided month-end review ("Revue du mois"): the steps of the monthly
 * routine, each green when done with a link to where it is fixed, the
 * progress, the month's report and "Clôturer le mois" (or "Rouvrir").
 */
export function MonthClosePage({ month, onMonthChange }: MonthClosePageProps) {
  const queryClient = useQueryClient()
  const review = useQuery(monthCloseQuery(month))
  const [notesDraft, setNotesDraft] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const savedNotes = review.data?.notes ?? null
  // Follow the saved notes (another month, a close or a reopen).
  useEffect(() => setNotesDraft(savedNotes ?? ''), [month, savedNotes])

  const store = (data: MonthCloseDto) =>
    queryClient.setQueryData(monthCloseKeys.month(data.month), data)

  const update = useMutation({
    mutationFn: (body: UpdateMonthCloseDto) => updateMonthClose(month, body),
    onSuccess: store,
    onError: (error) => toast.error(monthCloseErrorMessage(error)),
  })
  const close = useMutation({
    mutationFn: () => closeMonth(month, cleanNotes(notesDraft)),
    onSuccess: (data) => {
      store(data)
      setConfirmOpen(false)
      toast.success('Mois clôturé.')
    },
    onError: (error) => toast.error(monthCloseErrorMessage(error)),
  })
  const reopen = useMutation({
    mutationFn: () => reopenMonth(month),
    onSuccess: (data) => {
      store(data)
      toast.success('Mois rouvert.')
    },
    onError: (error) => toast.error(monthCloseErrorMessage(error)),
  })

  const data = review.data
  const acknowledge = (step: AcknowledgeableStep, seen: boolean) => {
    if (!data) return
    const others = data.acknowledged.filter((s) => s !== step)
    update.mutate({ acknowledged: seen ? [...others, step] : others })
  }
  const saveNotes = () => {
    if (!data || data.status === 'closed') return
    const notes = cleanNotes(notesDraft)
    if (notes !== data.notes) update.mutate({ notes })
  }

  const doneCount = data?.steps.filter((step) => step.done).length ?? 0
  const stepCount = data?.steps.length ?? 0
  // Every step but the close itself.
  const left = data
    ? data.steps.filter((step) => step.key !== 'close' && !step.done).length
    : 0

  return (
    <div className="@container space-y-6 pb-4">
      <PageHeader
        title="Revue du mois"
        description="Les étapes pour boucler le mois, puis sa clôture."
      />

      <MonthNavigator month={month} onMonthChange={onMonthChange} />

      {data && <PeriodNote period={data.period} className="-mt-3" />}

      {review.isPending && <PageSkeleton />}

      {review.isError && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger la revue du mois.</AlertTitle>
          <AlertDescription>
            <Button size="sm" outline onClick={() => void review.refetch()}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          <section aria-label="Progression" className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">
                {doneCount} / {stepCount} étapes faites
              </p>
              <Badge
                variant={data.status === 'closed' ? 'success' : 'secondary'}
              >
                {data.status === 'closed' ? 'Clôturé' : 'Ouvert'}
              </Badge>
            </div>
            <Progress
              value={stepCount === 0 ? 0 : (doneCount / stepCount) * 100}
              aria-label="Progression de la revue"
            />
          </section>

          <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2 @2xl:items-start">
            <MonthCloseSteps
              review={data}
              saving={update.isPending}
              onAcknowledge={acknowledge}
              notesDraft={notesDraft}
              onNotesDraftChange={setNotesDraft}
              onNotesBlur={saveNotes}
            />
            <MonthReport review={data} />
          </div>

          <div className="bg-card short-screen:py-2 sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border p-3 shadow-lg">
            <p className="text-muted-foreground min-w-18 flex-1 text-sm">
              {data.status === 'closed'
                ? 'Le rapport est figé. Rouvrez le mois pour le modifier.'
                : !data.closable
                  ? 'Le mois n’est pas terminé.'
                  : left === 0
                    ? 'Tout est prêt.'
                    : `Encore ${left} étape${left > 1 ? 's' : ''}.`}
            </p>
            {data.status === 'closed' ? (
              <Button
                outline
                variant="secondary"
                iconStart={<LockOpenIcon />}
                loading={reopen.isPending}
                onClick={() => reopen.mutate()}
              >
                Rouvrir le mois
              </Button>
            ) : (
              <Button
                iconStart={<LockIcon />}
                disabled={!data.closable}
                loading={close.isPending}
                onClick={() =>
                  left === 0 ? close.mutate() : setConfirmOpen(true)
                }
              >
                Clôturer le mois
              </Button>
            )}
          </div>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            onConfirm={() => close.mutate()}
            loading={close.isPending}
            variant="warning"
            title="Clôturer quand même ?"
            description={`Il reste ${left} étape${left > 1 ? 's' : ''} à faire. Le rapport sera figé tel quel ; vous pourrez rouvrir le mois.`}
            confirmLabel="Clôturer"
          />
        </>
      )}
    </div>
  )
}
