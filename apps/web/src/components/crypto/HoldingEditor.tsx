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
  RadioCard,
  RadioCardGroup,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
  Textarea,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SearchIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  AccountDto,
  CryptoAssetDto,
  ValuedHoldingDto,
} from '#/api/types.gen'
import { centsToInput, parseAmountToCents } from '#/components/accounts/amount'
import { createAccount } from '#/components/accounts/queries'
import {
  CryptoSourceFields,
  cryptoProviderName,
  type CryptoSourceErrors,
  type CryptoSourceValues,
  EMPTY_CRYPTO_SOURCE,
  validateCryptoSource,
} from './CryptoSourceFields'
import { holdingErrorMessage } from './errors'
import { decimalToInput, parsePriceInput, parseQuantityInput } from './format'
import {
  afterHoldingsChanged,
  assetSearchQuery,
  removeHolding,
  saveHolding,
  setManualPrice,
} from './queries'

const NOTE_MAX = 500
const SEARCH_DELAY_MS = 300
/** "Nouveau wallet ou plateforme" in the account picker. */
const NEW_ACCOUNT = 'new'

type Asset = Pick<CryptoAssetDto, 'id' | 'symbol' | 'name'>

interface HoldingEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Account of the new holding. When undefined (and no `holding`), the owner
   * picks one of `accounts` or sets up a new exchange or wallet, created on
   * save.
   */
  accountId?: string
  /** Open crypto accounts to pick from when `accountId` is undefined. */
  accounts?: readonly Pick<AccountDto, 'id' | 'name'>[]
  /** Edit this holding, or add one when undefined. */
  holding?: ValuedHoldingDto
  /** Without the price API, prices are entered by hand. */
  priceApiEnabled: boolean
}

interface FormErrors extends CryptoSourceErrors {
  asset?: string
  quantity?: string
  invested?: string
  price?: string
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
function AssetPicker({
  id,
  invalid,
  onPick,
}: {
  id: string
  invalid: boolean
  onPick: (asset: Asset) => void
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
          className="max-h-56 divide-y overflow-y-auto rounded-md border"
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
                  className="hover:bg-muted/50 focus-visible:ring-ring flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none focus-visible:ring-2"
                  onClick={() => onPick(asset)}
                >
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
 * Adds, corrects or deletes a holding: an asset, where it is held, the
 * quantity (French decimal comma accepted) and optionally the amount
 * invested. A manual price can be set when prices are not fetched. Without
 * an account, it first asks which one, or which new exchange or wallet: the
 * crypto account is then created on save, so a first holding takes one step.
 */
export function HoldingEditor({
  open,
  onOpenChange,
  accountId,
  accounts = [],
  holding,
  priceApiEnabled,
}: HoldingEditorProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [location, setLocation] = useState('')
  const [quantity, setQuantity] = useState('')
  const [invested, setInvested] = useState('')
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  /** Picked account id, or `NEW_ACCOUNT`. */
  const [target, setTarget] = useState('')
  const [source, setSource] = useState<CryptoSourceValues>(EMPTY_CRYPTO_SOURCE)
  /** Account created by a save whose holding then failed: reused on retry. */
  const created = useRef<AccountDto | null>(null)
  const picksAccount = holding === undefined && accountId === undefined

  // Fresh form on every opening.
  useEffect(() => {
    if (!open) return
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
    setTarget(accounts.at(0)?.id ?? NEW_ACCOUNT)
    setSource(EMPTY_CRYPTO_SOURCE)
    created.current = null
    setSubmitted(false)
    // `accounts` only seeds the picker when the sheet opens.
  }, [open, holding])

  const showPrice = !priceApiEnabled || (holding && holding.priceEur === null)
  const errors: FormErrors =
    picksAccount && target === NEW_ACCOUNT ? validateCryptoSource(source) : {}
  if (!asset) errors.asset = 'Choisissez un actif'
  if (quantity.trim() === '') errors.quantity = 'Indiquez la quantité'
  else if (parseQuantityInput(quantity) === null)
    errors.quantity = 'Quantité invalide (ex. 0,125, jusqu’à 18 décimales)'
  const investedCents =
    invested.trim() === '' ? null : parseAmountToCents(invested)
  if (invested.trim() !== '' && (investedCents === null || investedCents < 0))
    errors.invested = 'Montant invalide (ex. 1 500)'
  if (showPrice && price.trim() !== '' && parsePriceInput(price) === null)
    errors.price = 'Cours invalide (ex. 0,00123)'
  const valid = Object.keys(errors).length === 0

  const save = useMutation({
    mutationFn: async () => {
      let id = holding?.accountId ?? accountId ?? target
      if (picksAccount && target === NEW_ACCOUNT) {
        if (!created.current) {
          const name = cryptoProviderName(source)
          created.current = await createAccount({
            name,
            type: 'crypto',
            institution: name,
          })
        }
        id = created.current.id
      }
      const saved = await saveHolding(id, holding?.id, {
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
    onError: (error) => {
      toast.error(holdingErrorMessage(error))
      // The new account exists even though its holding failed.
      if (created.current) void afterHoldingsChanged(queryClient)
    },
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

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (valid) save.mutate()
  }

  const shown = submitted ? errors : {}

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={
            isMobile
              ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
              : 'overflow-y-auto'
          }
        >
          <SheetHeader className="pb-0">
            <SheetTitle>
              {holding
                ? `${holding.symbol} · ${holding.name}`
                : 'Ajouter un avoir'}
            </SheetTitle>
            <SheetDescription>
              {picksAccount
                ? 'Où il est détenu, puis la quantité.'
                : 'Quantité détenue sur ce compte.'}
            </SheetDescription>
          </SheetHeader>
          <form noValidate onSubmit={submit} className="space-y-4 px-4 pb-6">
            {picksAccount && accounts.length > 0 && (
              <fieldset className="space-y-2">
                <legend
                  id={`${id}-account-legend`}
                  className="mb-2 text-sm font-medium"
                >
                  Compte
                </legend>
                <RadioCardGroup
                  aria-labelledby={`${id}-account-legend`}
                  className="grid-cols-1 sm:grid-cols-2"
                  value={target}
                  onValueChange={setTarget}
                >
                  {accounts.map((account) => (
                    <RadioCard
                      key={account.id}
                      value={account.id}
                      className="font-medium break-words"
                    >
                      {account.name}
                    </RadioCard>
                  ))}
                  <RadioCard value={NEW_ACCOUNT} className="font-medium">
                    Nouveau wallet ou plateforme
                  </RadioCard>
                </RadioCardGroup>
              </fieldset>
            )}
            {picksAccount && target === NEW_ACCOUNT && (
              <CryptoSourceFields
                id={id}
                values={source}
                errors={shown}
                onChange={(patch) =>
                  setSource((current) => ({ ...current, ...patch }))
                }
              />
            )}
            <Field data-invalid={shown.asset !== undefined}>
              <FieldLabel htmlFor={`${id}-asset`}>Actif</FieldLabel>
              {asset ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{asset.symbol}</span>
                  <span className="text-muted-foreground min-w-0 truncate">
                    {asset.name}
                  </span>
                  {!holding && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      outline
                      className="ml-auto"
                      onClick={() => setAsset(null)}
                    >
                      Changer
                    </Button>
                  )}
                </div>
              ) : (
                <AssetPicker
                  id={`${id}-asset`}
                  invalid={shown.asset !== undefined}
                  onPick={setAsset}
                />
              )}
              {shown.asset && <FieldError>{shown.asset}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-location`}>Sous-compte</FieldLabel>
              <Input
                id={`${id}-location`}
                maxLength={100}
                autoComplete="off"
                placeholder="Spot, Bitcoin 1…"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
              <FieldDescription>
                Facultatif : distingue un même actif détenu dans plusieurs
                sous-comptes de cette plateforme ou de ce wallet.
              </FieldDescription>
            </Field>
            <Field data-invalid={shown.quantity !== undefined}>
              <FieldLabel htmlFor={`${id}-quantity`}>Quantité</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={`${id}-quantity`}
                  inputMode="decimal"
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
              {shown.quantity && <FieldError>{shown.quantity}</FieldError>}
            </Field>
            <Field data-invalid={shown.invested !== undefined}>
              <FieldLabel htmlFor={`${id}-invested`}>
                Montant investi
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={`${id}-invested`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="1 500"
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
                  Total payé pour cet avoir, pour calculer la plus-value.
                  Facultatif.
                </FieldDescription>
              )}
            </Field>
            {showPrice && (
              <Field data-invalid={shown.price !== undefined}>
                <FieldLabel htmlFor={`${id}-price`}>Cours manuel</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={`${id}-price`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00123"
                    value={price}
                    aria-invalid={shown.price !== undefined}
                    onChange={(event) => setPrice(event.target.value)}
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
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {holding && (
                <Button
                  type="button"
                  variant="danger"
                  outline
                  onClick={() => setConfirmOpen(true)}
                >
                  Supprimer
                </Button>
              )}
              <Button
                type="submit"
                className="sm:ml-auto"
                loading={save.isPending}
              >
                Enregistrer
              </Button>
            </div>
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
