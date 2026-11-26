import { cn, OptionRow, SearchField } from '@capi/ui'
import { PlusIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type { ContactDto } from '#/api/types.gen'
import { ContactAvatar } from './ContactAvatar'

/** Someone chosen: a known contact, or a new name (created on save). */
export interface Person {
  contactId: string | null
  name: string
}

/** Case- and accent-insensitive key of a name. */
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function samePerson(a: Person, b: Person): boolean {
  return a.contactId !== null && b.contactId !== null
    ? a.contactId === b.contactId
    : nameKey(a.name) === nameKey(b.name)
}

/** The API's way to name a person: by id, or by a new name. */
export function personRef(person: Person) {
  return person.contactId
    ? { contactId: person.contactId }
    : { contactName: person.name }
}

/**
 * Choosing people (#359; a list since #394, like the categories, the
 * owner's request): a search field, then one row per contact (their disc,
 * their name, a check once chosen), « Ajouter « Léa » » for a name nobody
 * has yet. `single`: one person, a tap picks them; otherwise a tap adds the
 * person to `chosen`, and on a chosen one takes them out (`onRemove`). The
 * same everywhere a person is chosen: « Quelqu’un a payé pour moi », « J’ai payé pour quelqu’un », a
 * shared recurring item.
 */
export function PeoplePicker({
  label,
  contacts,
  chosen,
  onPick,
  onRemove,
  single = false,
  className,
}: {
  /** The question (« Qui a payé ? »), the list's accessible name. */
  label: string
  contacts: readonly ContactDto[]
  chosen: readonly Person[]
  onPick: (person: Person) => void
  /** Several people: a tap on a chosen one. */
  onRemove?: (person: Person) => void
  single?: boolean
  className?: string
}) {
  const id = useId()
  const [text, setText] = useState('')
  const typed = text.trim().replace(/\s+/g, ' ')
  const key = nameKey(typed)
  const isChosen = (person: Person) =>
    chosen.some((other) => samePerson(other, person))
  const people: Person[] = [
    ...contacts
      .filter((contact) => !contact.archivedAt)
      .map((contact) => ({ contactId: contact.id, name: contact.name })),
    // A new name chosen before (created on save): shown chosen.
    ...chosen.filter((person) => person.contactId === null),
  ].filter((person) => nameKey(person.name).includes(key))
  const known =
    contacts.some((contact) => nameKey(contact.name) === key) ||
    chosen.some((person) => nameKey(person.name) === key)
  const pick = (person: Person) => {
    if (!single && isChosen(person)) onRemove?.(person)
    else onPick(person)
    setText('')
  }
  return (
    <div className={cn('space-y-2', className)}>
      <p id={id} className="text-muted-foreground text-xs font-medium">
        {label}
      </p>
      <SearchField
        aria-label={`${label} Rechercher ou ajouter un nom`}
        placeholder="Rechercher ou ajouter un nom"
        autoComplete="off"
        enterKeyHint="done"
        maxLength={60}
        value={text}
        onValueChange={setText}
        onKeyDown={(event) => {
          // Enter takes the first person, or adds the name typed.
          if (event.key !== 'Enter' || !typed) return
          event.preventDefault()
          if (people.length > 0) pick(people[0])
          else pick({ contactId: null, name: typed })
        }}
      />
      {(people.length > 0 || (typed && !known)) && (
        <div
          role={single ? 'radiogroup' : 'group'}
          aria-labelledby={id}
          className="bg-muted/40 rounded-control space-y-1 py-1 overflow-hidden"
        >
          {people.map((person) => (
            <OptionRow
              key={person.contactId ?? `new:${person.name}`}
              role={single ? 'radio' : 'button'}
              selected={isChosen(person)}
              leading={<ContactAvatar name={person.name} />}
              label={person.name}
              detail={person.contactId === null ? 'Nouveau contact' : undefined}
              onClick={() => pick(person)}
            />
          ))}
          {typed && !known && (
            <OptionRow
              role="button"
              leading={
                <span
                  aria-hidden
                  className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4"
                >
                  <PlusIcon />
                </span>
              }
              label={`Ajouter « ${typed} »`}
              onClick={() => pick({ contactId: null, name: typed })}
            />
          )}
        </div>
      )}
      {people.length === 0 && !typed && (
        <p className="text-muted-foreground text-sm">
          Tapez un nom pour ajouter quelqu’un.
        </p>
      )}
    </div>
  )
}
