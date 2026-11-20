import {
  Alert,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
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
  SheetBar,
  SheetBarAction,
  SheetContent,
  SheetSteps,
  useIsMobile,
  cn,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Building2Icon,
  ChevronRightIcon,
  CircleAlertIcon,
  CoinsIcon,
  CompassIcon,
  FileUpIcon,
  HashIcon,
  KeyRoundIcon,
  LandmarkIcon,
  ListChecksIcon,
  PencilIcon,
  PencilLineIcon,
  SlidersHorizontalIcon,
  WalletIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { toast } from 'sonner'
import type {
  AccountDto,
  CryptoAssetChoiceDto,
  CryptoExchangeProvider,
  CryptoImportDto,
  PortfolioAccountDto,
} from '#/api/types.gen'
import { parseAmountToCents } from '#/components/accounts/amount'
import { accountErrorMessage } from '#/components/accounts/errors'
import { accountKeys, createAccount } from '#/components/accounts/queries'
import { FileDropzone } from '#/components/import/FileDropzone'
import { formatCents } from '#/lib/money'
import {
  CRYPTO_PROVIDERS,
  cryptoSourceBody,
  EMPTY_CRYPTO_SOURCE,
  NewWalletKeys,
  OTHER_PROVIDER,
  validateCryptoSource,
  WalletSyncOffNotice,
} from './CryptoSourceFields'
import type { CryptoSourceErrors } from './CryptoSourceFields'
import { holdingErrorMessage } from './errors'
import {
  commitExport,
  discardExport,
  exchangeImportErrorMessage,
  MAX_EXPORT_BYTES,
  previewExport,
} from './exchange-import'
import { isCsv, Preview } from './ExchangeImportSheet'
import {
  formatPrice,
  formatQuantity,
  parsePriceInput,
  parseQuantityInput,
} from './format'
import { AssetPicker } from './HoldingEditor'
import type { Asset } from './HoldingEditor'
import {
  afterHoldingsChanged,
  cryptoSettingsQuery,
  saveHolding,
  setManualPrice,
} from './queries'
import {
  CRYPTO_CHAIN_LABELS,
  CRYPTO_EXCHANGE_PROVIDER_LABELS,
  maskPublicKey,
  publicKeyFormat,
  walletKeyErrorMessage,
} from './sources'
import type { WalletKeyValues } from './WalletKeyFields'

/*
 * « Ajouter » of the Crypto section (#295): one flow in three steps, one
 * decision per screen (the owner's stepped entry). 1. where the cryptos come
 * from; 2. the source's own step: the platform then its export, the wallet
 * then its public keys, or the asset then the quantity; 3. the summary and
 * one button. Replaces the three modes of `HoldingEditor`.
 */

type Source = 'exchange' | 'wallet' | 'manual'

type Screen =
  | 'source'
  | 'exchange-provider'
  | 'exchange-file'
  | 'exchange-summary'
  | 'wallet-provider'
  | 'wallet-keys'
  | 'wallet-summary'
  | 'manual-asset'
  | 'manual-amount'
  | 'manual-summary'

const STEP_COUNT = 4

/** The source's first screen. */
const FIRST: Record<Source, Screen> = {
  exchange: 'exchange-provider',
  wallet: 'wallet-provider',
  manual: 'manual-asset',
}

function stepOf(screen: Screen): number {
  if (screen === 'source') return 1
  if (screen.endsWith('-summary')) return 4
  // Which platform, wallet or asset, then its export, keys or quantity.
  return screen === 'exchange-file' ||
    screen === 'wallet-keys' ||
    screen === 'manual-amount'
    ? 3
    : 2
}

/** The 2nd and 3rd steps' names and icons, after the source chosen. */
function routeSteps(
  screen: Screen,
): [{ label: string; icon: ReactNode }, { label: string; icon: ReactNode }] {
  if (screen.startsWith('exchange'))
    return [
      { label: 'Plateforme', icon: <LandmarkIcon aria-hidden /> },
      { label: 'Export', icon: <FileUpIcon aria-hidden /> },
    ]
  if (screen.startsWith('wallet'))
    return [
      { label: 'Wallet', icon: <WalletIcon aria-hidden /> },
      { label: 'Clés', icon: <KeyRoundIcon aria-hidden /> },
    ]
  if (screen.startsWith('manual'))
    return [
      { label: 'Actif', icon: <CoinsIcon aria-hidden /> },
      { label: 'Quantité', icon: <HashIcon aria-hidden /> },
    ]
  return [
    { label: 'Choix', icon: <PencilIcon aria-hidden /> },
    { label: 'Détails', icon: <SlidersHorizontalIcon aria-hidden /> },
  ]
}

const BACK: Record<Exclude<Screen, 'source'>, Screen> = {
  'exchange-provider': 'source',
  'exchange-file': 'exchange-provider',
  'exchange-summary': 'exchange-file',
  'wallet-provider': 'source',
  'wallet-keys': 'wallet-provider',
  'wallet-summary': 'wallet-keys',
  'manual-asset': 'source',
  'manual-amount': 'manual-asset',
  'manual-summary': 'manual-amount',
}

const SOURCES: {
  value: Source
  label: string
  description: string
  icon: ReactNode
}[] = [
  {
    value: 'exchange',
    label: 'Une plateforme',
    description: 'Binance, Coinbase… depuis son export',
    icon: <Building2Icon />,
  },
  {
    value: 'wallet',
    label: 'Un wallet',
    description: 'Ledger, MetaMask… lu avec ses clés publiques',
    icon: <WalletIcon />,
  },
  {
    value: 'manual',
    label: 'Saisie manuelle',
    description: 'Un actif et sa quantité, mis à jour par vous',
    icon: <PencilLineIcon />,
  },
]

/** Platforms whose « Transactions » export the app reads (#128). */
const IMPORTABLE: readonly CryptoExchangeProvider[] = ['binance', 'coinbase']

/** Name of a manual account set up without one. */
const DEFAULT_MANUAL_NAME = 'Crypto'
/** « Où ? »: a new manual account. */
const NEW_ACCOUNT = 'new'
const NAME_MAX = 100

/** Where the exchange's export goes: an account already followed, or a new one. */
type ExchangeTarget =
  | { kind: 'existing'; accountId: string; name: string }
  | { kind: 'new'; provider: CryptoExchangeProvider }

const importPlural = (count: number) =>
  `${count.toLocaleString('fr-FR')} ${count > 1 ? 'lignes' : 'ligne'}`

/** « Suivant » of a step: the bar's › once a choice is made. */
const NEXT_LABEL = (
  <>
    Suivant
    <ChevronRightIcon aria-hidden />
  </>
)

/** One choice of a list: a tap moves on, or « Suivant » once chosen. */
function ChoiceTile({
  icon,
  label,
  description,
  selected = false,
  onSelect,
}: {
  icon?: ReactNode
  label: string
  description?: string
  /** The choice made before (shown again after a step back). */
  selected?: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'hover:bg-muted/60 focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none focus-visible:ring-2',
          selected &&
            'border-primary bg-[color-mix(in_srgb,var(--primary)_8%,var(--popover))]',
        )}
      >
        {icon && (
          <span
            aria-hidden
            className={cn(
              'bg-muted text-muted-foreground flex size-[32px] shrink-0 items-center justify-center rounded-full [&_svg]:size-[16px]',
              selected && 'bg-primary/15 text-primary',
            )}
          >
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          {description && (
            <span className="text-muted-foreground block text-sm">
              {description}
            </span>
          )}
        </span>
        <ChevronRightIcon
          aria-hidden
          className={cn(
            'size-4 shrink-0',
            selected ? 'text-primary' : 'text-muted-foreground',
          )}
        />
      </button>
    </li>
  )
}

/** The summary of step 3: what will be created, one line per fact. */
function Recap({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <dl className="divide-y rounded-lg border text-sm">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="ml-auto min-w-0 text-right font-medium break-words">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** « Clé Bitcoin », « Adresse EVM · Ethereum, Base ». */
function keyRecapLabel(key: WalletKeyValues, index: number, count: number) {
  const format = publicKeyFormat(key.publicKey)
  const name =
    format.family === 'evm'
      ? `Adresse EVM · ${key.chains.map((chain) => CRYPTO_CHAIN_LABELS[chain]).join(', ')}`
      : format.kind === 'address'
        ? 'Adresse Bitcoin'
        : 'Clé Bitcoin'
  return count > 1 ? `${index + 1}. ${name}` : name
}

export function AddCryptoSheet({
  open,
  onOpenChange,
  accounts,
  priceApiEnabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The open crypto accounts (an export or a line can go to one of them). */
  accounts: readonly PortfolioAccountDto[]
  /** Without the price API, a price is typed with a manual line. */
  priceApiEnabled: boolean
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const settings = useQuery(cryptoSettingsQuery)
  const id = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [screen, setScreen] = useState<Screen>('source')
  /** The choices made, shown again after a step back. */
  const [chosenSource, setChosenSource] = useState<Source | null>(null)
  const [otherPlatform, setOtherPlatform] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Exchange.
  const [exchange, setExchange] = useState<ExchangeTarget>()
  const [importError, setImportError] = useState<string>()
  const [detail, setDetail] = useState<CryptoImportDto>()
  const [choices, setChoices] = useState<Record<string, Asset>>({})
  /** The exchange account a first upload created, reused on a retry. */
  const createdExchange = useRef<AccountDto | null>(null)

  // Wallet.
  const [walletProvider, setWalletProvider] = useState('')
  const [walletName, setWalletName] = useState('')
  const [walletKeys, setWalletKeys] = useState<WalletKeyValues[]>(
    EMPTY_CRYPTO_SOURCE.walletKeys,
  )
  /** A key the API refused (checksum, already followed…). */
  const [keyError, setKeyError] = useState<string>()

  // Manual line.
  const manualAccounts = accounts.filter(
    (account) => account.source === 'manual' || account.source === null,
  )
  const [asset, setAsset] = useState<Asset | null>(null)
  const [quantity, setQuantity] = useState('')
  const [invested, setInvested] = useState('')
  const [price, setPrice] = useState('')
  const [target, setTarget] = useState(NEW_ACCOUNT)
  const [newName, setNewName] = useState('')
  /** The manual account a save created before its line failed. */
  const createdManual = useRef<AccountDto | null>(null)

  // A fresh flow on every opening.
  useEffect(() => {
    if (!open) return
    setScreen('source')
    setChosenSource(null)
    setOtherPlatform(false)
    setSubmitted(false)
    setExchange(undefined)
    setImportError(undefined)
    setDetail(undefined)
    setChoices({})
    createdExchange.current = null
    setWalletProvider('')
    setWalletName('')
    setWalletKeys(EMPTY_CRYPTO_SOURCE.walletKeys)
    setKeyError(undefined)
    setAsset(null)
    setQuantity('')
    setInvested('')
    setPrice('')
    setTarget(manualAccounts.at(0)?.accountId ?? NEW_ACCOUNT)
    setNewName('')
    createdManual.current = null
    // `accounts` only seeds « Où ? » when the flow opens.
  }, [open])

  function go(next: Screen) {
    setSubmitted(false)
    setScreen(next)
  }

  // Each screen is announced by its heading, never a field: no keyboard
  // opens by itself on a phone.
  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [screen, open])

  /** A pending export, not committed: nothing was written, drop it. */
  function dropPending() {
    if (detail && detail.status === 'pending') {
      discardExport(detail.id).catch(() => undefined)
    }
    setDetail(undefined)
    setChoices({})
  }

  function close(next: boolean) {
    if (!next) {
      if (!commit.isPending) dropPending()
      // An exchange set up on the way exists now: the page shows it.
      if (createdExchange.current || createdManual.current) {
        void afterHoldingsChanged(queryClient)
      }
    }
    onOpenChange(next)
  }

  function back() {
    if (screen === 'source') return
    if (screen === 'exchange-summary') dropPending()
    go(BACK[screen])
  }

  /** Back to an earlier step (its icon on a phone), screen by screen. */
  function backTo(stepWanted: number) {
    let next = screen
    while (next !== 'source' && stepOf(next) > stepWanted) {
      if (next === 'exchange-summary') dropPending()
      next = BACK[next]
    }
    if (next !== screen) go(next)
  }

  /* ---- Exchange ---------------------------------------------------- */

  const exchangeName =
    exchange?.kind === 'existing'
      ? exchange.name
      : exchange
        ? CRYPTO_EXCHANGE_PROVIDER_LABELS[exchange.provider]
        : ''

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!exchange) throw new Error('No exchange chosen')
      let accountId: string
      if (exchange.kind === 'existing') accountId = exchange.accountId
      else {
        const { provider } = exchange
        const name = CRYPTO_EXCHANGE_PROVIDER_LABELS[provider]
        if (createdExchange.current?.cryptoProvider !== provider) {
          createdExchange.current = await createAccount({
            name,
            type: 'crypto',
            institution: name,
            cryptoSource: 'exchange',
            cryptoProvider: provider,
          })
        }
        accountId = createdExchange.current.id
      }
      return previewExport(accountId, file)
    },
    onSuccess: (result) => {
      setImportError(undefined)
      setDetail(result)
      go('exchange-summary')
    },
    onError: (error) =>
      setImportError(
        createdExchange.current || exchange?.kind === 'existing'
          ? exchangeImportErrorMessage(error)
          : accountErrorMessage(error),
      ),
  })

  function sendFile(file: File) {
    setImportError(undefined)
    if (!isCsv(file)) {
      setImportError('Choisissez le fichier .csv exporté depuis la plateforme.')
      return
    }
    if (file.size > MAX_EXPORT_BYTES) {
      setImportError('Le fichier dépasse la taille maximale de 5 Mo.')
      return
    }
    upload.mutate(file)
  }

  const commit = useMutation({
    mutationFn: (pending: CryptoImportDto) =>
      commitExport(
        pending.id,
        Object.entries(choices).map(
          ([ticker, choice]): CryptoAssetChoiceDto => ({
            ticker,
            assetId: choice.id,
            symbol: choice.symbol.toUpperCase().slice(0, 20),
            name: choice.name.slice(0, 100),
          }),
        ),
      ),
    onSuccess: async (result) => {
      toast.success(
        result.counts.inserted === 0
          ? 'Export importé : rien de nouveau'
          : `Export importé : ${importPlural(result.counts.inserted)} ${result.counts.inserted > 1 ? 'ajoutées' : 'ajoutée'}`,
      )
      setDetail(undefined)
      onOpenChange(false)
      await Promise.all([
        afterHoldingsChanged(queryClient),
        queryClient.invalidateQueries({ queryKey: accountKeys.all }),
      ])
    },
    onError: (error) => setImportError(exchangeImportErrorMessage(error)),
  })

  /* ---- Wallet ------------------------------------------------------ */

  const walletSource = {
    cryptoKind: 'wallet' as const,
    provider: walletProvider,
    otherProvider: walletName,
    walletKeys,
  }
  const walletErrors: CryptoSourceErrors = validateCryptoSource(walletSource, {
    withSource: true,
  })
  const walletDisplayName =
    walletProvider === OTHER_PROVIDER ? walletName.trim() : walletProvider

  const addWallet = useMutation({
    mutationFn: () =>
      createAccount({
        name: walletDisplayName,
        type: 'crypto',
        institution: walletDisplayName,
        ...cryptoSourceBody(walletSource),
      }),
    onSuccess: async (account) => {
      toast.success(`Wallet « ${account.name} » ajouté`)
      onOpenChange(false)
      await afterHoldingsChanged(queryClient)
      // Its balances are read from its keys on its page.
      void navigate({
        to: '/accounts/$accountId',
        params: { accountId: account.id },
      })
    },
    onError: (error) => {
      const message = walletKeyErrorMessage(error)
      if (message) {
        setKeyError(message)
        go('wallet-keys')
        setSubmitted(true)
      }
      toast.error(message ?? accountErrorMessage(error))
    },
  })

  /* ---- Manual line ------------------------------------------------- */

  const quantityValue = parseQuantityInput(quantity)
  const investedCents =
    invested.trim() === '' ? null : parseAmountToCents(invested)
  const priceValue = price.trim() === '' ? null : parsePriceInput(price)
  const manualErrors: Partial<
    Record<'quantity' | 'invested' | 'price' | 'name', string>
  > = {}
  if (quantity.trim() === '') manualErrors.quantity = 'Indiquez la quantité'
  else if (quantityValue === null)
    manualErrors.quantity =
      'Quantité invalide (ex. 0,125, jusqu’à 18 décimales)'
  if (invested.trim() !== '' && (investedCents === null || investedCents < 0))
    manualErrors.invested = 'Montant invalide (ex. 1 500)'
  if (!priceApiEnabled && price.trim() !== '' && priceValue === null)
    manualErrors.price = 'Cours invalide (ex. 0,00123)'
  if (target === NEW_ACCOUNT && newName.trim().length > NAME_MAX)
    manualErrors.name = '100 caractères maximum'
  const manualAccountName =
    target === NEW_ACCOUNT
      ? newName.trim() || DEFAULT_MANUAL_NAME
      : (manualAccounts.find((account) => account.accountId === target)?.name ??
        '')

  const addLine = useMutation({
    mutationFn: async () => {
      let accountId = target
      if (target === NEW_ACCOUNT) {
        createdManual.current ??= await createAccount({
          name: manualAccountName,
          type: 'crypto',
          institution: newName.trim() || null,
          cryptoSource: 'manual',
        })
        accountId = createdManual.current.id
      }
      const saved = await saveHolding(accountId, undefined, {
        assetId: asset!.id,
        symbol: asset!.symbol,
        name: asset!.name,
        quantity: quantityValue!,
        location: '',
        investedCents,
        note: null,
      })
      if (!priceApiEnabled && priceValue) {
        await setManualPrice(saved.assetId, priceValue)
      }
      return saved
    },
    onSuccess: async (saved) => {
      toast.success(`${saved.symbol} ajouté à « ${manualAccountName} »`)
      onOpenChange(false)
      await afterHoldingsChanged(queryClient)
    },
    onError: (error) => {
      toast.error(holdingErrorMessage(error))
      // The new account exists even though its line failed.
      if (createdManual.current) void afterHoldingsChanged(queryClient)
    },
  })

  /* ---- Screens ----------------------------------------------------- */

  const exchanges = accounts.filter((account) => account.source === 'exchange')
  let title: string
  let body: ReactNode
  let action: {
    label: ReactNode
    loading?: boolean
    disabled?: boolean
  } | null = null
  let onSubmit: () => void = () => undefined

  switch (screen) {
    case 'source':
      title = 'D’où viennent ces cryptos ?'
      body = (
        <ul className="space-y-2">
          {SOURCES.map((source) => (
            <ChoiceTile
              key={source.value}
              icon={source.icon}
              label={source.label}
              description={source.description}
              selected={chosenSource === source.value}
              onSelect={() => {
                setChosenSource(source.value)
                go(FIRST[source.value])
              }}
            />
          ))}
        </ul>
      )
      // A choice made before (a step back): « Suivant » goes on with it.
      action = { label: NEXT_LABEL, disabled: chosenSource === null }
      onSubmit = () => {
        if (chosenSource) go(FIRST[chosenSource])
      }
      break

    case 'exchange-provider':
      title = 'Quelle plateforme ?'
      body = (
        <div className="space-y-4">
          {exchanges.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-muted-foreground text-sm font-medium">
                Déjà suivies
              </h4>
              <ul className="space-y-2">
                {exchanges.map((account) => (
                  <ChoiceTile
                    key={account.accountId}
                    icon={<Building2Icon />}
                    label={account.name}
                    description="Importer un nouvel export"
                    selected={
                      !otherPlatform &&
                      exchange?.kind === 'existing' &&
                      exchange.accountId === account.accountId
                    }
                    onSelect={() => {
                      setOtherPlatform(false)
                      setExchange({
                        kind: 'existing',
                        accountId: account.accountId,
                        name: account.name,
                      })
                      go('exchange-file')
                    }}
                  />
                ))}
              </ul>
            </section>
          )}
          <section className="space-y-2">
            {exchanges.length > 0 && (
              <h4 className="text-muted-foreground text-sm font-medium">
                Nouvelle plateforme
              </h4>
            )}
            <ul className="space-y-2">
              {IMPORTABLE.map((provider) => (
                <ChoiceTile
                  key={provider}
                  icon={<Building2Icon />}
                  label={CRYPTO_EXCHANGE_PROVIDER_LABELS[provider]}
                  selected={
                    !otherPlatform &&
                    exchange?.kind === 'new' &&
                    exchange.provider === provider
                  }
                  onSelect={() => {
                    setOtherPlatform(false)
                    setExchange({ kind: 'new', provider })
                    go('exchange-file')
                  }}
                />
              ))}
              <ChoiceTile
                icon={<PencilLineIcon />}
                label="Une autre plateforme"
                description="Ses exports ne sont pas lus : saisissez ce que vous y détenez."
                selected={otherPlatform}
                onSelect={() => {
                  setOtherPlatform(true)
                  setTarget(NEW_ACCOUNT)
                  go('manual-asset')
                }}
              />
            </ul>
          </section>
        </div>
      )
      action = { label: NEXT_LABEL, disabled: !otherPlatform && !exchange }
      onSubmit = () => {
        if (otherPlatform) {
          setTarget(NEW_ACCOUNT)
          go('manual-asset')
        } else if (exchange) go('exchange-file')
      }
      break

    case 'exchange-file':
      title = `L’export de ${exchangeName}`
      body = (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Exportez l’historique « Transactions » de {exchangeName} au format
            CSV, puis choisissez le fichier : les avoirs sont calculés à partir
            de ses lignes.
          </p>
          {importError && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>{importError}</AlertTitle>
            </Alert>
          )}
          <FileDropzone
            onFile={sendFile}
            busy={upload.isPending}
            hint="Fichier .csv, 5 Mo maximum"
          />
        </div>
      )
      break

    case 'exchange-summary':
      title = 'Récapitulatif'
      body = detail ? (
        <div className="space-y-4">
          {importError && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>{importError}</AlertTitle>
            </Alert>
          )}
          <Preview
            detail={detail}
            choices={choices}
            onChoose={(ticker, choice) =>
              setChoices((current) => {
                const next = { ...current }
                if (choice) next[ticker] = choice
                else delete next[ticker]
                return next
              })
            }
          />
        </div>
      ) : null
      action = {
        label:
          !detail || detail.counts.new === 0
            ? 'Valider'
            : `Importer ${importPlural(detail.counts.new)}`,
        loading: commit.isPending,
      }
      onSubmit = () => detail && commit.mutate(detail)
      break

    case 'wallet-provider':
      title = 'Quel wallet ?'
      body = (
        <ul className="space-y-2">
          {[...CRYPTO_PROVIDERS.wallet, OTHER_PROVIDER].map((provider) => (
            <ChoiceTile
              key={provider}
              icon={<WalletIcon />}
              label={provider === OTHER_PROVIDER ? 'Un autre wallet' : provider}
              selected={walletProvider === provider}
              onSelect={() => {
                setWalletProvider(provider)
                setKeyError(undefined)
                go('wallet-keys')
              }}
            />
          ))}
        </ul>
      )
      action = { label: NEXT_LABEL, disabled: !walletProvider }
      onSubmit = () => {
        if (!walletProvider) return
        setKeyError(undefined)
        go('wallet-keys')
      }
      break

    case 'wallet-keys': {
      const shown: CryptoSourceErrors = submitted ? walletErrors : {}
      title = 'Ses clés publiques'
      body = (
        <div className="space-y-4">
          {walletProvider === OTHER_PROVIDER && (
            <Field data-invalid={shown.otherProvider !== undefined}>
              <FieldLabel htmlFor={`${id}-wallet-name`}>
                Nom du wallet
              </FieldLabel>
              <Input
                id={`${id}-wallet-name`}
                autoComplete="off"
                maxLength={NAME_MAX}
                value={walletName}
                aria-invalid={shown.otherProvider !== undefined}
                onChange={(event) => setWalletName(event.target.value)}
              />
              {shown.otherProvider && (
                <FieldError>{shown.otherProvider}</FieldError>
              )}
            </Field>
          )}
          <NewWalletKeys
            id={id}
            keys={walletKeys}
            errors={shown.walletKeys}
            serverError={keyError}
            provider={walletProvider}
            onChange={(keys) => {
              setKeyError(undefined)
              setWalletKeys(keys)
            }}
          />
          <WalletSyncOffNotice />
        </div>
      )
      action = {
        label: (
          <>
            Suivant
            <ChevronRightIcon aria-hidden />
          </>
        ),
      }
      onSubmit = () => {
        setSubmitted(true)
        if (Object.keys(walletErrors).length === 0 && !keyError) {
          go('wallet-summary')
        }
      }
      break
    }

    case 'wallet-summary': {
      const syncOff = settings.data?.walletSyncEnabled === false
      title = 'Récapitulatif'
      body = (
        <div className="space-y-3">
          <Recap
            rows={[
              ['Wallet', walletDisplayName],
              ...walletKeys.map((key, index): [string, ReactNode] => [
                keyRecapLabel(key, index, walletKeys.length),
                <span key={index} className="font-mono text-xs">
                  {maskPublicKey(key.publicKey.trim())}
                </span>,
              ]),
            ]}
          />
          <p className="text-muted-foreground text-sm">
            {syncOff
              ? 'La synchronisation est désactivée sur ce serveur : ses soldes ne seront pas lus tant qu’elle le reste.'
              : 'Ses soldes sont lus sur la blockchain juste après, sur sa page. Seules les clés publiques sont envoyées.'}
          </p>
        </div>
      )
      action = { label: 'Ajouter le wallet', loading: addWallet.isPending }
      onSubmit = () => addWallet.mutate()
      break
    }

    case 'manual-asset':
      title = 'Quel actif ?'
      body = (
        // The asset kept above the search, whose results run down the rest
        // of the screen: typing moves nothing (#323).
        <div className="space-y-3">
          {asset && (
            <Button
              type="button"
              variant="secondary"
              outline
              className="w-full justify-start"
              onClick={() => go('manual-amount')}
            >
              <span className="truncate">
                Garder {asset.symbol} · {asset.name}
              </span>
            </Button>
          )}
          <Field>
            <FieldLabel htmlFor={`${id}-asset`}>Rechercher un actif</FieldLabel>
            <AssetPicker
              id={`${id}-asset`}
              invalid={false}
              fill
              onPick={(picked) => {
                setAsset(picked)
                go('manual-amount')
              }}
            />
          </Field>
        </div>
      )
      action = { label: NEXT_LABEL, disabled: !asset }
      onSubmit = () => {
        if (asset) go('manual-amount')
      }
      break

    case 'manual-amount': {
      const shown = submitted ? manualErrors : {}
      title = 'Combien ?'
      body = (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground font-medium">{asset?.symbol}</span>{' '}
            · {asset?.name}
          </p>
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
              <InputGroupAddon align="inline-end">
                <InputGroupText>{asset?.symbol}</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            {shown.quantity && <FieldError>{shown.quantity}</FieldError>}
          </Field>
          <Field data-invalid={shown.invested !== undefined}>
            <FieldLabel htmlFor={`${id}-invested`}>Montant investi</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={`${id}-invested`}
                inputMode="decimal"
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
                Ce que ces cryptos vous ont coûté, pour calculer le résultat.
              </FieldDescription>
            )}
          </Field>
          {!priceApiEnabled && (
            <Field data-invalid={shown.price !== undefined}>
              <FieldLabel htmlFor={`${id}-price`}>Cours manuel</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={`${id}-price`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Facultatif"
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
                  Cours automatiques désactivés : saisissez celui de cet actif.
                </FieldDescription>
              )}
            </Field>
          )}
          <fieldset className="space-y-2">
            <legend
              id={`${id}-target-legend`}
              className="mb-2 text-sm font-medium"
            >
              Où sont-elles ?
            </legend>
            {manualAccounts.length > 0 && (
              <RadioCardGroup
                aria-labelledby={`${id}-target-legend`}
                className="grid-cols-1"
                value={target}
                onValueChange={setTarget}
              >
                {manualAccounts.map((account) => (
                  <RadioCard
                    key={account.accountId}
                    value={account.accountId}
                    className="font-medium break-words"
                  >
                    {account.name}
                  </RadioCard>
                ))}
                <RadioCard value={NEW_ACCOUNT} className="font-medium">
                  Ailleurs
                </RadioCard>
              </RadioCardGroup>
            )}
            {target === NEW_ACCOUNT && (
              <Field data-invalid={shown.name !== undefined}>
                <FieldLabel htmlFor={`${id}-new-name`}>
                  Plateforme ou wallet
                </FieldLabel>
                <Input
                  id={`${id}-new-name`}
                  autoComplete="off"
                  maxLength={NAME_MAX}
                  placeholder="Kraken, Bitpanda… (facultatif)"
                  value={newName}
                  aria-invalid={shown.name !== undefined}
                  onChange={(event) => setNewName(event.target.value)}
                />
                {shown.name && <FieldError>{shown.name}</FieldError>}
              </Field>
            )}
          </fieldset>
        </div>
      )
      action = {
        label: (
          <>
            Suivant
            <ChevronRightIcon aria-hidden />
          </>
        ),
      }
      onSubmit = () => {
        setSubmitted(true)
        if (Object.keys(manualErrors).length === 0) go('manual-summary')
      }
      break
    }

    case 'manual-summary':
      title = 'Récapitulatif'
      body = (
        <div className="space-y-3">
          <Recap
            rows={[
              ['Actif', `${asset?.name} (${asset?.symbol})`],
              [
                'Quantité',
                `${quantityValue ? formatQuantity(quantityValue) : ''} ${asset?.symbol ?? ''}`,
              ],
              ...(investedCents !== null
                ? [['Investi', formatCents(investedCents)] as [string, string]]
                : []),
              ...(!priceApiEnabled && priceValue
                ? [['Cours', formatPrice(priceValue)] as [string, string]]
                : []),
              [
                'Compte',
                target === NEW_ACCOUNT
                  ? `${manualAccountName} (nouveau)`
                  : manualAccountName,
              ],
            ]}
          />
          <p className="text-muted-foreground text-sm">
            {priceApiEnabled
              ? 'Sa valeur suit le cours du jour. Vous mettrez la quantité à jour vous-même.'
              : 'Vous mettrez la quantité et le cours à jour vous-même.'}
          </p>
        </div>
      )
      action = { label: 'Ajouter', loading: addLine.isPending }
      onSubmit = () => addLine.mutate()
      break
  }

  const step = stepOf(screen)
  /** The route's screen to name the steps after, once a source is chosen. */
  const routeScreen: Screen =
    screen === 'source' && chosenSource
      ? otherPlatform
        ? 'manual-asset'
        : FIRST[chosenSource]
      : screen
  /**
   * The 3rd step's screen when its choice is already made (a step back
   * from it): a tap on its icon goes forward to it again.
   */
  const entryScreen: Screen | null = routeScreen.startsWith('exchange')
    ? exchange
      ? 'exchange-file'
      : null
    : routeScreen.startsWith('wallet')
      ? walletProvider
        ? 'wallet-keys'
        : null
      : routeScreen.startsWith('manual') && asset
        ? 'manual-amount'
        : null

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  const content = (
    <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetBar
        title="Ajouter des cryptos"
        description={`Étape ${step} sur ${STEP_COUNT} : ${title}`}
        steps={
          <SheetSteps
            current={String(step)}
            onSelect={(key) => {
              const wanted = Number(key)
              if (wanted < step) backTo(wanted)
              else if (wanted === 2 && chosenSource) go(FIRST[chosenSource])
              else if (wanted === 3 && entryScreen) go(entryScreen)
            }}
            steps={[
              {
                key: '1',
                label: 'Origine',
                icon: <CompassIcon aria-hidden />,
              },
              {
                key: '2',
                ...routeSteps(routeScreen)[0],
                disabled: step < 2 && chosenSource === null,
              },
              {
                key: '3',
                ...routeSteps(routeScreen)[1],
                disabled: step < 3 && entryScreen === null,
              },
              {
                key: '4',
                label: 'Vérifier',
                icon: <ListChecksIcon aria-hidden />,
                disabled: step < 4,
              },
            ]}
          />
        }
        onBack={screen !== 'source' ? back : undefined}
        action={
          action && (
            <SheetBarAction
              type="submit"
              label={
                typeof action.label === 'string' ? action.label : 'Suivant'
              }
              icon={
                typeof action.label === 'string' ? undefined : (
                  <ChevronRightIcon aria-hidden strokeWidth={2.6} />
                )
              }
              loading={action.loading}
              disabled={action.disabled}
            />
          )
        }
      />
      <div
        data-sheet-scroll=""
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-4 pt-4"
      >
        {/* The screen's question, on a line of its own. */}
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="pb-3 text-lg leading-snug font-semibold outline-none"
        >
          {title}
        </h3>
        {body}
      </div>
      {/* Beside the page: the step's button at the end; on a phone it is
          the bar's round button (#385). */}
    </form>
  )

  return isMobile ? (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="screen">{content}</SheetContent>
    </Sheet>
  ) : (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="flex h-[min(40rem,calc(100svh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          headingRef.current?.focus()
        }}
      >
        {content}
      </DialogContent>
    </Dialog>
  )
}
