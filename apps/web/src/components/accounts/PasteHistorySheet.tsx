import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  cn,
  Field,
  FieldDescription,
  FieldLabel,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import { snapshotErrorMessage } from './errors'
import { PASTE_MAX_ROWS, parseSnapshotHistory } from './paste'
import { afterSnapshotsChanged, saveSnapshotHistory } from './queries'

interface PasteHistorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  today: string
}

const EXAMPLE = '31/03/2026;12 345,67;10 000\n30/06/2026;12 890,10;10 500'

/**
 * Pastes a statement history (one `jj/mm/aaaa;valeur;versements` line per
 * date), previews what was understood and the lines in error, then saves the
 * valid rows in one request. Existing dates are replaced.
 */
export function PasteHistorySheet({
  open,
  onOpenChange,
  accountId,
  today,
}: PasteHistorySheetProps) {
  const isMobile = useIsMobile()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={
          isMobile
            ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
            : 'overflow-y-auto sm:max-w-lg'
        }
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Coller un historique</SheetTitle>
          <SheetDescription>
            Une ligne par date : date, valeur et, si vous les connaissez, les
            versements nets, séparés par des points-virgules ou des tabulations.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <PasteHistoryForm
            className="px-4 pb-6"
            accountId={accountId}
            today={today}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

interface PasteHistoryFormProps {
  accountId: string
  today: string
  /** Called after a save, and by the secondary button. */
  onDone: () => void
  /** Secondary button label ("Annuler", "Plus tard"…). */
  doneLabel?: string
  className?: string
}

/**
 * The paste field, the lines in error, the preview and the save button. It
 * starts empty on every mount.
 */
export function PasteHistoryForm({
  accountId,
  today,
  onDone,
  doneLabel = 'Annuler',
  className,
}: PasteHistoryFormProps) {
  const queryClient = useQueryClient()
  const id = useId()
  const [text, setText] = useState('')

  const parsed = useMemo(() => parseSnapshotHistory(text, today), [text, today])
  const { rows, errors } = parsed
  const tooMany = rows.length > PASTE_MAX_ROWS

  const save = useMutation({
    mutationFn: () =>
      saveSnapshotHistory(
        accountId,
        rows.map(({ date, valueCents, contributionsCents }) => ({
          date,
          valueCents,
          contributionsCents,
        })),
      ),
    onSuccess: async (result) => {
      toast.success(
        `${plural(result.created, 'valeur ajoutée', 'valeurs ajoutées')}, ${plural(result.updated, 'mise à jour', 'mises à jour')}`,
      )
      onDone()
      await afterSnapshotsChanged(queryClient)
    },
    onError: (error) => toast.error(snapshotErrorMessage(error)),
  })

  return (
    <div className={cn('space-y-4', className)}>
      <Field>
        <FieldLabel htmlFor={`${id}-text`}>Historique</FieldLabel>
        <Textarea
          id={`${id}-text`}
          rows={6}
          spellCheck={false}
          className="font-mono text-sm"
          placeholder={EXAMPLE}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <FieldDescription>
          Format jj/mm/aaaa;valeur;versements, montants en euros (1 234,56). Une
          date déjà saisie est remplacée ; ses versements sont gardés si la
          ligne n’en a pas.
        </FieldDescription>
      </Field>

      {errors.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>
            {plural(errors.length, 'ligne ignorée', 'lignes ignorées')}
          </AlertTitle>
          <AlertDescription>
            <ul className="space-y-1">
              {errors.map((error) => (
                <li key={error.line}>
                  Ligne {error.line} : {error.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {tooMany && (
        <Alert variant="destructive">
          <AlertTitle>Au plus {PASTE_MAX_ROWS} lignes à la fois.</AlertTitle>
        </Alert>
      )}

      {rows.length > 0 && (
        <section aria-label="Aperçu" className="space-y-2">
          <h3 className="text-sm font-medium">
            Aperçu · {plural(rows.length, 'valeur')}
          </h3>
          <ul className="max-h-72 divide-y overflow-y-auto rounded-md border px-3">
            {rows.map((row) => (
              <li
                key={row.date}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span>{formatCalendarDate(row.date)}</span>
                <span className="text-right">
                  <span className="block font-medium tabular-nums">
                    {formatCents(row.valueCents)}
                  </span>
                  <span className="text-muted-foreground block text-xs tabular-nums">
                    {row.contributionsCents === null
                      ? 'Versements non indiqués'
                      : `Versé ${formatCents(row.contributionsCents)}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" outline variant="secondary" onClick={onDone}>
          {doneLabel}
        </Button>
        <Button
          type="button"
          disabled={rows.length === 0 || tooMany}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          {rows.length === 0
            ? 'Enregistrer'
            : `Enregistrer ${plural(rows.length, 'valeur')}`}
        </Button>
      </div>
    </div>
  )
}
