import { Button, Field, FieldLabel, Switch, Textarea } from '@finances/ui'
import { useEffect, useId, useState } from 'react'
import type {
  CategoryDto,
  CorrectTransactionDto,
  TransactionDto,
} from '#/api/types.gen'
import { formatCalendarDate } from '#/lib/money'
import { Amount } from './Amount'
import { CategoryBadge } from './CategoryBadge'
import { CategoryPicker } from './CategoryPicker'
import type { TransactionChanges } from './changes'
import { ImportedCorrection } from './ImportedCorrection'
import { KindSelect } from './KindSelect'
import { displayLabel } from './labels'
import { SplitEditor } from './SplitEditor'

const NOTE_MAX = 2000

interface TransactionEditorProps {
  item: TransactionDto
  categories: readonly CategoryDto[]
  onChange: (changes: TransactionChanges) => void
  /** Opens the editor of a transaction entered by hand (amount, date, ...). */
  onEditManual?: () => void
  /** "Modifier une opération importée" (amount, date; bank values kept). */
  onCorrect?: (body: CorrectTransactionDto) => void
  onRestoreBank?: () => void
  /** Splits between categories (parts summing to the amount), or ends it. */
  onSplit?: (parts: { categoryId: string; amountCents: number }[]) => void
  onUnsplit?: () => void
}

/**
 * Corrections of one transaction (category, kind, one-off, review flag,
 * note), shown in a popover on desktop and a bottom sheet on phones. Every
 * change but the note applies at once; the note has its own save button.
 */
export function TransactionEditor({
  item,
  categories,
  onChange,
  onEditManual,
  onCorrect,
  onRestoreBank,
  onSplit,
  onUnsplit,
}: TransactionEditorProps) {
  const [splitting, setSplitting] = useState(false)
  const oneOffId = useId()
  const reviewId = useId()
  const noteId = useId()
  const [note, setNote] = useState(item.note ?? '')
  const name = displayLabel(item)

  // Follow the saved note (undo, refetch) unless the user is typing.
  useEffect(() => setNote(item.note ?? ''), [item.note])

  const noteChanged = note.trim() !== (item.note ?? '')

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-medium break-words">{name}</p>
          <Amount
            cents={item.amountCents}
            transfer={item.kind === 'transfer'}
          />
        </div>
        {item.merchant && (
          <p className="text-muted-foreground text-xs break-words">
            {item.rawLabel}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          <time dateTime={item.bookingDate}>
            {formatCalendarDate(item.bookingDate)}
          </time>
          {' · '}
          {item.accountName}
        </p>
      </div>

      {item.manual && (
        <div className="bg-muted/50 space-y-2 rounded-lg p-3 text-sm">
          <p className="text-muted-foreground text-xs">
            Saisie à la main : l’import du relevé la remplacera par l’opération
            de la banque, en gardant sa catégorie, sa note et sa répartition.
          </p>
          {onEditManual && (
            <Button
              type="button"
              size="sm"
              outline
              variant="secondary"
              onClick={onEditManual}
            >
              Modifier ou supprimer l’opération
            </Button>
          )}
        </div>
      )}
      {!item.manual && onCorrect && onRestoreBank && (
        <ImportedCorrection
          item={item}
          onCorrect={onCorrect}
          onRestore={onRestoreBank}
        />
      )}

      <div className="grid gap-3">
        <Field>
          <FieldLabel htmlFor={`${noteId}-category`}>
            {item.splits.length > 0 ? 'Répartition' : 'Catégorie'}
          </FieldLabel>
          {splitting && onSplit ? (
            <SplitEditor
              item={item}
              categories={categories}
              onCancel={() => setSplitting(false)}
              onSave={(parts) => {
                setSplitting(false)
                onSplit(parts)
              }}
            />
          ) : item.splits.length > 0 ? (
            <div className="space-y-2">
              <ul className="space-y-1" aria-label="Parts">
                {item.splits.map((part) => (
                  <li
                    key={part.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <CategoryBadge category={part.category} />
                    <Amount cents={part.amountCents} className="text-sm" />
                  </li>
                ))}
              </ul>
              {onSplit && onUnsplit && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    outline
                    variant="secondary"
                    onClick={() => setSplitting(true)}
                  >
                    Modifier la répartition
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    ghost
                    variant="secondary"
                    onClick={onUnsplit}
                  >
                    Ne plus répartir
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <CategoryPicker
                id={`${noteId}-category`}
                categories={categories}
                value={item.categoryId}
                onChange={(categoryId) => onChange({ categoryId })}
                label={`Catégorie de ${name}`}
                className="w-full"
              />
              {onSplit && (
                <Button
                  type="button"
                  size="sm"
                  ghost
                  variant="secondary"
                  className="justify-self-start"
                  onClick={() => setSplitting(true)}
                >
                  Répartir entre plusieurs catégories
                </Button>
              )}
            </>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${noteId}-kind`}>Type</FieldLabel>
          <KindSelect
            id={`${noteId}-kind`}
            value={item.kind}
            onChange={(kind) => onChange({ kind })}
            label={`Type de ${name}`}
            className="w-full"
          />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={oneOffId} className="text-sm">
            Ponctuelle
            <span className="text-muted-foreground block text-xs">
              Exclue des moyennes et des abonnements
            </span>
          </label>
          <Switch
            id={oneOffId}
            checked={item.isOneOff}
            onCheckedChange={(isOneOff) => onChange({ isOneOff })}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={reviewId} className="text-sm">
            À revoir
            <span className="text-muted-foreground block text-xs">
              Désactivez pour la marquer comme revue
            </span>
          </label>
          <Switch
            id={reviewId}
            checked={item.needsReview}
            onCheckedChange={(needsReview) => onChange({ needsReview })}
          />
        </div>
      </div>

      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (noteChanged) onChange({ note: note.trim() })
        }}
      >
        <Field>
          <FieldLabel htmlFor={noteId}>Note</FieldLabel>
          <Textarea
            id={noteId}
            value={note}
            maxLength={NOTE_MAX}
            rows={2}
            placeholder="Ajouter une note…"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <Button
          type="submit"
          size="sm"
          outline
          variant="secondary"
          disabled={!noteChanged}
          className="justify-self-end"
        >
          Enregistrer la note
        </Button>
      </form>
    </div>
  )
}
