import { Button, Field, FieldError, FieldLabel } from '@capi/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { AmountField } from '#/components/amount/AmountField'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { formatCents } from '#/lib/money'
import { ChoiceList } from './ChoiceList'
import { EnvelopeAvatar, FreeAvatar } from './EnvelopeAvatar'
import { EnvelopeSheet } from './EnvelopeSheet'
import {
  accountEnvelopesQuery,
  afterEnvelopesChanged,
  envelopeErrorMessage,
  envelopesQuery,
  moveEnvelopeMoney,
} from './queries'

const FREE = 'free'

/**
 * « Déplacer » (#428): money moves between an envelope and « libre » or
 * another envelope, on one account; the balance does not change. From the
 * envelope's page, the account is chosen first among those it is on.
 */
export function MoveSheet({
  open,
  onOpenChange,
  accountId: fixedAccountId,
  accounts,
  from: initialFrom,
  to: initialTo,
  envelopeId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The account the money is on; else chosen among `accounts`. */
  accountId?: string
  accounts?: readonly {
    accountId: string
    accountName: string
    /** What `envelopeId` holds there. */
    amountCents?: number
  }[]
  /** The envelope it leaves (null: « libre »). */
  from?: string | null
  /** The envelope it goes to (null: « libre »). */
  to?: string | null
  /**
   * From an envelope's page: on an account where it holds money, from it;
   * elsewhere, from « libre » into it (an empty envelope can be filled).
   */
  envelopeId?: string
}) {
  const id = useId()
  const queryClient = useQueryClient()
  const [accountId, setAccountId] = useState<string | null>(
    fixedAccountId ?? null,
  )
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [tried, setTried] = useState(false)

  const direct = (account: string | null) => {
    if (envelopeId === undefined) return
    const held =
      accounts?.find((a) => a.accountId === account)?.amountCents ?? 0
    setFrom(held > 0 ? envelopeId : FREE)
    setTo(held > 0 ? null : envelopeId)
  }

  useEffect(() => {
    if (!open) return
    const first = fixedAccountId ?? accounts?.[0]?.accountId ?? null
    setAccountId(first)
    setFrom(initialFrom === undefined ? null : (initialFrom ?? FREE))
    setTo(initialTo === undefined ? null : (initialTo ?? FREE))
    direct(first)
    setAmount('')
    setTried(false)
    // Fresh on every opening.
  }, [open])

  const split = useQuery({
    ...accountEnvelopesQuery(accountId ?? ''),
    enabled: open && accountId !== null,
  })
  const all = useQuery({ ...envelopesQuery(), enabled: open })

  const held = new Map(
    (split.data?.envelopes ?? []).map((e) => [e.envelopeId, e.amountCents]),
  )
  const free = Math.max(0, split.data?.freeCents ?? 0)
  const available = from === FREE ? free : (held.get(from ?? '') ?? 0)
  const sources = [
    ...(split.data?.envelopes ?? []).map((e) => ({
      id: e.envelopeId,
      icon: <EnvelopeAvatar envelope={e} size="sm" />,
      label: e.name,
      value: formatCents(e.amountCents),
      disabled: e.amountCents <= 0,
    })),
    {
      id: FREE,
      icon: <FreeAvatar size="sm" />,
      label: 'Libre',
      value: formatCents(split.data?.freeCents ?? 0),
      disabled: free <= 0,
    },
  ]
  const targets = [
    ...(all.data ?? [])
      .filter((e) => e.id !== from)
      .map((e) => ({
        id: e.id,
        icon: <EnvelopeAvatar envelope={e} size="sm" />,
        label: e.name,
        value: held.has(e.id) ? formatCents(held.get(e.id)!) : undefined,
      })),
    ...(from === FREE
      ? []
      : [{ id: FREE, icon: <FreeAvatar size="sm" />, label: 'Libre' }]),
  ]

  const cents = parseEurosToCents(amount)
  const error =
    from === null || to === null
      ? 'Choisissez d’où et vers où.'
      : cents === null || cents <= 0
        ? 'Indiquez un montant.'
        : cents > available
          ? `Au plus ${formatCents(available)}.`
          : null

  const move = useMutation({
    mutationFn: () =>
      moveEnvelopeMoney({
        accountId: accountId!,
        fromEnvelopeId: from === FREE ? null : from,
        toEnvelopeId: to === FREE ? null : to,
        amountCents: cents!,
      }),
    onSuccess: async () => {
      await afterEnvelopesChanged(queryClient)
      toast.success('Argent déplacé')
      onOpenChange(false)
    },
    onError: (e) => toast.error(envelopeErrorMessage(e)),
  })

  return (
    <EnvelopeSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Déplacer"
      description="Le solde du compte ne change pas."
      actionLabel="Déplacer"
      loading={move.isPending}
      onSubmit={() => {
        setTried(true)
        if (!error) move.mutate()
      }}
    >
      {!fixedAccountId && accounts && accounts.length > 1 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Compte</h3>
          <ChoiceList
            label="Compte"
            value={accountId}
            onChange={(next) => {
              setAccountId(next)
              direct(next)
              setAmount('')
            }}
            choices={accounts.map((a) => ({
              id: a.accountId,
              icon: null,
              label: a.accountName,
            }))}
          />
        </section>
      )}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">De</h3>
        <ChoiceList
          label="De"
          value={from}
          onChange={(next) => {
            setFrom(next)
            if (next === to) setTo(null)
          }}
          choices={sources}
        />
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Vers</h3>
        <ChoiceList
          label="Vers"
          value={to}
          onChange={setTo}
          choices={targets}
        />
      </section>
      <Field data-invalid={tried && error !== null}>
        <FieldLabel htmlFor={`${id}-amount`}>Montant</FieldLabel>
        <div className="flex items-center gap-2">
          <AmountField
            id={`${id}-amount`}
            groupClassName="flex-1"
            value={amount}
            placeholder={available > 0 ? centsToInput(available) : '0'}
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
