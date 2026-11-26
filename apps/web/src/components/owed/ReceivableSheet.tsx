import {
  Button,
  CategoryIcon,
  DateField,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Sheet,
  SheetBar,
  SheetContent,
  Skeleton,
  useIsMobile,
} from '@capi/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BanknoteIcon,
  HandHeartIcon,
  HandshakeIcon,
  Undo2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { transactionsControllerList } from '#/api'
import type { ReceivableDto, TransactionDto } from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { displayLabel } from '#/components/transactions/labels'
import {
  editorSide,
  FORM_SHEET_SCREEN,
  FORM_SHEET_SIDE,
  FormSheetBody,
} from '#/components/sheets/form-sheet'
import { currentDay } from '#/lib/calendar'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { unwrap } from '#/lib/queries'
import { stateText } from './format'
import {
  afterOwedChanged,
  forgiveReceivable,
  linkRepayment,
  owedErrorMessage,
  unforgiveReceivable,
  UNDO_TOAST_MS,
  undoOffset,
  unlinkPayment,
} from './queries'

type Screen = 'main' | 'link' | 'other' | 'forgive'

/**
 * One item of a person's page (#359, owner's « A. Une feuille par
 * dépense »): its expense, what was received, let go and is left, then
 * « Lier un remboursement », « Réglé autrement » or « Je ne me fais pas
 * rembourser » (« Sam ne veut pas être remboursé » for what the owner owes),
 * which asks how much (everything left by default, #437); « Réclamer à
 * nouveau » once some was let go. Every change's toast offers « Annuler »;
 * nothing is deleted, the item stays in the history.
 */
export function ReceivableSheet({
  item,
  onOpenChange,
}: {
  item: ReceivableDto | null
  onOpenChange: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  return (
    <Sheet open={item !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className={isMobile ? FORM_SHEET_SCREEN : FORM_SHEET_SIDE}
      >
        {item && (
          <ReceivableContent
            key={item.id}
            item={item}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function ReceivableContent({
  item,
  onClose,
}: {
  item: ReceivableDto
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [screen, setScreen] = useState<Screen>('main')
  const owedToMe = item.direction === 'owed_to_me'
  const who = item.contactName
  const share = (cents: number) =>
    item.amountCents > 0 ? Math.min(100, (cents / item.amountCents) * 100) : 0
  const repaidPercent = share(item.repaidCents)
  const forgivenPercent = Math.min(
    100 - repaidPercent,
    share(item.forgivenCents),
  )
  const forgiveLabel = owedToMe
    ? 'Je ne me fais pas rembourser'
    : `${who} ne veut pas être remboursé`

  const undoToast = (text: string, undo: () => Promise<unknown>) => {
    let undone = false
    toast.success(text, {
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Annuler',
        onClick: () => {
          if (undone) return
          undone = true
          void undo()
            .then(() => afterOwedChanged(queryClient))
            .catch((error: unknown) => toast.error(owedErrorMessage(error)))
        },
      },
    })
  }

  // Back to what was let go before this sheet's change.
  const restoreForgiven = async () => {
    await unforgiveReceivable(item.id)
    if (item.forgivenCents > 0) {
      await forgiveReceivable(item.id, {
        amountCents: item.forgivenCents,
        note: item.forgivenNote,
      })
    }
  }
  const forgive = useMutation({
    mutationFn: (body: { amountCents: number; note: string | null }) =>
      forgiveReceivable(item.id, body),
    onSuccess: async (_, { amountCents }) => {
      onClose()
      await afterOwedChanged(queryClient)
      undoToast(
        owedToMe
          ? `${formatCents(amountCents)} abandonnés : ils reviennent dans vos dépenses`
          : `${who} ne veut pas être remboursé de ${formatCents(amountCents)} : ils sortent de vos dépenses`,
        restoreForgiven,
      )
    },
    onError: (error) => toast.error(owedErrorMessage(error)),
  })
  const reclaim = useMutation({
    mutationFn: () => unforgiveReceivable(item.id),
    onSuccess: async () => {
      onClose()
      await afterOwedChanged(queryClient)
      undoToast(
        owedToMe
          ? `${who} vous doit à nouveau ${formatCents(item.forgivenCents)}`
          : `Vous devez à nouveau ${formatCents(item.forgivenCents)} à ${who}`,
        () =>
          forgiveReceivable(item.id, {
            amountCents: item.forgivenCents,
            note: item.forgivenNote,
          }),
      )
    },
    onError: (error) => toast.error(owedErrorMessage(error)),
  })
  const unlink = useMutation({
    mutationFn: (id: string) => unlinkPayment(id),
    onSuccess: async () => {
      onClose()
      await afterOwedChanged(queryClient)
      toast.success('Remboursement délié')
    },
    onError: (error) => toast.error(owedErrorMessage(error)),
  })
  // An offset's side is undone with the other side (#484).
  const unoffset = useMutation({
    mutationFn: (offsetId: string) => undoOffset(offsetId),
    onSuccess: async () => {
      onClose()
      await afterOwedChanged(queryClient)
      toast.success('Compensation annulée : les deux côtés sont dus à nouveau')
    },
    onError: (error) => toast.error(owedErrorMessage(error)),
  })
  const pay = useMutation({
    mutationFn: (body: Parameters<typeof linkRepayment>[0]) =>
      linkRepayment(body),
    onSuccess: async (result) => {
      onClose()
      await afterOwedChanged(queryClient)
      undoToast(`${formatCents(result.linkedCents)} liés`, () =>
        Promise.all(result.payments.map((p) => unlinkPayment(p.id))),
      )
    },
    onError: (error) => toast.error(owedErrorMessage(error)),
  })

  const title =
    screen === 'link'
      ? 'Lier un remboursement'
      : screen === 'other'
        ? 'Réglé autrement'
        : screen === 'forgive'
          ? forgiveLabel
          : item.label
  const owedText = `${owedToMe ? `${who} vous doit` : `Vous devez à ${who}`} ${formatCents(item.leftCents)}`
  const header = (
    <SheetBar
      title={title}
      description={owedText}
      onBack={screen !== 'main' ? () => setScreen('main') : undefined}
    />
  )

  if (screen === 'link') {
    return (
      <>
        {header}
        <FormSheetBody>
          <TransferPicker
            item={item}
            pending={pay.isPending}
            onPick={(transaction, amountCents) =>
              pay.mutate({
                transactionId: transaction.id,
                items: [{ receivableId: item.id, amountCents }],
              })
            }
          />
        </FormSheetBody>
      </>
    )
  }
  if (screen === 'forgive') {
    return (
      <>
        {header}
        <FormSheetBody>
          <ForgiveForm
            item={item}
            pending={forgive.isPending}
            onSave={(amountCents, note) =>
              forgive.mutate({ amountCents, note })
            }
          />
        </FormSheetBody>
      </>
    )
  }
  if (screen === 'other') {
    return (
      <>
        {header}
        <FormSheetBody>
          <SettledOtherwise
            item={item}
            pending={pay.isPending}
            onSave={(amountCents, paidOn, note) =>
              pay.mutate({
                paidOn,
                ...(note ? { note } : {}),
                items: [{ receivableId: item.id, amountCents }],
              })
            }
          />
        </FormSheetBody>
      </>
    )
  }

  return (
    <>
      {header}
      <FormSheetBody>
        <div className="flex items-start gap-3">
          {item.category && (
            <CategoryIcon
              icon={item.category.icon ?? undefined}
              color={item.category.color}
            />
          )}
          <div className="min-w-0 flex-1 text-sm">
            <p className="break-normal">
              {owedToMe
                ? `Payé ${formatCents(item.expenseCents)} le ${formatCalendarDate(item.bookingDate)}`
                : `Payé par ${who} le ${formatCalendarDate(item.bookingDate)}${item.billCents !== null ? ` (addition ${formatCents(item.billCents)})` : ''}`}
            </p>
            <p className="text-muted-foreground text-xs">
              {owedToMe ? `Part de ${who}` : 'Votre part'} :{' '}
              {formatCents(item.amountCents)}
              {item.origin === 'recurring' ? ' · partagé chaque mois' : ''}
            </p>
          </div>
        </div>
        <div className="space-y-1">
          <div
            className="bg-muted flex h-2 overflow-hidden rounded-full"
            role="img"
            aria-label={`${formatCents(item.repaidCents)} reçus${item.forgivenCents > 0 ? `, ${formatCents(item.forgivenCents)} abandonnés` : ''} sur ${formatCents(item.amountCents)}`}
          >
            <div
              className="bg-chart-delta-good h-full"
              style={{ width: `${repaidPercent}%` }}
            />
            <div
              className="bg-muted-foreground/40 h-full"
              style={{ width: `${forgivenPercent}%` }}
            />
          </div>
          <p className="flex flex-wrap justify-between gap-x-3 text-xs tabular-nums">
            <span>
              {formatCents(item.repaidCents)} {owedToMe ? 'reçus' : 'rendus'}
              {item.forgivenCents > 0 &&
                ` · ${formatCents(item.forgivenCents)} abandonnés`}{' '}
              sur {formatCents(item.amountCents)}
            </span>
            {item.state === 'open' ? (
              <span className="text-warning-foreground dark:text-warning">
                reste {formatCents(item.leftCents)}
              </span>
            ) : (
              <span className="text-muted-foreground">{stateText(item)}</span>
            )}
          </p>
        </div>
        {item.note && (
          <p className="text-muted-foreground text-xs">« {item.note} »</p>
        )}

        {item.state === 'open' && (
          <div className="space-y-2">
            <Button
              type="button"
              className="w-full"
              iconStart={<HandshakeIcon />}
              onClick={() => setScreen('link')}
            >
              Lier un remboursement
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              iconStart={<BanknoteIcon />}
              onClick={() => setScreen('other')}
            >
              Réglé autrement
            </Button>
            <Button
              type="button"
              ghost
              variant="secondary"
              className="w-full"
              iconStart={<HandHeartIcon />}
              onClick={() => setScreen('forgive')}
            >
              {forgiveLabel}
            </Button>
          </div>
        )}
        {item.state === 'forgiven' && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            iconStart={<Undo2Icon />}
            loading={reclaim.isPending}
            onClick={() => reclaim.mutate()}
          >
            Réclamer à nouveau
          </Button>
        )}

        {(item.payments.length > 0 || item.forgivenCents > 0) && (
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium">
              {item.forgivenCents > 0 ? 'Historique' : 'Remboursements'}
            </p>
            <ul className="divide-y text-sm">
              {item.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex min-h-11 flex-wrap items-center gap-x-3"
                >
                  <span className="min-w-0 flex-1 basis-40 break-normal">
                    {formatCalendarDate(payment.paidOn)} ·{' '}
                    {payment.offsetId
                      ? 'Compensé'
                      : (payment.label ?? 'Réglé autrement')}
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    {formatCents(payment.amountCents)}
                  </span>
                  {payment.offsetId ? (
                    <Button
                      type="button"
                      size="sm"
                      ghost
                      variant="secondary"
                      className="ml-auto"
                      loading={
                        unoffset.isPending &&
                        unoffset.variables === payment.offsetId
                      }
                      onClick={() => unoffset.mutate(payment.offsetId!)}
                    >
                      Annuler la compensation
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      ghost
                      variant="secondary"
                      loading={
                        unlink.isPending && unlink.variables === payment.id
                      }
                      onClick={() => unlink.mutate(payment.id)}
                    >
                      Délier
                    </Button>
                  )}
                </li>
              ))}
              {item.forgivenCents > 0 && (
                <li className="text-muted-foreground flex min-h-11 flex-wrap items-center gap-x-3">
                  <span className="min-w-0 flex-1 break-normal">
                    {item.forgivenAt
                      ? `${formatCalendarDate(item.forgivenAt.slice(0, 10))} · `
                      : ''}
                    {item.forgivenNote
                      ? `« ${item.forgivenNote} »`
                      : owedToMe
                        ? 'Je ne me fais pas rembourser'
                        : 'Ne veut pas être remboursé'}
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    {formatCents(item.forgivenCents)} abandonnés
                  </span>
                  {/* While some is still claimed; once nothing is, the full button above. */}
                  {item.state === 'open' && (
                    <Button
                      type="button"
                      size="sm"
                      ghost
                      variant="secondary"
                      loading={reclaim.isPending}
                      onClick={() => reclaim.mutate()}
                    >
                      Réclamer
                    </Button>
                  )}
                </li>
              )}
            </ul>
          </div>
        )}
      </FormSheetBody>
    </>
  )
}

/** What is still free on a transfer: not linked, not shared. */
function freeOn(transaction: TransactionDto): number {
  const linked = transaction.repayments.reduce((s, r) => s + r.amountCents, 0)
  const shared =
    transaction.amountCents < 0
      ? transaction.shares
          .filter((s) => s.direction === 'owed_to_me')
          .reduce((s, r) => s + r.amountCents, 0)
      : 0
  return Math.abs(transaction.amountCents) - linked - shared
}

/** `YYYY-MM-DD` `days` before `day`, without time zones. */
function daysBefore(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d - days))
  return date.toISOString().slice(0, 10)
}

/**
 * The transfers that can repay the item: money in (or out, for what the
 * owner owes) on his accounts since a little before the expense, with room
 * left, newest first. A tap links what is left on the item, at most what is
 * free on the transfer.
 */
function TransferPicker({
  item,
  pending,
  onPick,
}: {
  item: ReceivableDto
  pending: boolean
  onPick: (transaction: TransactionDto, amountCents: number) => void
}) {
  const incoming = item.direction === 'owed_to_me'
  const from = daysBefore(item.bookingDate, 7)
  const list = useQuery({
    queryKey: ['transactions', 'repayment-candidates', from],
    queryFn: () =>
      unwrap(
        transactionsControllerList({
          query: { from, limit: 100, sort: 'date_desc' },
          throwOnError: false,
        }),
      ),
  })
  if (list.isPending) return <Skeleton className="h-32 w-full rounded-xl" />
  const candidates = (list.data?.items ?? []).filter(
    (t) =>
      t.accountId !== null &&
      t.id !== item.transactionId &&
      t.splits.length === 0 &&
      (incoming ? t.amountCents > 0 : t.amountCents < 0) &&
      freeOn(t) > 0,
  )
  if (candidates.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {incoming
          ? 'Aucun virement reçu depuis la dépense. Importez le relevé, ou choisissez « Réglé autrement ».'
          : 'Aucun virement envoyé depuis la dépense. Importez le relevé, ou choisissez « Réglé autrement ».'}
      </p>
    )
  }
  return (
    <ul className="divide-y">
      {candidates.map((transaction) => {
        const amount = Math.min(item.leftCents, freeOn(transaction))
        return (
          <li key={transaction.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onPick(transaction, amount)}
              className="hover:bg-muted/60 flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {displayLabel(transaction)}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {formatCalendarDate(transaction.bookingDate)} ·{' '}
                  {formatCents(Math.abs(transaction.amountCents))}
                </span>
              </span>
              <span className="text-xs whitespace-nowrap tabular-nums">
                lier {formatCents(amount)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * « Je ne me fais pas rembourser » / « Sam ne veut pas être remboursé »
 * (#437): how much of what is left to let go, everything by default
 * (« Tout »); the rest is still claimed.
 */
function ForgiveForm({
  item,
  pending,
  onSave,
}: {
  item: ReceivableDto
  pending: boolean
  onSave: (amountCents: number, note: string | null) => void
}) {
  const owedToMe = item.direction === 'owed_to_me'
  const all = centsToInput(item.leftCents)
  const [amount, setAmount] = useState(all)
  const [note, setNote] = useState('')
  const cents = parseEurosToCents(amount) ?? 0
  const over = cents > item.leftCents
  const ok = cents > 0 && !over
  const rest = item.leftCents - cents
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (ok) onSave(cents, note.trim() || null)
      }}
    >
      <Field data-invalid={over}>
        <FieldLabel htmlFor="forgive-amount">Montant abandonné</FieldLabel>
        <div className="flex items-center gap-2">
          <AmountField
            id="forgive-amount"
            groupClassName="flex-1"
            aria-invalid={over || undefined}
            value={amount}
            onValueChange={setAmount}
          />
          <Button
            type="button"
            variant="secondary"
            aria-pressed={cents === item.leftCents}
            onClick={() => setAmount(all)}
          >
            Tout
          </Button>
        </div>
        {over ? (
          <p className="text-destructive text-xs">
            Plus que ce qui reste dû ({formatCents(item.leftCents)})
          </p>
        ) : (
          <FieldDescription>
            {owedToMe
              ? `${formatCents(ok ? cents : 0)} reviennent dans vos dépenses du mois de la dépense${rest > 0 && ok ? ` ; ${item.contactName} vous doit encore ${formatCents(rest)}` : ''}. « Réclamer à nouveau » annule.`
              : `${formatCents(ok ? cents : 0)} sortent de vos dépenses : c’était un cadeau${rest > 0 && ok ? ` ; vous lui devez encore ${formatCents(rest)}` : ''}.`}
          </FieldDescription>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor="forgive-note">Note</FieldLabel>
        <Input
          id="forgive-note"
          placeholder="Facultatif"
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={!ok} loading={pending}>
        {cents > 0 ? `Abandonner ${formatCents(cents)}` : 'Abandonner'}
      </Button>
    </form>
  )
}

/** « Réglé autrement »: cash or in kind, on a day, without a transfer. */
function SettledOtherwise({
  item,
  pending,
  onSave,
}: {
  item: ReceivableDto
  pending: boolean
  onSave: (amountCents: number, paidOn: string, note: string | null) => void
}) {
  const today = currentDay()
  const [amount, setAmount] = useState(centsToInput(item.leftCents))
  const [paidOn, setPaidOn] = useState(today)
  const [note, setNote] = useState('')
  const cents = parseEurosToCents(amount) ?? 0
  const over = cents > item.leftCents
  const ok = cents > 0 && !over && paidOn !== '' && paidOn <= today
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (ok) onSave(cents, paidOn, note.trim() || null)
      }}
    >
      <p className="text-muted-foreground text-sm">
        En espèces ou en nature : rien ne passe par vos comptes.
      </p>
      <Field data-invalid={over}>
        <FieldLabel htmlFor="settled-amount">Montant</FieldLabel>
        <AmountField
          id="settled-amount"
          aria-invalid={over || undefined}
          value={amount}
          onValueChange={setAmount}
        />
        {over && (
          <p className="text-destructive text-xs">
            Plus que ce qui reste dû ({formatCents(item.leftCents)})
          </p>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor="settled-day">Jour</FieldLabel>
        <DateField
          id="settled-day"
          title="Jour"
          max={today}
          value={paidOn}
          onChange={setPaidOn}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="settled-note">Note</FieldLabel>
        <Input
          id="settled-note"
          placeholder="Facultatif (« en espèces »)"
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={!ok} loading={pending}>
        Enregistrer
      </Button>
    </form>
  )
}
