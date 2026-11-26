import { Button, Field, FieldError, FieldLabel } from '@capi/ui'
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { EnvelopeDetailDto } from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { formatCents } from '#/lib/money'
import { accountsQuery, isBankAccount } from '#/lib/queries'
import { AccountChips } from './AccountChips'
import { EnvelopeSheet } from './EnvelopeSheet'
import {
  accountEnvelopesQuery,
  afterEnvelopesChanged,
  envelopeErrorMessage,
  moveEnvelopeMoney,
} from './queries'

export type AddOrWithdraw = 'add' | 'withdraw'

/**
 * « Ajouter » / « Retirer » on an envelope's page (#430, the owner: « the
 * account is asked at every gesture »): an amount, on the account chosen by
 * itself (the most « libre » to add, the most held to withdraw), one chip
 * per account to change it. A move between two envelopes stays on the account's
 * page (`MoveSheet`).
 */
export function AddWithdrawSheet({
  mode,
  onClose,
  envelope,
}: {
  mode: AddOrWithdraw | null
  onClose: () => void
  envelope: EnvelopeDetailDto
}) {
  const id = useId()
  const queryClient = useQueryClient()
  const open = mode !== null
  const adding = mode === 'add'
  const [accountId, setAccountId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [tried, setTried] = useState(false)

  const accounts = useQuery({ ...accountsQuery, enabled: open && adding })
  const banks = (accounts.data ?? []).filter(
    (a) => isBankAccount(a) && a.archivedAt === null,
  )
  const splits = useQueries({
    queries: banks.map((a) => ({
      ...accountEnvelopesQuery(a.id),
      enabled: open && adding,
    })),
  })
  const options = adding
    ? banks.map((a, i) => ({
        accountId: a.id,
        name: a.name,
        cents: Math.max(0, splits[i]?.data?.freeCents ?? 0),
      }))
    : envelope.accounts
        .filter((a) => a.amountCents > 0)
        .map((a) => ({
          accountId: a.accountId,
          name: a.accountName,
          cents: a.amountCents,
        }))
  const best = [...options].sort((a, b) => b.cents - a.cents).at(0)
  const ready = !adding || splits.every((s) => s.data !== undefined)

  useEffect(() => {
    if (!open) return
    setAccountId(null)
    setAmount('')
    setTried(false)
  }, [open, mode])
  // Chosen by itself once the amounts are known.
  useEffect(() => {
    if (open && accountId === null && ready && best) {
      setAccountId(best.accountId)
    }
  }, [open, accountId, ready, best])

  const chosen = options.find((o) => o.accountId === accountId)
  const available = chosen?.cents ?? 0
  const cents = parseEurosToCents(amount)
  const error =
    chosen === undefined
      ? adding
        ? 'Aucun compte n’a de « libre ».'
        : 'Rien à retirer.'
      : cents === null || cents <= 0
        ? 'Indiquez un montant.'
        : cents > available
          ? `Au plus ${formatCents(available)}.`
          : null

  const move = useMutation({
    mutationFn: () =>
      moveEnvelopeMoney({
        accountId: accountId!,
        fromEnvelopeId: adding ? null : envelope.id,
        toEnvelopeId: adding ? envelope.id : null,
        amountCents: cents!,
      }),
    onSuccess: async () => {
      await afterEnvelopesChanged(queryClient)
      toast.success(adding ? 'Ajouté' : 'Retiré')
      onClose()
    },
    onError: (e) => toast.error(envelopeErrorMessage(e)),
  })

  return (
    <EnvelopeSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={adding ? 'Ajouter' : 'Retirer'}
      description={
        adding
          ? `Pris sur le « libre ». Le solde ne change pas.`
          : `Rendu au « libre ». Le solde ne change pas.`
      }
      actionLabel={adding ? 'Ajouter' : 'Retirer'}
      loading={move.isPending}
      onSubmit={() => {
        setTried(true)
        if (!error) move.mutate()
      }}
    >
      <AccountChips
        accounts={options}
        value={accountId}
        onChange={(next) => {
          setAccountId(next)
          setAmount('')
        }}
      />
      <Field data-invalid={tried && error !== null}>
        <FieldLabel htmlFor={`${id}-amount`}>Montant</FieldLabel>
        <div className="flex items-center gap-2">
          <AmountField
            id={`${id}-amount`}
            groupClassName="flex-1"
            value={amount}
            placeholder="0"
            onValueChange={(typed) => setAmount(typed)}
          />
          <Button
            type="button"
            variant="secondary"
            outline
            disabled={available <= 0}
            onClick={() => setAmount(centsToInput(available))}
          >
            Tout
          </Button>
        </div>
        {tried && error && <FieldError>{error}</FieldError>}
      </Field>
    </EnvelopeSheet>
  )
}
