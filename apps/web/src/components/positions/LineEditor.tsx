import {
  Button,
  ConfirmDialog,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetContent,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { PositionLineDto } from '#/api/types.gen'
import {
  decimalToInput,
  parsePriceInput,
  parseQuantityInput,
} from '#/components/crypto/format'
import {
  editorSide,
  FORM_SHEET_FORM,
  FORM_SHEET_SCREEN,
  FORM_SHEET_SIDE,
  FormSheetBody,
  FormSheetMoreActions,
} from '#/components/sheets/form-sheet'
import { isValidIsin, normalizeIsin } from '#/lib/isin'
import { ApiRequestError } from '#/lib/queries'
import {
  afterPositionsChanged,
  removeLine,
  securitiesQuery,
  upsertLine,
} from './queries'
import { shortName } from './lines'

interface Errors {
  isin?: string
  name?: string
  quantity?: string
  unitCost?: string
}

export function lineErrors(
  values: { isin: string; name: string; quantity: string; unitCost: string },
  knownName: string | null,
): Errors {
  const errors: Errors = {}
  const isin = normalizeIsin(values.isin)
  if (isin === '') errors.isin = 'Indiquez l’ISIN'
  else if (!isValidIsin(isin))
    errors.isin = 'ISIN invalide : 12 caractères, dont la clé à la fin'
  if (values.name.trim() === '' && knownName === null)
    errors.name = 'Indiquez le nom de la ligne'
  const quantity = parseQuantityInput(values.quantity)
  if (values.quantity.trim() === '') errors.quantity = 'Indiquez la quantité'
  else if (quantity === null || !/[1-9]/.test(quantity))
    errors.quantity = 'Quantité invalide (ex. 12 ou 3,5)'
  if (
    values.unitCost.trim() !== '' &&
    parsePriceInput(values.unitCost) === null
  )
    errors.unitCost = 'PRU invalide (ex. 412,52)'
  return errors
}

/**
 * Adds or changes a line as of today (ADR 0006: today's statement, or a copy
 * of the latest one dated today), or removes it (sold). A full-screen page on
 * phones, a centred dialog elsewhere.
 */
export function LineEditor({
  open,
  onOpenChange,
  accountId,
  line,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  /** The line to change, or undefined to add one. */
  line?: PositionLineDto
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const securities = useQuery({ ...securitiesQuery, enabled: open && !line })
  const [isin, setIsin] = useState('')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setIsin(line?.isin ?? '')
    setName(line?.name ?? '')
    setQuantity(line ? decimalToInput(line.quantity) : '')
    setUnitCost(line?.unitCostEur ? decimalToInput(line.unitCostEur) : '')
    setSubmitted(false)
  }, [open, line])

  const normalized = normalizeIsin(isin)
  const known =
    line ??
    securities.data?.find((security) => security.isin === normalized) ??
    null
  const errors = lineErrors(
    { isin, name, quantity, unitCost },
    known?.name ?? null,
  )
  const valid = Object.keys(errors).length === 0
  // The save stays greyed out while a field is wrong; a field's error shows
  // once something is typed in it (an empty field only greys the save out).
  const typed = { isin, name, quantity, unitCost }
  const shown: Errors = submitted
    ? errors
    : Object.fromEntries(
        Object.entries(errors).filter(
          ([key]) => typed[key as keyof typeof typed].trim() !== '',
        ),
      )

  const save = useMutation({
    mutationFn: () =>
      upsertLine(accountId, normalized, {
        name: name.trim() === '' ? undefined : name.trim(),
        quantity: parseQuantityInput(quantity)!,
        unitCostEur: unitCost.trim() === '' ? null : parsePriceInput(unitCost),
      }),
    onSuccess: async () => {
      toast.success(
        line
          ? `${shortName(line.name)} mise à jour`
          : `${shortName(name.trim() || (known?.name ?? normalized))} ajoutée`,
      )
      onOpenChange(false)
      await afterPositionsChanged(queryClient)
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiRequestError && error.status === 400
          ? 'Ligne refusée : vérifiez l’ISIN et la quantité.'
          : 'Impossible d’enregistrer la ligne.',
      ),
  })

  const remove = useMutation({
    mutationFn: () => removeLine(accountId, line!.isin),
    onSuccess: async () => {
      toast.success(`${shortName(line!.name)} retirée des lignes`)
      setConfirmOpen(false)
      onOpenChange(false)
      await afterPositionsChanged(queryClient)
    },
    onError: () => toast.error('Impossible de retirer la ligne.'),
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (valid) save.mutate()
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={editorSide(isMobile)}
          className={isMobile ? FORM_SHEET_SCREEN : FORM_SHEET_SIDE}
        >
          <SheetBar
            title={line ? shortName(line.name) : 'Ajouter une ligne'}
            description="Ce que le compte détient aujourd’hui : la ligne compte à partir de ce jour."
            action={
              <SheetBarAction
                type="submit"
                form={`${id}-form`}
                label={line ? 'Enregistrer' : 'Ajouter'}
                loading={save.isPending}
                disabled={!valid}
              />
            }
          />
          <form
            id={`${id}-form`}
            noValidate
            onSubmit={submit}
            className={FORM_SHEET_FORM}
          >
            <FormSheetBody>
              {line ? (
                <p className="text-muted-foreground text-sm">
                  ISIN{' '}
                  <span className="text-foreground font-mono">{line.isin}</span>
                </p>
              ) : (
                <Field data-invalid={shown.isin !== undefined}>
                  <FieldLabel htmlFor={`${id}-isin`}>ISIN</FieldLabel>
                  <Input
                    id={`${id}-isin`}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={16}
                    placeholder="FR0000000000"
                    className="font-mono"
                    value={isin}
                    aria-invalid={shown.isin !== undefined}
                    onChange={(event) => setIsin(event.target.value)}
                  />
                  {shown.isin ? (
                    <FieldError>{shown.isin}</FieldError>
                  ) : (
                    <FieldDescription>
                      Sur votre relevé, à côté du nom de l’ETF.
                    </FieldDescription>
                  )}
                </Field>
              )}
              <Field data-invalid={shown.name !== undefined}>
                <FieldLabel htmlFor={`${id}-name`}>Nom</FieldLabel>
                <Input
                  id={`${id}-name`}
                  maxLength={200}
                  placeholder={known?.name ?? 'ETF Monde'}
                  value={name}
                  aria-invalid={shown.name !== undefined}
                  onChange={(event) => setName(event.target.value)}
                />
                {shown.name && <FieldError>{shown.name}</FieldError>}
              </Field>
              <Field data-invalid={shown.quantity !== undefined}>
                <FieldLabel htmlFor={`${id}-quantity`}>Quantité</FieldLabel>
                <Input
                  id={`${id}-quantity`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="12"
                  value={quantity}
                  aria-invalid={shown.quantity !== undefined}
                  onChange={(event) => setQuantity(event.target.value)}
                />
                {shown.quantity && <FieldError>{shown.quantity}</FieldError>}
              </Field>
              <Field data-invalid={shown.unitCost !== undefined}>
                <FieldLabel htmlFor={`${id}-cost`}>PRU</FieldLabel>
                <Input
                  id={`${id}-cost`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="412,52"
                  value={unitCost}
                  aria-invalid={shown.unitCost !== undefined}
                  onChange={(event) => setUnitCost(event.target.value)}
                />
                {shown.unitCost ? (
                  <FieldError>{shown.unitCost}</FieldError>
                ) : (
                  <FieldDescription>
                    Prix de revient unitaire en euros, facultatif : il donne le
                    résultat de la ligne.
                  </FieldDescription>
                )}
              </Field>
              {line && (
                <FormSheetMoreActions>
                  <Button
                    type="button"
                    variant="danger"
                    outline
                    onClick={() => setConfirmOpen(true)}
                  >
                    Retirer la ligne
                  </Button>
                </FormSheetMoreActions>
              )}
            </FormSheetBody>
          </form>
        </SheetContent>
      </Sheet>
      {line && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Retirer ${shortName(line.name)} ?`}
          description="La ligne ne compte plus à partir d’aujourd’hui (vendue) ; les relevés passés la gardent."
          confirmLabel="Retirer"
          variant="danger"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </>
  )
}
