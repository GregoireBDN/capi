import {
  Button,
  cn,
  ConfirmDialog,
  DateField,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  NativeSelect,
  NativeSelectOption,
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetContent,
  useIsMobile,
} from '@capi/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CoinsIcon, InfoIcon, PencilIcon, PlusIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { DividendDto, DividendsDto } from '#/api/types.gen'
import type { AccountDetail } from '#/components/accounts/AccountDetails'
import { todayInParis } from '#/components/accounts/dates'
import { centsToInput, parseAmountToCents } from '#/components/accounts/amount'
import { AmountField } from '#/components/amount/AmountField'
import { LARGE_AMOUNT_CENTS } from '#/components/amount/signed-amount'
import {
  editorSide,
  FORM_SHEET_FORM,
  FORM_SHEET_SCREEN,
  FORM_SHEET_SIDE,
  FormSheetBody,
  FormSheetMoreActions,
} from '#/components/sheets/form-sheet'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { DIVIDED_LIST, ROW_BUTTON } from '#/lib/row-list'
import { shortName } from './lines'
import {
  createDividend,
  dividendsQuery,
  positionKeys,
  positionsQuery,
  removeDividend,
  updateDividend,
} from './queries'

/**
 * A compte-titres' own facts (#414), at the end of its summary like a PEA's
 * ceiling and 5 years: the dividends of the last twelve months, and that its
 * gains are taxed when sold. Information only: no tax is computed.
 */
export function SecuritiesFacts({ accountId }: { accountId: string }) {
  const dividends = useQuery(dividendsQuery(accountId))
  const data = dividends.data
  return (
    <div className="space-y-2 border-t pt-4">
      {data && (
        <p className="flex items-baseline gap-x-3 text-sm">
          <span className="text-muted-foreground min-w-0 break-normal">
            Dividendes sur 12 mois
          </span>
          <span
            className={cn(
              'ml-auto shrink-0 whitespace-nowrap tabular-nums',
              data.last12MonthsCents > 0
                ? 'font-semibold'
                : 'text-muted-foreground',
            )}
          >
            {data.last12MonthsCents > 0
              ? formatCents(data.last12MonthsCents)
              : 'Aucun'}
          </span>
        </p>
      )}
      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <InfoIcon aria-hidden className="mt-px size-3.5 shrink-0" />
        Les plus-values ne sont imposées qu’à la vente.
      </p>
    </div>
  )
}

/**
 * « Dividendes » (#414): a row of « Plus d’informations » whose screen lists
 * them newest first with their totals, a tap opening one to correct or
 * delete, and adding one. Absent on an archived account without any.
 */
export function useDividendsDetail({
  accountId,
  enabled,
  onAdd,
  onEdit,
}: {
  accountId: string
  /** Only a compte-titres has dividends. */
  enabled: boolean
  /** Absent when the account can't be changed (archived). */
  onAdd?: () => void
  onEdit?: (dividend: DividendDto) => void
}): AccountDetail | null {
  const dividends = useQuery({ ...dividendsQuery(accountId), enabled })
  const data = dividends.data
  if (!enabled || !data) return null
  if (data.dividends.length === 0 && !onAdd) return null
  const latest = data.dividends.at(0)
  return {
    id: 'dividends',
    icon: CoinsIcon,
    label: 'Dividendes',
    summary: latest
      ? `${data.dividends.length} · dernier le ${formatShortDay(latest.paidOn, todayInParis().slice(0, 4))}`
      : 'aucun',
    description:
      'Ce que vos lignes vous ont versé, d’après les avis de votre courtier. Pour information : ils ne changent ni la valeur ni le montant investi.',
    content: <DividendList data={data} onAdd={onAdd} onEdit={onEdit} />,
  }
}

function DividendList({
  data,
  onAdd,
  onEdit,
}: {
  data: DividendsDto
  onAdd?: () => void
  onEdit?: (dividend: DividendDto) => void
}) {
  return (
    <>
      {onAdd && (
        <Button
          outline
          variant="secondary"
          className="w-full"
          iconStart={<PlusIcon />}
          onClick={onAdd}
        >
          Ajouter un dividende
        </Button>
      )}
      {data.dividends.length > 0 && (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Sur 12 mois</dt>
              <dd className="font-semibold whitespace-nowrap tabular-nums">
                {formatCents(data.last12MonthsCents)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Au total</dt>
              <dd className="font-semibold whitespace-nowrap tabular-nums">
                {formatCents(data.totalCents)}
              </dd>
            </div>
          </dl>
          <ul className={DIVIDED_LIST} aria-label="Dividendes">
            {data.dividends.map((dividend) => {
              const row =
                'flex items-center gap-3 px-2 py-2.5 text-left text-sm'
              const details = <DividendDetails dividend={dividend} />
              return (
                <li key={dividend.id}>
                  {onEdit ? (
                    <button
                      type="button"
                      aria-label={`Modifier le dividende du ${formatCalendarDate(dividend.paidOn)}`}
                      onClick={() => onEdit(dividend)}
                      className={cn(ROW_BUTTON, row)}
                    >
                      {details}
                      <PencilIcon
                        aria-hidden
                        className="text-muted-foreground size-4 shrink-0"
                      />
                    </button>
                  ) : (
                    <div className={row}>{details}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}

function DividendDetails({ dividend }: { dividend: DividendDto }) {
  return (
    // The amount goes under the date when both don't fit side by side.
    <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1">
      <div className="min-w-[7rem] flex-1">
        <p className="font-medium whitespace-nowrap">
          {formatCalendarDate(dividend.paidOn)}
        </p>
        {dividend.securityName && (
          <p className="text-muted-foreground text-xs break-normal">
            {shortName(dividend.securityName)}
          </p>
        )}
      </div>
      <p className="ml-auto font-medium whitespace-nowrap tabular-nums">
        {formatCents(dividend.amountCents)}
      </p>
    </div>
  )
}

interface DividendErrors {
  paidOn?: string
  amount?: string
}

/** Field errors of the dividend editor; empty when it can be saved. */
export function dividendErrors(
  values: { paidOn: string; amount: string },
  today: string,
): DividendErrors {
  const errors: DividendErrors = {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.paidOn))
    errors.paidOn = 'Indiquez une date'
  else if (values.paidOn > today)
    errors.paidOn = 'La date ne peut pas être dans le futur'
  const cents = parseAmountToCents(values.amount)
  if (values.amount.trim() === '') errors.amount = 'Indiquez le montant'
  else if (cents === null) errors.amount = 'Montant invalide (ex. 12,34)'
  else if (cents <= 0) errors.amount = 'Le montant doit être positif'
  return errors
}

/** A dividend typed from the broker's notice: added, corrected, deleted. */
export function DividendSheet({
  open,
  onOpenChange,
  accountId,
  dividend,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  /** The dividend to change, or undefined to add one. */
  dividend?: DividendDto
  today: string
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const positions = useQuery({ ...positionsQuery(accountId), enabled: open })
  const [paidOn, setPaidOn] = useState(today)
  const [amount, setAmount] = useState('')
  const [isin, setIsin] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setPaidOn(dividend?.paidOn ?? today)
    setAmount(dividend ? centsToInput(dividend.amountCents) : '')
    setIsin(dividend?.isin ?? '')
  }, [open, dividend, today])

  const errors = dividendErrors({ paidOn, amount }, today)
  const valid = Object.keys(errors).length === 0
  // An error shows once something is typed: an empty new form isn't wrong.
  const shownAmount = amount.trim() === '' ? undefined : errors.amount

  // The account's lines, and the dividend's own security if it was sold.
  const lines = positions.data?.lines ?? []
  const options = lines.map((line) => ({ isin: line.isin, name: line.name }))
  if (
    dividend?.isin &&
    dividend.securityName &&
    !options.some((option) => option.isin === dividend.isin)
  ) {
    options.push({ isin: dividend.isin, name: dividend.securityName })
  }

  const done = (saved: DividendsDto, message: string) => {
    queryClient.setQueryData(positionKeys.dividends(accountId), saved)
    toast.success(message)
    onOpenChange(false)
  }
  const save = useMutation({
    mutationFn: () => {
      const body = {
        paidOn,
        amountCents: parseAmountToCents(amount)!,
        isin: isin === '' ? null : isin,
      }
      return dividend
        ? updateDividend(accountId, dividend.id, body)
        : createDividend(accountId, body)
    },
    onSuccess: (saved) =>
      done(saved, dividend ? 'Dividende modifié' : 'Dividende ajouté'),
    onError: () => toast.error('Impossible d’enregistrer le dividende.'),
  })
  const remove = useMutation({
    mutationFn: () => removeDividend(accountId, dividend!.id),
    onSuccess: (saved) => {
      setConfirmOpen(false)
      done(saved, 'Dividende supprimé')
    },
    onError: () => toast.error('Impossible de supprimer le dividende.'),
  })

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={editorSide(isMobile)}
          className={isMobile ? FORM_SHEET_SCREEN : FORM_SHEET_SIDE}
        >
          <SheetBar
            title={dividend ? 'Modifier le dividende' : 'Ajouter un dividende'}
            description="Le montant net reçu, d’après l’avis de votre courtier."
            action={
              <SheetBarAction
                type="submit"
                form={`${id}-form`}
                label="Enregistrer"
                loading={save.isPending}
                disabled={!valid}
              />
            }
          />
          <form
            id={`${id}-form`}
            noValidate
            className={FORM_SHEET_FORM}
            onSubmit={(event) => {
              event.preventDefault()
              if (valid) save.mutate()
            }}
          >
            <FormSheetBody>
              <Field data-invalid={errors.paidOn !== undefined}>
                <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
                <DateField
                  id={`${id}-date`}
                  title="Date du dividende"
                  max={today}
                  value={paidOn}
                  aria-invalid={errors.paidOn !== undefined}
                  onChange={setPaidOn}
                />
                {errors.paidOn && <FieldError>{errors.paidOn}</FieldError>}
              </Field>
              <Field data-invalid={shownAmount !== undefined}>
                <FieldLabel htmlFor={`${id}-amount`}>Montant net</FieldLabel>
                <AmountField
                  id={`${id}-amount`}
                  maxCents={LARGE_AMOUNT_CENTS}
                  placeholder="12,34"
                  value={amount}
                  aria-invalid={shownAmount !== undefined}
                  onValueChange={(typed) => setAmount(typed)}
                />
                {shownAmount && <FieldError>{shownAmount}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-line`}>Ligne</FieldLabel>
                <NativeSelect
                  id={`${id}-line`}
                  className="w-full"
                  value={isin}
                  onChange={(event) => setIsin(event.target.value)}
                >
                  <NativeSelectOption value="">Non précisée</NativeSelectOption>
                  {options.map((option) => (
                    <NativeSelectOption key={option.isin} value={option.isin}>
                      {shortName(option.name)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>
                  Le titre qui l’a versé, si vous voulez le garder.
                </FieldDescription>
              </Field>
              {dividend && (
                <FormSheetMoreActions>
                  <Button
                    type="button"
                    variant="danger"
                    outline
                    onClick={() => setConfirmOpen(true)}
                  >
                    Supprimer le dividende
                  </Button>
                </FormSheetMoreActions>
              )}
            </FormSheetBody>
          </form>
        </SheetContent>
      </Sheet>
      {dividend && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Supprimer ce dividende ?"
          description={`Le dividende du ${formatCalendarDate(dividend.paidOn)} (${formatCents(dividend.amountCents)}) ne sera plus compté.`}
          confirmLabel="Supprimer"
          variant="danger"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </>
  )
}
