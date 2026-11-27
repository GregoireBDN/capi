import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ConfirmDialog,
  Label,
  Sheet,
  SheetContent,
  Skeleton,
  Textarea,
  useIsMobile,
} from '@capi/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LockIcon,
  LockOpenIcon,
  PencilLineIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type {
  AcknowledgeableStep,
  MonthCloseDto,
  UpdateMonthCloseDto,
} from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { MonthToolbar } from '#/components/month/MonthToolbar'
import {
  EditorHeader,
  editorSide,
  SheetScroll,
} from '#/components/sheets/form-sheet'
import { formatMonth } from '#/lib/calendar'
import { MonthAnswer, TopCategories } from './MonthAnswer'
import { fixesLeft, MonthFixes } from './MonthFixes'
import { Changes, MonthReport } from './MonthReport'
import {
  closeMonth,
  integrityQuery,
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
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  )
}

const cleanNotes = (notes: string) =>
  notes.trim() === '' ? null : notes.trim()

/** « 2026-10 » → « octobre ». */
const monthName = (month: string) =>
  formatMonth(month)
    .toLowerCase()
    .replace(/\s\d{4}$/, '')

type PageSheet = 'notes' | 'report' | 'changes' | null

/**
 * « Bilan du mois » (#541, the owner's « La réponse d'abord »): the month's
 * answer first (saved, income and expenses, the budget), then only what is
 * left to fix as round icons opening their sheet, the largest categories,
 * and « Clôturer » (one tap when nothing is left) or « Rouvrir ». One column
 * on every screen.
 */
export function MonthClosePage({ month, onMonthChange }: MonthClosePageProps) {
  const queryClient = useQueryClient()
  const review = useQuery(monthCloseQuery(month))
  // A step of its own (#427), left to fix once its checks found something.
  const integrity = useQuery(integrityQuery(month))
  const [notesDraft, setNotesDraft] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sheet, setSheet] = useState<PageSheet>(null)
  const isMobile = useIsMobile()
  const notesId = useId()
  const savedNotes = review.data?.notes ?? null
  // Follow the saved notes (another month, a close or a reopen).
  useEffect(() => setNotesDraft(savedNotes ?? ''), [month, savedNotes])

  const store = (data: MonthCloseDto) => {
    queryClient.setQueryData(monthCloseKeys.month(data.month), data)
    void queryClient.invalidateQueries({ queryKey: monthCloseKeys.closed })
  }

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

  const integrityState = {
    data: integrity.data,
    isPending: integrity.isPending,
    isError: integrity.isError,
    refetch: () => void integrity.refetch(),
  }
  const fixes = data ? fixesLeft(data, integrityState) : []
  const left = fixes.length
  const report = data ? (data.closedReport ?? data.report) : null

  return (
    <div className="@container mx-auto max-w-2xl space-y-4 pb-4">
      <PageHeader title="Bilan du mois" />

      <MonthToolbar
        navigator={
          <MonthNavigator month={month} onMonthChange={onMonthChange} />
        }
        period={data?.period}
      />

      {review.isPending && <PageSkeleton />}

      {review.isError && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger le bilan du mois.</AlertTitle>
          <AlertDescription>
            <Button size="sm" outline onClick={() => void review.refetch()}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {data && report && (
        <>
          <MonthAnswer report={report} closed={data.status === 'closed'} />

          {data.status === 'open' ? (
            <MonthFixes
              fixes={fixes}
              integrity={integrityState}
              review={data}
              saving={update.isPending}
              onAcknowledge={acknowledge}
            />
          ) : (
            data.changes.length > 0 && (
              <Button
                variant="warning"
                outline
                className="w-full"
                iconStart={<TriangleAlertIcon />}
                onClick={() => setSheet('changes')}
              >
                Modifié depuis la clôture
              </Button>
            )
          )}

          <TopCategories report={report} onShowAll={() => setSheet('report')} />

          <div
            data-sticky-bottom-bar
            className="glass-panel short-screen:py-2 rounded-card sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 flex items-center gap-2 p-2"
          >
            <Button
              variant="secondary"
              iconOnly
              className="size-12 shrink-0 rounded-full"
              aria-label={data.notes ? 'Note du mois, écrite' : 'Note du mois'}
              onClick={() => setSheet('notes')}
            >
              <PencilLineIcon />
            </Button>
            {data.status === 'closed' ? (
              <Button
                variant="secondary"
                className="min-h-12 flex-1"
                iconStart={<LockOpenIcon />}
                loading={reopen.isPending}
                onClick={() => reopen.mutate()}
              >
                Rouvrir
              </Button>
            ) : (
              <Button
                variant={left === 0 && data.closable ? 'primary' : 'secondary'}
                className="min-h-12 flex-1"
                iconStart={<LockIcon />}
                disabled={!data.closable}
                loading={close.isPending}
                onClick={() =>
                  left === 0 ? close.mutate() : setConfirmOpen(true)
                }
              >
                {!data.closable
                  ? 'Mois pas terminé'
                  : left === 0
                    ? `Clôturer ${monthName(data.month)}`
                    : 'Clôturer'}
              </Button>
            )}
          </div>

          <Sheet
            open={sheet !== null}
            onOpenChange={(open) => !open && setSheet(null)}
          >
            <SheetContent side={editorSide(isMobile)} className="gap-0">
              {sheet === 'notes' && (
                <>
                  <EditorHeader title="Note du mois" />
                  <SheetScroll className="space-y-1.5 px-4 pt-2 pb-6">
                    <Label htmlFor={notesId} className="sr-only">
                      Note du mois
                    </Label>
                    <Textarea
                      id={notesId}
                      value={notesDraft}
                      maxLength={4000}
                      rows={6}
                      disabled={data.status === 'closed'}
                      placeholder="Ce qui a marqué le mois…"
                      onChange={(event) => setNotesDraft(event.target.value)}
                      onBlur={saveNotes}
                    />
                  </SheetScroll>
                </>
              )}
              {sheet === 'report' && (
                <>
                  <EditorHeader title="Rapport du mois" />
                  <SheetScroll className="px-4 pt-2 pb-6">
                    <MonthReport review={data} />
                  </SheetScroll>
                </>
              )}
              {sheet === 'changes' && (
                <>
                  <EditorHeader title="Modifié depuis la clôture" />
                  <SheetScroll className="px-4 pt-2 pb-6">
                    <Changes changes={data.changes} />
                  </SheetScroll>
                </>
              )}
            </SheetContent>
          </Sheet>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            onConfirm={() => close.mutate()}
            loading={close.isPending}
            variant="warning"
            title="Clôturer quand même ?"
            description={`Il reste ${left} chose${left > 1 ? 's' : ''} à régler. Le rapport sera figé tel quel ; vous pourrez rouvrir le mois.`}
            confirmLabel="Clôturer"
          />
        </>
      )}
    </div>
  )
}
