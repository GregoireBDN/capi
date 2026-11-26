import { Field, FieldDescription, FieldLabel } from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import { XIcon } from 'lucide-react'
import { useId } from 'react'
import type { TransactionDto } from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import { centsToInput } from '#/components/budget/amount'
import { formatCents } from '#/lib/money'
import { ChoiceList } from './ChoiceList'
import { EnvelopeAvatar } from './EnvelopeAvatar'
import { envelopesQuery } from './queries'

const NONE = 'none'

/**
 * « Enveloppe › » of the transaction editor (#430): the envelope that pays
 * this expense (it keeps its category and counts once; what the envelope
 * paid adds to the month's budget) or whose money follows this transfer to
 * the other account. Changes the editor's draft only (#435).
 */
export function EnvelopeScreen({
  item,
  value,
  onChange,
  onDone,
}: {
  item: TransactionDto
  value: { envelopeId: string; amount: string } | null
  onChange: (value: { envelopeId: string; amount: string } | null) => void
  onDone: () => void
}) {
  const id = useId()
  const envelopes = useQuery(envelopesQuery())
  const amount = Math.abs(item.amountCents)
  // What it holds on this account; the attached amount is back in it.
  const heldHere = (envelopeId: string) => {
    const held =
      (envelopes.data ?? [])
        .find((e) => e.id === envelopeId)
        ?.accounts.find((a) => a.accountId === item.accountId)?.amountCents ?? 0
    return (
      held +
      (item.envelopeId === envelopeId ? (item.envelopeAmountCents ?? 0) : 0)
    )
  }
  const transfer = item.kind === 'transfer'

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        {transfer
          ? 'L’argent de l’enveloppe suit ce virement sur l’autre compte.'
          : 'L’enveloppe paie cette dépense. Elle reste dans sa catégorie.'}
      </p>
      {envelopes.isPending ? (
        <p className="text-muted-foreground text-sm">Chargement…</p>
      ) : (
        <ChoiceList
          label="Enveloppe"
          value={value?.envelopeId ?? NONE}
          onChange={(next) => {
            if (next === NONE) {
              onChange(null)
              onDone()
            } else {
              onChange({ envelopeId: next, amount: '' })
            }
          }}
          choices={[
            ...(envelopes.data ?? []).map((e) => {
              const held = heldHere(e.id)
              return {
                id: e.id,
                icon: <EnvelopeAvatar envelope={e} size="sm" />,
                label: e.name,
                value: formatCents(held),
                disabled: held <= 0,
              }
            }),
            {
              id: NONE,
              icon: (
                <span className="bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded-full">
                  <XIcon aria-hidden className="size-[0.8rem]" />
                </span>
              ),
              label: 'Non',
            },
          ]}
        />
      )}
      {value && (
        <Field>
          <FieldLabel htmlFor={`${id}-amount`}>
            {transfer ? 'Part de l’enveloppe' : 'Payé par l’enveloppe'}
          </FieldLabel>
          <AmountField
            id={`${id}-amount`}
            value={value.amount}
            placeholder={centsToInput(
              Math.min(amount, heldHere(value.envelopeId)),
            )}
            onValueChange={(typed) => onChange({ ...value, amount: typed })}
          />
          <FieldDescription>
            {transfer
              ? 'Vide : tout ce qu’elle a sur ce compte, au plus le virement.'
              : 'Vide : tout ce qu’elle peut. Le reste compte sur le budget du mois.'}
          </FieldDescription>
        </Field>
      )}
    </div>
  )
}
