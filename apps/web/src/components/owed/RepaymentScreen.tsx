import { Button, CategoryIcon, Checkbox, cn, Skeleton } from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { RepaymentOptionsDto, TransactionDto } from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { CHIP_CLASS, CHIP_ON } from '#/components/expenses/manual-fields'
import type {
  RepaymentDraft,
  RepaymentLinkItem,
} from '#/components/transactions/edit-draft'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { ContactAvatar } from './ContactAvatar'
import { owedErrorMessage, repaymentOptionsQuery } from './queries'

/** Title of the screen in the transaction editor. */
export function repaymentTitle(item: TransactionDto): string {
  // Money in: someone pays the owner back; money out: he pays someone
  // back (#398: one name per direction).
  return item.amountCents > 0 ? 'On me rembourse' : 'Je rembourse'
}

/**
 * Links a transfer to what it repays (#359, owner's « A. Liste cochée »):
 * money in repays what people owe the owner, money out what he owes. One
 * screen: who (the person whose bank words match the label first), their
 * open items oldest first with the suggestion ticked and an amount for each
 * ticked one (what is left by default), then what is linked, what stays in
 * the transfer's category and what they owe before → after. « Lier » is off
 * past the transfer or past what is left on an item.
 *
 * In the editor's draft (#435): « Lier » and « Délier » change only what
 * « Enregistrer » will send, said here until then.
 */
export function RepaymentScreen({
  item,
  draft,
  onChange,
  onDone,
}: {
  /** The transaction as saved: its repayments, its category. */
  item: TransactionDto
  draft: RepaymentDraft
  onChange: (draft: RepaymentDraft) => void
  onDone: () => void
}) {
  const [contactId, setContactId] = useState<string | null>(null)
  const options = useQuery(repaymentOptionsQuery(item.id, contactId))

  if (options.isPending) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Chargement">
        <Skeleton className="h-11 w-full rounded-full" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    )
  }
  if (options.isError) {
    return (
      <p className="text-destructive text-sm">
        {owedErrorMessage(options.error)}
      </p>
    )
  }
  return (
    <RepaymentForm
      // A new person starts from their own suggestion.
      key={options.data.contactId ?? 'nobody'}
      item={item}
      options={options.data}
      draft={draft}
      onChange={onChange}
      onPick={setContactId}
      onDone={onDone}
    />
  )
}

function RepaymentForm({
  item,
  options,
  draft,
  onChange,
  onPick,
  onDone,
}: {
  item: TransactionDto
  options: RepaymentOptionsDto
  draft: RepaymentDraft
  onChange: (draft: RepaymentDraft) => void
  onPick: (contactId: string) => void
  onDone: () => void
}) {
  const owedToMe = options.direction === 'owed_to_me'
  const pending = draft.link?.items ?? []
  const shownIds = new Set(options.items.map((entry) => entry.id))
  /** What the draft links to items not on this person's list. */
  const pendingElsewhere = pending
    .filter((p) => !shownIds.has(p.receivableId))
    .reduce((sum, p) => sum + p.amountCents, 0)
  const unlinked = item.repayments.filter((r) => draft.unlink.includes(r.id))
  /** What unlinking gives back, in all and on each item. */
  const freed = unlinked.reduce((sum, r) => sum + r.amountCents, 0)
  const freedOn = (id: string) =>
    unlinked
      .filter((r) => r.receivableId === id)
      .reduce((sum, r) => sum + r.amountCents, 0)
  const leftOn = (id: string) =>
    (options.items.find((e) => e.id === id)?.leftCents ?? 0) + freedOn(id)
  const available = options.availableCents + freed - pendingElsewhere
  // This person's items already in the draft start ticked with their amount.
  const pendingHere = pending.filter((p) => shownIds.has(p.receivableId))

  const [checked, setChecked] = useState<Set<string>>(
    () =>
      new Set(
        pendingHere.length > 0
          ? pendingHere.map((p) => p.receivableId)
          : options.suggestion.map((s) => s.receivableId),
      ),
  )
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      options.items.map((entry) => {
        const chosen =
          pendingHere.find((p) => p.receivableId === entry.id)?.amountCents ??
          options.suggestion.find((s) => s.receivableId === entry.id)
            ?.amountCents
        return [entry.id, centsToInput(chosen ?? entry.leftCents)]
      }),
    ),
  )
  useEffect(() => {
    // Nothing for this person: nothing ticked.
    if (options.items.length === 0) setChecked(new Set())
  }, [options.items.length])

  const amountOf = (id: string) =>
    checked.has(id) ? (parseEurosToCents(texts[id] ?? '') ?? 0) : 0
  const linked = options.items.reduce((sum, e) => sum + amountOf(e.id), 0)
  const overItem = (id: string) => amountOf(id) > leftOn(id)
  const anyEmpty = [...checked].some((id) => amountOf(id) <= 0)
  const rest = available - linked
  const person = options.contacts.find((c) => c.id === options.contactId)
  const ok =
    linked > 0 &&
    rest >= 0 &&
    !anyEmpty &&
    !options.items.some((e) => overItem(e.id))

  /** « Lier »: this person's ticked items replace theirs in the draft. */
  function link() {
    const items: RepaymentLinkItem[] = [
      ...pending.filter((p) => !shownIds.has(p.receivableId)),
      ...options.items
        .filter((e) => checked.has(e.id))
        .map((e) => ({
          receivableId: e.id,
          amountCents: amountOf(e.id),
          contactName: person?.name ?? '',
          label: e.label,
        })),
    ]
    onChange({
      ...draft,
      link: {
        ...(options.splitId ? { splitId: options.splitId } : {}),
        items,
      },
    })
    onDone()
  }

  function dropPending(receivableId: string) {
    const items = pending.filter((p) => p.receivableId !== receivableId)
    onChange({
      ...draft,
      link: items.length > 0 && draft.link ? { ...draft.link, items } : null,
    })
  }

  function toggleUnlink(paymentId: string) {
    onChange({
      ...draft,
      unlink: draft.unlink.includes(paymentId)
        ? draft.unlink.filter((id) => id !== paymentId)
        : [...draft.unlink, paymentId],
    })
  }

  const category = item.category?.name ?? 'sa catégorie'
  return (
    <div className="space-y-4">
      {(item.repayments.length > 0 || pending.length > 0) && (
        <ul className="space-y-1 text-sm">
          {item.repayments.map((repayment) => {
            const dropped = draft.unlink.includes(repayment.id)
            return (
              <li
                key={repayment.id}
                className="flex min-h-11 flex-wrap items-center gap-x-3"
              >
                <span
                  className={cn(
                    'min-w-0 flex-1 break-normal',
                    dropped && 'text-muted-foreground line-through',
                  )}
                >
                  {dropped ? 'Sera délié' : 'Déjà lié'} :{' '}
                  {formatCents(repayment.amountCents)} · {repayment.contactName}
                </span>
                <Button
                  type="button"
                  size="sm"
                  ghost
                  variant="secondary"
                  onClick={() => toggleUnlink(repayment.id)}
                >
                  {dropped ? 'Garder' : 'Délier'}
                </Button>
              </li>
            )
          })}
          {pending.map((entry) => (
            <li
              key={entry.receivableId}
              className="flex min-h-11 flex-wrap items-center gap-x-3"
            >
              <span className="min-w-0 flex-1 break-normal">
                À lier : {formatCents(entry.amountCents)} · {entry.label}
                {entry.contactName ? ` (${entry.contactName})` : ''}
              </span>
              <Button
                type="button"
                size="sm"
                ghost
                variant="secondary"
                onClick={() => dropPending(entry.receivableId)}
              >
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      )}

      {options.contacts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {owedToMe
            ? 'Personne ne vous doit rien pour le moment : partagez d’abord une dépense (« J’ai payé pour quelqu’un »).'
            : 'Vous ne devez rien pour le moment : notez d’abord ce qu’on a payé pour vous (« Quelqu’un a payé pour moi »).'}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium">
              {owedToMe ? 'De qui ?' : 'À qui ?'}
              {person && options.contacts[0]?.matched && person.matched
                ? ` (${person.name}, d’après le libellé)`
                : ''}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {options.contacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  aria-pressed={contact.id === options.contactId}
                  data-state={contact.id === options.contactId ? 'on' : 'off'}
                  onClick={() => onPick(contact.id)}
                  className={cn(
                    CHIP_CLASS,
                    CHIP_ON,
                    'inline-flex max-w-full items-center gap-1.5 pl-1',
                  )}
                >
                  <ContactAvatar
                    name={contact.name}
                    size="sm"
                    className="size-6"
                  />
                  <span className="truncate">{contact.name}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatCents(contact.owedCents)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {options.items.length > 0 && (
            <>
              <p className="text-muted-foreground text-xs">
                Proposé : au plus près de {formatCents(available)}, les plus
                anciennes d’abord.
              </p>
              <ul className="divide-y">
                {options.items.map((entry) => {
                  const on = checked.has(entry.id)
                  const over = overItem(entry.id)
                  const id = `repay-${entry.id}`
                  return (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5"
                    >
                      <label
                        htmlFor={id}
                        className="flex min-h-11 min-w-[11rem] flex-1 items-center gap-3"
                      >
                        <Checkbox
                          id={id}
                          checked={on}
                          onCheckedChange={() =>
                            setChecked((before) => {
                              const next = new Set(before)
                              if (next.has(entry.id)) next.delete(entry.id)
                              else next.add(entry.id)
                              return next
                            })
                          }
                        />
                        {entry.category && (
                          <CategoryIcon
                            icon={entry.category.icon}
                            color={entry.category.color}
                            size="sm"
                          />
                        )}
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="block font-medium break-normal">
                            {entry.label}
                          </span>
                          <span
                            className={cn(
                              'block text-xs',
                              over
                                ? 'text-destructive'
                                : 'text-muted-foreground',
                            )}
                          >
                            {formatCalendarDate(entry.bookingDate)} · reste{' '}
                            {formatCents(leftOn(entry.id))}
                          </span>
                        </span>
                      </label>
                      {on && (
                        <AmountField
                          aria-label={`Montant pour ${entry.label}`}
                          groupClassName="ml-auto w-[6.5rem]"
                          className="text-right"
                          aria-invalid={over || undefined}
                          value={texts[entry.id] ?? ''}
                          onValueChange={(text) =>
                            setTexts((before) => ({
                              ...before,
                              [entry.id]: text,
                            }))
                          }
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}

      <div className="space-y-2 border-t pt-3" aria-live="polite">
        {rest >= 0 ? (
          <p className="text-sm tabular-nums">
            <span className="font-medium">{formatCents(linked)} liés</span>
            {rest > 0 && (
              <span className="text-muted-foreground">
                {' '}
                · {formatCents(rest)} restent en {category}
              </span>
            )}
          </p>
        ) : (
          <p className="text-destructive text-sm font-medium tabular-nums">
            {formatCents(-rest)} de plus que le virement
          </p>
        )}
        {person && (
          <p className="text-muted-foreground text-xs tabular-nums">
            {owedToMe
              ? `${person.name} vous doit ${formatCents(person.owedCents)} → ${formatCents(Math.max(0, person.owedCents - linked))}`
              : `Vous devez à ${person.name} ${formatCents(person.owedCents)} → ${formatCents(Math.max(0, person.owedCents - linked))}`}
          </p>
        )}
        <Button type="button" className="w-full" disabled={!ok} onClick={link}>
          Lier
        </Button>
      </div>
    </div>
  )
}
