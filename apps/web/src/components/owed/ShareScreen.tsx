import { Button, cn, SegmentedControl, SegmentedControlItem } from '@capi/ui'
import { XIcon } from 'lucide-react'
import type { ContactDto, TransactionDto } from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { formatCents } from '#/lib/money'
import { ContactAvatar } from './ContactAvatar'
import { PeoplePicker, personRef, samePerson } from './PeoplePicker'
import type { Person } from './PeoplePicker'
import { partOf } from './shares'
import type { ShareMode } from './shares'

/** Who shares an expense and how (#359; a draft while adding one, #398). */
export interface ShareDraft {
  people: Person[]
  mode: ShareMode
  /** Typed amounts, per person (by index), in « Montants ». */
  texts: string[]
}

/** Nobody yet: what adding an expense starts from. */
export const EMPTY_SHARE: ShareDraft = { people: [], mode: 'equal', texts: [] }

/** A draft every part of which is a positive amount, the owner's included. */
export function shareValid(draft: ShareDraft, totalCents: number): boolean {
  const parts = partsOf(draft, totalCents)
  const others = parts.reduce<number>((sum, part) => sum + (part ?? 0), 0)
  return parts.every((part) => part !== null && part > 0) && others < totalCents
}

/** The shares to send for a draft (`shareValid` first). */
export function sharesOf(draft: ShareDraft, totalCents: number) {
  const parts = partsOf(draft, totalCents)
  return draft.people.map((person, index) => ({
    ...personRef(person),
    amountCents: parts[index] ?? 0,
  }))
}

/** Who owes what now on `item`, as the screen edits it. */
export function draftOf(item: TransactionDto): ShareDraft {
  const shares = item.shares.filter((s) => s.direction === 'owed_to_me')
  const people = shares.map((s) => ({
    contactId: s.contactId,
    name: s.contactName,
  }))
  const total = -item.amountCents
  const amounts = shares.map((s) => s.amountCents)
  const mode: ShareMode =
    people.length === 1 && amounts[0] === partOf('half', total, 1)
      ? 'half'
      : people.length > 1 &&
          amounts.every((a) => a === partOf('equal', total, people.length))
        ? 'equal'
        : people.length === 0
          ? 'equal'
          : 'amount'
  return { people, mode, texts: amounts.map(centsToInput) }
}

/** Each person's part in cents (null where a typed amount is not valid). */
export function partsOf(
  draft: ShareDraft,
  totalCents: number,
): (number | null)[] {
  const each = partOf(draft.mode, totalCents, draft.people.length)
  return draft.people.map((_, index) =>
    each !== null ? each : parseEurosToCents(draft.texts[index] ?? ''),
  )
}

/**
 * Who shares an expense and how (#359), controlled: the people (a list, a
 * second tap takes one out), one choice for everyone (« Moitié » with one
 * person, « Parts égales » with several, or « Montants » typed for each;
 * switching keeps the figures), each person removable, « Ma part » live.
 * A draft, adding an expense (#398) as editing one (#435, saved with ✓).
 */
export function ShareFields({
  totalCents,
  draft,
  onChange: change,
  contacts,
}: {
  totalCents: number
  draft: ShareDraft
  onChange: (draft: ShareDraft) => void
  contacts: readonly ContactDto[]
}) {
  const parts = partsOf(draft, totalCents)
  const others = parts.reduce<number>((sum, part) => sum + (part ?? 0), 0)
  const mine = totalCents - others
  const over = mine < 0
  /** The figures as shown, to keep them when switching to « Montants ». */
  const shownTexts = () =>
    parts.map((part, index) =>
      part !== null ? centsToInput(part) : (draft.texts[index] ?? ''),
    )

  const add = (person: Person) => {
    if (draft.people.some((p) => samePerson(p, person))) return
    const people = [...draft.people, person]
    change({
      people,
      mode:
        draft.mode === 'amount'
          ? 'amount'
          : people.length === 1
            ? 'half'
            : 'equal',
      texts: [...shownTexts(), ''],
    })
  }
  const remove = (index: number) => {
    const people = draft.people.filter((_, i) => i !== index)
    change({
      people,
      mode:
        draft.mode === 'amount'
          ? 'amount'
          : people.length === 1
            ? 'half'
            : 'equal',
      texts: shownTexts().filter((_, i) => i !== index),
    })
  }
  const single = draft.people.length === 1

  return (
    <div className="space-y-4">
      <PeoplePicker
        label="Avec qui ?"
        contacts={contacts}
        chosen={draft.people}
        onPick={add}
        onRemove={(person) =>
          remove(draft.people.findIndex((p) => samePerson(p, person)))
        }
      />
      {draft.people.length > 0 && (
        <>
          <SegmentedControl
            fullWidth
            aria-label="Comment partager"
            value={draft.mode === 'amount' ? 'amount' : 'even'}
            onValueChange={(value) => {
              if (value === 'amount') {
                change({ ...draft, mode: 'amount', texts: shownTexts() })
              } else {
                change({ ...draft, mode: single ? 'half' : 'equal' })
              }
            }}
          >
            <SegmentedControlItem value="even">
              {single ? 'Moitié' : 'Parts égales'}
            </SegmentedControlItem>
            <SegmentedControlItem value="amount">Montants</SegmentedControlItem>
          </SegmentedControl>
          <ul className="divide-y rounded-xl border">
            {draft.people.map((person, index) => (
              <li
                key={person.contactId ?? person.name}
                className="flex min-h-11 items-center gap-3 py-1 pr-1 pl-3"
              >
                <ContactAvatar name={person.name} size="sm" />
                <span className="min-w-0 flex-1 text-sm break-normal">
                  {person.name}
                </span>
                {draft.mode === 'amount' ? (
                  <AmountField
                    aria-label={`Part de ${person.name}`}
                    groupClassName="w-[6.5rem]"
                    className="text-right"
                    value={draft.texts[index] ?? ''}
                    onValueChange={(text) =>
                      change({
                        ...draft,
                        texts: draft.texts.map((t, i) =>
                          i === index ? text : t,
                        ),
                      })
                    }
                  />
                ) : (
                  <span className="text-sm whitespace-nowrap tabular-nums">
                    {formatCents(parts[index] ?? 0)}
                  </span>
                )}
                <Button
                  type="button"
                  ghost
                  variant="secondary"
                  iconOnly
                  className="shrink-0"
                  aria-label={`Retirer ${person.name}`}
                  onClick={() => remove(index)}
                >
                  <XIcon aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          {draft.mode === 'equal' && !single && (
            <p className="text-muted-foreground text-xs">
              {draft.people.length + 1} parts : l’arrondi reste sur votre part.
            </p>
          )}
        </>
      )}
      <div
        className={cn(
          'flex min-h-11 flex-wrap items-center justify-between gap-x-3 rounded-md px-3 py-2',
          over ? 'bg-destructive/10' : 'bg-muted/60',
        )}
        aria-live="polite"
      >
        <span className="font-semibold">Ma part</span>
        <span
          className={cn(
            'ml-auto font-semibold whitespace-nowrap tabular-nums',
            over && 'text-destructive',
          )}
        >
          {over
            ? `${formatCents(-mine)} de trop`
            : `${formatCents(mine)} sur ${formatCents(totalCents)}`}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        Seule votre part compte dans vos dépenses, le jour de la dépense. Les
        remboursements liés ne comptent ni en revenus ni en dépenses.
      </p>
    </div>
  )
}
