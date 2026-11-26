import {
  Button,
  ConfirmDialog,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetContent,
  SheetSteps,
  Spinner,
  Textarea,
  useIsMobile,
} from '@capi/ui'
import { cn } from '@capi/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRightIcon,
  HashIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { CryptoAssetDto, ValuedHoldingDto } from '#/api/types.gen'
import { centsToInput, parseAmountToCents } from '#/components/accounts/amount'
import {
  FORM_SHEET_FORM,
  FORM_SHEET_SIDE,
  FormSheetBody,
  FormSheetMoreActions,
  editorSide,
  FORM_SHEET_SCREEN,
} from '#/components/sheets/form-sheet'
import { AssetBadge } from './AssetBadge'
import { holdingErrorMessage } from './errors'
import {
  decimalToInput,
  formatPrice,
  formatPriceAge,
  parsePriceInput,
  parseQuantityInput,
} from './format'
import {
  firstStepWithError,
  HOLDING_STEP_NAMES,
  holdingFormErrors,
  holdingSteps,
  stepErrors,
} from './holding-form'
import type { HoldingFormErrors, HoldingStep } from './holding-form'
import {
  afterHoldingsChanged,
  assetSearchQuery,
  removeHolding,
  saveHolding,
  setManualPrice,
} from './queries'

const NOTE_MAX = 500
const SEARCH_DELAY_MS = 300

export type Asset = Pick<CryptoAssetDto, 'id' | 'symbol' | 'name'>

interface HoldingEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Account of the new holding (a holding being edited has its own). */
  accountId?: string
  /** Edit this holding, or add one when undefined. */
  holding?: ValuedHoldingDto
  /** Without the price API, prices are entered by hand. */
  priceApiEnabled: boolean
}

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Search field and result list; the provider (or a built-in list) answers. */
export function AssetPicker({
  id,
  invalid,
  onPick,
  fill = false,
}: {
  id: string
  invalid: boolean
  onPick: (asset: Asset) => void
  /**
   * The results run down the rest of the screen they are alone on (and
   * scroll with it) instead of a short box of their own.
   */
  fill?: boolean
}) {
  const [text, setText] = useState('')
  const query = useDebounced(text.trim(), SEARCH_DELAY_MS)
  const search = useQuery(assetSearchQuery(query))
  const results = search.data ?? []

  return (
    <div className="space-y-2">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Bitcoin, ETH…"
          value={text}
          aria-invalid={invalid}
          onChange={(event) => setText(event.target.value)}
        />
        {search.isFetching && (
          <InputGroupAddon align="inline-end">
            <Spinner />
          </InputGroupAddon>
        )}
      </InputGroup>
      {query.length >= 2 && !search.isPending && (
        <ul
          aria-label="Résultats"
          className={cn(
            'bg-muted/40 rounded-control space-y-1 py-1',
            !fill && 'max-h-56 overflow-y-auto',
          )}
        >
          {search.isError ? (
            <li className="text-muted-foreground p-3 text-sm">
              Recherche indisponible. Réessayez.
            </li>
          ) : results.length === 0 ? (
            <li className="text-muted-foreground p-3 text-sm">
              Aucun actif trouvé.
            </li>
          ) : (
            results.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  className={cn(
                    'hover:bg-muted/50 focus-visible:ring-ring flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset',
                    fill && 'min-h-11',
                  )}
                  onClick={() => onPick(asset)}
                >
                  <AssetBadge symbol={asset.symbol} size="sm" />
                  <span className="font-medium">{asset.symbol}</span>
                  <span className="text-muted-foreground min-w-0 truncate">
                    {asset.name}
                  </span>
                  {asset.rank !== null && (
                    <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                      n° {asset.rank}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

/**
 * Adds, corrects or deletes a line typed by hand on a crypto account, one
 * decision per screen (#323): the asset (its search alone on the screen),
 * then the quantity (French decimal comma accepted) and optionally the
 * amount invested, then where it is held, a manual price when prices are not
 * fetched, and a note. A line being edited keeps its asset and opens at its
 * quantity. The fields scroll above a footer that keeps « Suivant » /
 * « Enregistrer » on screen while the keyboard is open. Setting up a new
 * exchange, wallet or manual account is the Crypto page's « Ajouter » flow
 * (`AddCryptoSheet`, #295).
 */
const HOLDING_STEP_ICONS: Record<HoldingStep, React.ReactNode> = {
  asset: <SearchIcon aria-hidden />,
  amount: <HashIcon aria-hidden />,
  details: <SlidersHorizontalIcon aria-hidden />,
}

export function HoldingEditor({
  open,
  onOpenChange,
  accountId,
  holding,
  priceApiEnabled,
}: HoldingEditorProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const steps = holdingSteps(holding !== undefined)
  const [step, setStep] = useState<HoldingStep>(steps[0])
  const [asset, setAsset] = useState<Asset | null>(null)
  const [location, setLocation] = useState('')
  const [quantity, setQuantity] = useState('')
  const [invested, setInvested] = useState('')
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  /** Steps whose « Suivant » (or « Enregistrer ») was pressed: errors show. */
  const [tried, setTried] = useState<ReadonlySet<HoldingStep>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Fresh form on every opening.
  useEffect(() => {
    if (!open) return
    setStep(holding ? 'amount' : 'asset')
    setAsset(
      holding
        ? { id: holding.assetId, symbol: holding.symbol, name: holding.name }
        : null,
    )
    setLocation(holding?.location ?? '')
    setQuantity(holding ? decimalToInput(holding.quantity) : '')
    setInvested(
      holding?.investedCents == null ? '' : centsToInput(holding.investedCents),
    )
    setPrice(
      holding?.priceSource === 'manual' && holding.priceEur
        ? decimalToInput(holding.priceEur)
        : '',
    )
    setNote(holding?.note ?? '')
    setTried(new Set())
  }, [open, holding])

  const showPrice = !priceApiEnabled || (holding && holding.priceEur === null)
  const errors = holdingFormErrors({
    hasAsset: asset !== null,
    quantity,
    invested,
    price,
    showPrice: Boolean(showPrice),
  })
  const investedCents =
    invested.trim() === '' ? null : parseAmountToCents(invested)

  const save = useMutation({
    mutationFn: async () => {
      const targetId = holding?.accountId ?? accountId
      if (!targetId) throw new Error('No account')
      const saved = await saveHolding(targetId, holding?.id, {
        assetId: asset!.id,
        symbol: asset!.symbol,
        name: asset!.name,
        quantity: parseQuantityInput(quantity)!,
        location: location.trim(),
        investedCents,
        note: note.trim() || null,
      })
      const manual = showPrice && price.trim() !== '' && parsePriceInput(price)
      if (manual) await setManualPrice(saved.assetId, manual)
      return saved
    },
    onSuccess: async (saved) => {
      toast.success(
        holding ? `${saved.symbol} modifié` : `${saved.symbol} ajouté`,
      )
      onOpenChange(false)
      await afterHoldingsChanged(queryClient)
    },
    onError: (error) => toast.error(holdingErrorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () => removeHolding(holding!.accountId, holding!.id),
    onSuccess: async () => {
      toast.success(`${holding!.symbol} supprimé`)
      setConfirmOpen(false)
      onOpenChange(false)
      await afterHoldingsChanged(queryClient)
    },
    onError: (error) => toast.error(holdingErrorMessage(error)),
  })

  const stepIndex = steps.indexOf(step)
  const last = stepIndex === steps.length - 1

  // Each step starts on its heading on a phone (no keyboard popping up), on
  // its first field elsewhere so typing goes straight to it.
  function focusStep(mobile: boolean) {
    const field = mobile
      ? null
      : fieldRef.current?.querySelector<HTMLElement>('input, textarea')
    ;(field ?? headingRef.current)?.focus({ preventScroll: true })
  }
  // On a step change, in the commit that shows it; the opening is focused
  // by the sheet (its content mounts a render later).
  useEffect(() => {
    if (open) focusStep(isMobile)
  }, [open, step, isMobile])

  function pickAsset(picked: Asset) {
    setAsset(picked)
    setStep('amount')
  }

  // « Suivant » (and Enter in a field) moves on once the step is right; the
  // last step saves, back to the first step that still lacks something.
  function submit(event: React.FormEvent) {
    event.preventDefault()
    setTried((current) => new Set(current).add(step))
    if (!last) {
      if (Object.keys(stepErrors(errors, step)).length === 0)
        setStep(steps[stepIndex + 1])
      return
    }
    const wrong = firstStepWithError(errors, steps)
    if (wrong) {
      setTried(new Set(steps))
      setStep(wrong)
      return
    }
    save.mutate()
  }

  const shown: HoldingFormErrors = tried.has(step)
    ? stepErrors(errors, step)
    : {}
  const title = holding
    ? `Modifier ${holding.symbol}${holding.location ? ` · ${holding.location}` : ''}`
    : 'Ajouter un avoir'

  // « OK » on a phone's keyboard closes it, back to the button; Enter saves
  // on a computer.
  const blurOnEnter = isMobile
    ? (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        event.currentTarget.blur()
      }
    : undefined

  /** The asset chosen, at the top of the later steps. */
  const recap = asset && (
    <p className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm">
      <AssetBadge symbol={asset.symbol} size="sm" />
      <span className="min-w-0 truncate">
        <span className="text-foreground font-medium">{asset.symbol}</span> ·{' '}
        {asset.name}
      </span>
    </p>
  )

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={editorSide(isMobile)}
          className={isMobile ? FORM_SHEET_SCREEN : FORM_SHEET_SIDE}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            focusStep(isMobile)
          }}
        >
          <form noValidate onSubmit={submit} className={FORM_SHEET_FORM}>
            <SheetBar
              titleRef={headingRef}
              title={title}
              description={`Étape ${stepIndex + 1} sur ${steps.length} : ${HOLDING_STEP_NAMES[step]}`}
              steps={
                <SheetSteps
                  current={step}
                  onSelect={(key) => setStep(key as HoldingStep)}
                  steps={steps.map((key, index) => ({
                    key,
                    label: HOLDING_STEP_NAMES[key],
                    icon: HOLDING_STEP_ICONS[key],
                    // Back any time; ahead once the asset is chosen.
                    disabled: index > stepIndex && !asset,
                  }))}
                />
              }
              onBack={
                stepIndex > 0 ? () => setStep(steps[stepIndex - 1]) : undefined
              }
              action={
                <SheetBarAction
                  type="submit"
                  label={last ? 'Enregistrer' : 'Suivant'}
                  icon={
                    last ? undefined : (
                      <ChevronRightIcon aria-hidden strokeWidth={2.6} />
                    )
                  }
                  loading={last && save.isPending}
                  disabled={step === 'asset' && !asset}
                />
              }
            />

            <FormSheetBody ref={fieldRef}>
              {step === 'asset' && (
                <>
                  {asset && (
                    <Button
                      type="button"
                      variant="secondary"
                      outline
                      className="w-full justify-start"
                      onClick={() => setStep('amount')}
                    >
                      <span className="truncate">
                        Garder {asset.symbol} · {asset.name}
                      </span>
                    </Button>
                  )}
                  <Field data-invalid={shown.asset !== undefined}>
                    <FieldLabel htmlFor={`${id}-asset`}>
                      Rechercher un actif
                    </FieldLabel>
                    <AssetPicker
                      id={`${id}-asset`}
                      invalid={shown.asset !== undefined}
                      onPick={pickAsset}
                      fill
                    />
                    {shown.asset && <FieldError>{shown.asset}</FieldError>}
                  </Field>
                </>
              )}

              {step === 'amount' && (
                <>
                  {recap}
                  {/* The row shows no price (#323): it is here. */}
                  {holding?.priceEur && holding.priceFetchedAt && (
                    <p className="text-muted-foreground text-sm">
                      Cours {formatPrice(holding.priceEur)} ·{' '}
                      {holding.priceSource === 'manual' ? 'manuel, ' : ''}
                      {formatPriceAge(holding.priceFetchedAt, new Date())}
                    </p>
                  )}
                  <Field data-invalid={shown.quantity !== undefined}>
                    <FieldLabel htmlFor={`${id}-quantity`}>Quantité</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={`${id}-quantity`}
                        inputMode="decimal"
                        enterKeyHint="next"
                        autoComplete="off"
                        placeholder="0,125"
                        value={quantity}
                        aria-invalid={shown.quantity !== undefined}
                        onChange={(event) => setQuantity(event.target.value)}
                      />
                      {asset && (
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>{asset.symbol}</InputGroupText>
                        </InputGroupAddon>
                      )}
                    </InputGroup>
                    {shown.quantity && (
                      <FieldError>{shown.quantity}</FieldError>
                    )}
                  </Field>
                  <Field data-invalid={shown.invested !== undefined}>
                    <FieldLabel htmlFor={`${id}-invested`}>
                      Montant investi
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={`${id}-invested`}
                        inputMode="decimal"
                        enterKeyHint="next"
                        autoComplete="off"
                        placeholder="Facultatif"
                        value={invested}
                        aria-invalid={shown.invested !== undefined}
                        onChange={(event) => setInvested(event.target.value)}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>€</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    {shown.invested ? (
                      <FieldError>{shown.invested}</FieldError>
                    ) : (
                      <FieldDescription>
                        Total payé pour cet avoir, pour calculer le résultat.
                      </FieldDescription>
                    )}
                  </Field>
                </>
              )}

              {step === 'details' && (
                <>
                  {recap}
                  <Field>
                    <FieldLabel htmlFor={`${id}-location`}>
                      Sous-compte
                    </FieldLabel>
                    <Input
                      id={`${id}-location`}
                      maxLength={100}
                      autoComplete="off"
                      enterKeyHint="done"
                      placeholder="Facultatif : Spot, Bitcoin 1…"
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      onKeyDown={blurOnEnter}
                    />
                    <FieldDescription>
                      Distingue un même actif détenu à plusieurs endroits de ce
                      compte.
                    </FieldDescription>
                  </Field>
                  {showPrice && (
                    <Field data-invalid={shown.price !== undefined}>
                      <FieldLabel htmlFor={`${id}-price`}>
                        Cours manuel
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id={`${id}-price`}
                          inputMode="decimal"
                          enterKeyHint="done"
                          autoComplete="off"
                          placeholder="0,00123"
                          value={price}
                          aria-invalid={shown.price !== undefined}
                          onChange={(event) => setPrice(event.target.value)}
                          onKeyDown={blurOnEnter}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>€ / unité</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                      {shown.price ? (
                        <FieldError>{shown.price}</FieldError>
                      ) : (
                        <FieldDescription>
                          {priceApiEnabled
                            ? 'Le service de cours ne connaît pas cet actif : saisissez son cours.'
                            : 'Cours automatiques désactivés : saisissez le cours de cet actif.'}
                        </FieldDescription>
                      )}
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor={`${id}-note`}>Note</FieldLabel>
                    <Textarea
                      id={`${id}-note`}
                      rows={2}
                      maxLength={NOTE_MAX}
                      placeholder="Facultatif"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </Field>
                </>
              )}
              {holding && (
                <FormSheetMoreActions>
                  <Button
                    type="button"
                    variant="danger"
                    outline
                    onClick={() => setConfirmOpen(true)}
                  >
                    Supprimer la ligne
                  </Button>
                </FormSheetMoreActions>
              )}
            </FormSheetBody>
          </form>
        </SheetContent>
      </Sheet>
      {holding && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Supprimer ${holding.symbol}${holding.location ? ` (${holding.location})` : ''} ?`}
          description="La valeur du compte sera recalculée sans cet avoir. Les valeurs passées sont conservées."
          confirmLabel="Supprimer"
          variant="danger"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </>
  )
}
