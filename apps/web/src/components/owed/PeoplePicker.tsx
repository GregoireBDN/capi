import { cn, Input } from '@finances/ui'
import { PlusIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type { ContactDto } from '#/api/types.gen'
import { CHIP_CLASS, CHIP_ON } from '#/components/expenses/manual-fields'
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
 * « Avec qui ? » / « Qui a payé ? » (#359): a field to type a name, the
 * contacts as chips (filtered by what is typed), and « Ajouter « Léa » »
 * for a name nobody has yet. `single`: one person, the chips show who is
 * chosen; otherwise a tap adds the person to `chosen`.
 */
export function PeoplePicker({
  label,
  contacts,
  chosen,
  onPick,
  single = false,
}: {
  label: string
  contacts: readonly ContactDto[]
  chosen: readonly Person[]
  onPick: (person: Person) => void
  single?: boolean
}) {
  const id = useId()
  const [text, setText] = useState('')
  const typed = text.trim().replace(/\s+/g, ' ')
  const key = nameKey(typed)
  const visible = contacts.filter(
    (contact) =>
      !contact.archivedAt &&
      (single ||
        !chosen.some((person) =>
          samePerson(person, { contactId: contact.id, name: contact.name }),
        )) &&
      nameKey(contact.name).includes(key),
  )
  const known = contacts.some((contact) => nameKey(contact.name) === key)
  const isChosen = (contact: ContactDto) =>
    single &&
    chosen.some((person) =>
      samePerson(person, { contactId: contact.id, name: contact.name }),
    )
  const pick = (person: Person) => {
    onPick(person)
    setText('')
  }
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="text-muted-foreground block text-xs font-medium"
      >
        {label}
      </label>
      <Input
        id={id}
        placeholder="Un nom…"
        autoComplete="off"
        enterKeyHint="done"
        maxLength={60}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !typed) return
          event.preventDefault()
          const match = contacts.find((c) => nameKey(c.name) === key)
          pick(
            match
              ? { contactId: match.id, name: match.name }
              : { contactId: null, name: typed },
          )
        }}
      />
      <div className="flex flex-wrap gap-1.5">
        {visible.map((contact) => (
          <button
            key={contact.id}
            type="button"
            data-state={isChosen(contact) ? 'on' : 'off'}
            aria-pressed={single ? isChosen(contact) : undefined}
            onClick={() => pick({ contactId: contact.id, name: contact.name })}
            className={cn(
              CHIP_CLASS,
              CHIP_ON,
              'inline-flex max-w-full items-center gap-1.5 pl-1',
            )}
          >
            <ContactAvatar name={contact.name} size="sm" className="size-6" />
            <span className="truncate">{contact.name}</span>
          </button>
        ))}
        {typed && !known && (
          <button
            type="button"
            onClick={() => pick({ contactId: null, name: typed })}
            className={cn(
              CHIP_CLASS,
              'border-primary text-primary inline-flex max-w-full items-center gap-1 border-dashed',
            )}
          >
            <PlusIcon aria-hidden className="size-4 shrink-0" />
            <span className="truncate">Ajouter « {typed} »</span>
          </button>
        )}
        {single &&
          chosen
            .filter((person) => person.contactId === null)
            .map((person) => (
              <span
                key={person.name}
                data-state="on"
                className={cn(
                  CHIP_CLASS,
                  CHIP_ON,
                  'inline-flex items-center gap-1.5 pl-1',
                )}
              >
                <ContactAvatar
                  name={person.name}
                  size="sm"
                  className="size-6"
                />
                {person.name}
              </span>
            ))}
      </div>
    </div>
  )
}
