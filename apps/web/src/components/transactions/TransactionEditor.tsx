import { Button, Field, FieldLabel, Switch, Textarea } from '@finances/ui'
import { useEffect, useId, useState } from 'react'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import { formatCalendarDate } from '#/lib/money'
import { Amount } from './Amount'
import { CategoryPicker } from './CategoryPicker'
import type { TransactionChanges } from './changes'
import { KindSelect } from './KindSelect'
import { displayLabel } from './labels'

const NOTE_MAX = 2000

interface TransactionEditorProps {
  item: TransactionDto
  categories: readonly CategoryDto[]
  onChange: (changes: TransactionChanges) => void
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
}: TransactionEditorProps) {
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
          <Amount cents={item.amountCents} />
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

      <div className="grid gap-3">
        <Field>
          <FieldLabel htmlFor={`${noteId}-category`}>Catégorie</FieldLabel>
          <CategoryPicker
            id={`${noteId}-category`}
            categories={categories}
            value={item.categoryId}
            onChange={(categoryId) => onChange({ categoryId })}
            label={`Catégorie de ${name}`}
            className="w-full"
          />
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
