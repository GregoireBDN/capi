import { Button, SegmentedControl, SegmentedControlItem } from '@capi/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import type { RecurringItemDto } from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { currentDay } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { PeoplePicker, personRef } from './PeoplePicker'
import type { Person } from './PeoplePicker'
import {
  afterOwedChanged,
  clearRecurringShare,
  contactsQuery,
  owedErrorMessage,
  setRecurringShare,
} from './queries'

type How = 'half' | 'amount'

/**
 * « Partager avec… » of a confirmed recurring debit (#359, the partner
 * case): a person and half or a fixed amount of each charge. Each charge
 * booked from this month on gets their share (unless it has its own);
 * changing the share changes later charges only. Applied at once.
 */
export function RecurringShareSection({ item }: { item: RecurringItemDto }) {
  const queryClient = useQueryClient()
  const contacts = useQuery(contactsQuery())
  const share = item.share
  const [editing, setEditing] = useState(false)
  const [person, setPerson] = useState<Person | null>(
    share ? { contactId: share.contactId, name: share.contactName } : null,
  )
  const [how, setHow] = useState<How>(
    share?.amountCents != null ? 'amount' : 'half',
  )
  const [amount, setAmount] = useState(
    share?.amountCents != null ? centsToInput(share.amountCents) : '',
  )
  const amountCents = parseEurosToCents(amount) ?? 0
  const ok = person !== null && (how === 'half' || amountCents > 0)

  const save = useMutation({
    mutationFn: () =>
      setRecurringShare(item.id, {
        ...personRef(person!),
        ...(how === 'half' ? { bps: 5_000 } : { amountCents }),
        // A share changed keeps its start; a new one starts this month.
        from: share?.from ?? `${currentDay().slice(0, 7)}-01`,
      }),
    onSuccess: async (saved) => {
      setEditing(false)
      await afterOwedChanged(queryClient)
      toast.success(`${item.name} partagé avec ${saved.contactName}`)
    },
    onError: (error) => toast.error(owedErrorMessage(error)),
  })
  const clear = useMutation({
    mutationFn: () => clearRecurringShare(item.id),
    onSuccess: async () => {
      setEditing(false)
      await afterOwedChanged(queryClient)
      toast.success(`${item.name} n’est plus partagé`)
    },
    onError: (error) => toast.error(owedErrorMessage(error)),
  })

  if (!editing) {
    return (
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-sm font-medium">Partager avec quelqu’un</p>
        <p className="text-muted-foreground text-xs">
          {share
            ? `${share.contactName} paie ${share.bps !== null ? `${share.bps / 100} %` : formatCents(share.amountCents ?? 0)} de chaque prélèvement depuis le ${share.from.split('-').reverse().join('/')} : votre part, ${formatCents(item.ownMonthlyEquivalentCents)} par mois.`
            : 'Loyer, énergie… : la part de l’autre est attendue chaque mois, seule la vôtre compte dans vos dépenses.'}
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setEditing(true)}
        >
          {share ? 'Modifier le partage' : 'Partager'}
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-3 rounded-md border p-3">
      <PeoplePicker
        single
        label="Avec qui ?"
        contacts={contacts.data ?? []}
        chosen={person ? [person] : []}
        onPick={setPerson}
      />
      <SegmentedControl
        fullWidth
        aria-label="Sa part"
        value={how}
        onValueChange={setHow}
      >
        <SegmentedControlItem value="half">Moitié</SegmentedControlItem>
        <SegmentedControlItem value="amount">Montant</SegmentedControlItem>
      </SegmentedControl>
      {how === 'amount' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">Sa part de chaque prélèvement</span>
          <AmountField
            aria-label="Sa part de chaque prélèvement"
            groupClassName="w-[8rem]"
            className="text-right"
            value={amount}
            onValueChange={setAmount}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!ok}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          Enregistrer le partage
        </Button>
        {share && (
          <Button
            type="button"
            size="sm"
            ghost
            variant="secondary"
            loading={clear.isPending}
            onClick={() => clear.mutate()}
          >
            Ne plus partager
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          ghost
          variant="secondary"
          onClick={() => setEditing(false)}
        >
          Annuler
        </Button>
      </div>
    </div>
  )
}
