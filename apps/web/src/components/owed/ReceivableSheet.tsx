import {
  Button,
  CategoryIcon,
  Field,
  FieldLabel,
  Input,
  Sheet,
  SheetBar,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BanknoteIcon,
  ChevronLeftIcon,
  HandCoinsIcon,
  HandHeartIcon,
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
  unlinkPayment,
} from './queries'

type Screen = 'main' | 'link' | 'other'

/**
 * One item of a person's page (#359, owner's « A. Une feuille par
 * dépense »): its expense, what was received and is left, then « Lier un
 * remboursement », « Réglé autrement » or « Je ne me fais pas rembourser »
 * (« Sam ne veut pas être remboursé » for what the owner owes); « Réclamer
 * à nouveau » once let go. Every change's toast offers « Annuler »; nothing
 * is deleted, the item stays in the history.
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
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const [screen, setScreen] = useState<Screen>('main')
  const owedToMe = item.direction === 'owed_to_me'
  const who = item.contactName
  const percent =
    item.amountCents > 0
      ? Math.min(100, (item.repaidCents / item.amountCents) * 100)
      : 0

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

  const forgive = useMutation({
    mutationFn: () => forgiveReceivable(item.id),
    onSuccess: async () => {
      onClose()
      await afterOwedChanged(queryClient)
      undoToast(
        owedToMe
          ? `Abandonné : ${formatCents(item.leftCents)} reviennent dans vos dépenses`
          : `${who} ne veut pas être remboursé : ${formatCents(item.leftCents)} sortent de vos dépenses`,
        () => unforgiveReceivable(item.id),
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
          ? `${who} vous doit à nouveau`
          : `Vous devez à nouveau à ${who}`,
        () => forgiveReceivable(item.id, item.forgivenNote),
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
        : item.label
  const owedText = `${owedToMe ? `${who} vous doit` : `Vous devez à ${who}`} ${formatCents(item.leftCents)}`
  const header = isMobile ? (
    <SheetBar
      title={title}
      description={owedText}
      onBack={screen !== 'main' ? () => setScreen('main') : undefined}
    />
  ) : (
    <SheetHeader>
      <SheetTitle className="flex items-center gap-1">
        {screen !== 'main' && (
          <Button
            type="button"
            ghost
            variant="secondary"
            iconOnly
            aria-label="Retour"
            onClick={() => setScreen('main')}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
        )}
        <span className="min-w-0 truncate">
          {screen === 'link'
            ? 'Lier un remboursement'
            : screen === 'other'
              ? 'Réglé autrement'
              : item.label}
        </span>
      </SheetTitle>
      <SheetDescription>
        {owedToMe ? `${who} vous doit` : `Vous devez à ${who}`}{' '}
        {formatCents(item.leftCents)}
      </SheetDescription>
    </SheetHeader>
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
            className="bg-muted h-2 overflow-hidden rounded-full"
            role="img"
            aria-label={`${formatCents(item.repaidCents)} reçus sur ${formatCents(item.amountCents)}`}
          >
            <div
              className="bg-chart-delta-good h-full rounded-full"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="flex flex-wrap justify-between gap-x-3 text-xs tabular-nums">
            <span>
              {formatCents(item.repaidCents)} {owedToMe ? 'reçus' : 'rendus'}{' '}
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
        {item.forgivenNote && (
          <p className="text-muted-foreground text-xs">
            « {item.forgivenNote} »
          </p>
        )}

        {item.state === 'open' && (
          <div className="space-y-2">
            <Button
              type="button"
              className="w-full"
              iconStart={<HandCoinsIcon />}
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
              loading={forgive.isPending}
              onClick={() => forgive.mutate()}
            >
              {owedToMe
                ? 'Je ne me fais pas rembourser'
                : `${who} ne veut pas être remboursé`}
            </Button>
            <p className="text-muted-foreground text-xs">
              {owedToMe
                ? `« Je ne me fais pas rembourser » remet ${formatCents(item.leftCents)} dans vos dépenses du mois de la dépense ; elle reste dans l’historique et « Réclamer à nouveau » annule.`
                : `S’il ne veut pas être remboursé, ${formatCents(item.leftCents)} sortent de vos dépenses : c’était un cadeau.`}
            </p>
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

        {item.payments.length > 0 && (
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium">
              Remboursements
            </p>
            <ul className="divide-y text-sm">
              {item.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex min-h-11 flex-wrap items-center gap-x-3"
                >
                  <span className="min-w-0 flex-1 break-normal">
                    {formatCalendarDate(payment.paidOn)} ·{' '}
                    {payment.label ?? 'Réglé autrement'}
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    {formatCents(payment.amountCents)}
                  </span>
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
                </li>
              ))}
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
        <Input
          id="settled-day"
          type="date"
          max={today}
          value={paidOn}
          onChange={(event) => setPaidOn(event.target.value)}
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
