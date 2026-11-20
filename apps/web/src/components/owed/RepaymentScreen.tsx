import { Button, CategoryIcon, Checkbox, cn, Skeleton } from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { RepaymentOptionsDto, TransactionDto } from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { CHIP_CLASS, CHIP_ON } from '#/components/expenses/manual-fields'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { ContactAvatar } from './ContactAvatar'
import {
  afterOwedChanged,
  linkRepayment,
  owedErrorMessage,
  repaymentOptionsQuery,
  UNDO_TOAST_MS,
  unlinkPayment,
} from './queries'

/** Title of the screen in the transaction editor. */
export function repaymentTitle(item: TransactionDto): string {
  return item.amountCents > 0 ? 'C’est un remboursement' : 'Je rembourse…'
}

/**
 * Links a transfer to what it repays (#359, owner's « A. Liste cochée »):
 * money in repays what people owe the owner, money out what he owes. One
 * screen: who (the person whose bank words match the label first), their
 * open items oldest first with the suggestion ticked and an amount for each
 * ticked one (what is left by default), then what is linked, what stays in
 * the transfer's category and what they owe before → after. « Lier » is off
 * past the transfer or past what is left on an item.
 */
export function RepaymentScreen({
  item,
  onDone,
}: {
  item: TransactionDto
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
      onPick={setContactId}
      onDone={onDone}
    />
  )
}

function RepaymentForm({
  item,
  options,
  onPick,
  onDone,
}: {
  item: TransactionDto
  options: RepaymentOptionsDto
  onPick: (contactId: string) => void
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const owedToMe = options.direction === 'owed_to_me'
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(options.suggestion.map((s) => s.receivableId)),
  )
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      options.items.map((entry) => {
        const suggested = options.suggestion.find(
          (s) => s.receivableId === entry.id,
        )
        return [
          entry.id,
          centsToInput(suggested?.amountCents ?? entry.leftCents),
        ]
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
  const overItem = (id: string) =>
    amountOf(id) > (options.items.find((e) => e.id === id)?.leftCents ?? 0)
  const anyEmpty = [...checked].some((id) => amountOf(id) <= 0)
  const rest = options.availableCents - linked
  const person = options.contacts.find((c) => c.id === options.contactId)
  const ok =
    linked > 0 &&
    rest >= 0 &&
    !anyEmpty &&
    !options.items.some((e) => overItem(e.id))

  const link = useMutation({
    mutationFn: () =>
      linkRepayment({
        transactionId: item.id,
        ...(options.splitId ? { splitId: options.splitId } : {}),
        items: options.items
          .filter((e) => checked.has(e.id))
          .map((e) => ({ receivableId: e.id, amountCents: amountOf(e.id) })),
      }),
    onSuccess: async (result) => {
      onDone()
      await afterOwedChanged(queryClient)
      let undone = false
      toast.success(`${formatCents(result.linkedCents)} liés`, {
        duration: UNDO_TOAST_MS,
        action: {
          label: 'Annuler',
          onClick: () => {
            if (undone) return
            undone = true
            void Promise.all(result.payments.map((p) => unlinkPayment(p.id)))
              .then(() => afterOwedChanged(queryClient))
              .catch((error: unknown) => toast.error(owedErrorMessage(error)))
          },
        },
      })
    },
    onError: (error) => toast.error(owedErrorMessage(error)),
  })

  const unlink = useMutation({
    mutationFn: (id: string) => unlinkPayment(id),
    onSuccess: () => afterOwedChanged(queryClient),
    onError: (error) => toast.error(owedErrorMessage(error)),
  })

  const category = item.category?.name ?? 'sa catégorie'
  return (
    <div className="space-y-4">
      {item.repayments.length > 0 && (
        <ul className="space-y-1 text-sm">
          {item.repayments.map((repayment) => (
            <li
              key={repayment.id}
              className="flex min-h-11 flex-wrap items-center gap-x-3"
            >
              <span className="min-w-0 flex-1 break-normal">
                Déjà lié : {formatCents(repayment.amountCents)} ·{' '}
                {repayment.contactName}
              </span>
              <Button
                type="button"
                size="sm"
                ghost
                variant="secondary"
                loading={unlink.isPending && unlink.variables === repayment.id}
                onClick={() => unlink.mutate(repayment.id)}
              >
                Délier
              </Button>
            </li>
          ))}
        </ul>
      )}

      {options.contacts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {owedToMe
            ? 'Personne ne vous doit rien pour le moment : partagez d’abord une dépense (« Partager »).'
            : 'Vous ne devez rien pour le moment : notez d’abord ce qu’on a payé pour vous (« Payé pour moi »).'}
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
                Proposé : au plus près de {formatCents(options.availableCents)},
                les plus anciennes d’abord.
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
                            {formatCents(entry.leftCents)}
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
        <Button
          type="button"
          className="w-full"
          disabled={!ok}
          loading={link.isPending}
          onClick={() => link.mutate()}
        >
          Lier
        </Button>
      </div>
    </div>
  )
}
