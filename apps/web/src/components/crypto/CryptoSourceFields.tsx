import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  FieldError,
  FieldLabel,
  Field,
  Input,
  RadioCard,
  RadioCardGroup,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import {
  Building2Icon,
  PencilLineIcon,
  PlusIcon,
  Trash2Icon,
  WalletIcon,
} from 'lucide-react'
import type { CreateAccountDto } from '#/api/types.gen'
import { cryptoSettingsQuery } from './queries'
import { exchangeProviderOf } from './sources'
import {
  EMPTY_WALLET_KEY,
  validateWalletKey,
  walletKeyBody,
  WalletKeyFields,
} from './WalletKeyFields'
import type { WalletKeyErrors, WalletKeyValues } from './WalletKeyFields'

const NAME_MAX = 100
/** Keys typed when a wallet is set up (more can be added from its page). */
export const WALLET_KEYS_MAX = 20

/**
 * Where a crypto account's holdings come from: an exchange (its exports), a
 * self-custody wallet (its public key) or typed by hand.
 */
export type CryptoKind = 'exchange' | 'wallet' | 'manual'

/** "Autre…" in the provider list: the owner types the name. */
export const OTHER_PROVIDER = 'other'

/** Common providers, in the order of the list ("Autre…" comes last). */
export const CRYPTO_PROVIDERS: Record<
  Exclude<CryptoKind, 'manual'>,
  readonly string[]
> = {
  exchange: ['Binance', 'Coinbase', 'Kraken', 'Bitpanda'],
  wallet: ['Ledger', 'Trezor', 'MetaMask'],
}

const CRYPTO_KIND_TEXT: Record<
  CryptoKind,
  {
    label: string
    description: string
    /** Description when the choice also sets how holdings are fed. */
    sourceDescription: string
    field: string
    other: string
  }
> = {
  exchange: {
    label: 'Plateforme d’échange',
    description: 'Binance, Coinbase…',
    sourceDescription: 'Binance, Coinbase… avoirs tirés de ses exports.',
    field: 'Plateforme',
    other: 'Nom de la plateforme',
  },
  wallet: {
    label: 'Wallet',
    description: 'Ledger, MetaMask…',
    sourceDescription: 'Ledger, MetaMask… avoirs lus avec ses clés publiques.',
    field: 'Wallet',
    other: 'Nom du wallet',
  },
  manual: {
    label: 'Saisie manuelle',
    description: 'Avoirs saisis à la main.',
    sourceDescription: 'Avoirs saisis à la main.',
    field: '',
    other: 'Plateforme ou wallet (facultatif)',
  },
}

/** The exchange or wallet a new crypto account is set up from. */
export interface CryptoSourceValues {
  cryptoKind: CryptoKind | ''
  /** A name from `CRYPTO_PROVIDERS`, `OTHER_PROVIDER` or '' (none yet). */
  provider: string
  /** Name typed after "Autre…", or where manual holdings are (optional). */
  otherProvider: string
  /**
   * Wallet source: the public keys to read it from (a Ledger often has a
   * Bitcoin xpub / zpub and an EVM address). Never empty.
   */
  walletKeys: WalletKeyValues[]
}

export interface CryptoSourceErrors {
  cryptoKind?: string
  provider?: string
  otherProvider?: string
  /** Per key, in the order of `walletKeys`; set only when one has errors. */
  walletKeys?: WalletKeyErrors[]
  /** A key the API refused (it does not say which one). */
  walletKeysError?: string
}

export const EMPTY_CRYPTO_SOURCE: CryptoSourceValues = {
  cryptoKind: '',
  provider: '',
  otherProvider: '',
  walletKeys: [EMPTY_WALLET_KEY],
}

/** The exchange or wallet chosen (or typed for manual holdings), or ''. */
export function cryptoProviderName(values: CryptoSourceValues): string {
  return values.provider === OTHER_PROVIDER || values.cryptoKind === 'manual'
    ? values.otherProvider.trim()
    : values.provider
}

/**
 * Source fields of the account to create (or of a manual account turned into
 * an exchange or a wallet): the source, the exchange provider and the wallet
 * keys. For forms where the choice sets the source (`withSource`).
 */
export function cryptoSourceBody(
  values: CryptoSourceValues,
): Pick<CreateAccountDto, 'cryptoSource' | 'cryptoProvider' | 'walletKeys'> {
  if (values.cryptoKind === 'exchange')
    return {
      cryptoSource: 'exchange',
      cryptoProvider: exchangeProviderOf(cryptoProviderName(values)),
    }
  if (values.cryptoKind === 'wallet')
    return {
      cryptoSource: 'wallet',
      walletKeys: values.walletKeys.map(walletKeyBody),
    }
  return { cryptoSource: 'manual' }
}

export function validateCryptoSource(
  values: CryptoSourceValues,
  { withSource = false }: { withSource?: boolean } = {},
): CryptoSourceErrors {
  const errors: CryptoSourceErrors = {}
  if (values.cryptoKind === '')
    errors.cryptoKind = withSource
      ? 'Choisissez d’où viennent les avoirs'
      : 'Choisissez une plateforme ou un wallet'
  else if (values.cryptoKind === 'manual') {
    if (values.otherProvider.trim().length > NAME_MAX)
      errors.otherProvider = '100 caractères maximum'
  } else if (values.provider === '')
    errors.provider =
      values.cryptoKind === 'exchange'
        ? 'Choisissez la plateforme'
        : 'Choisissez le wallet'
  else if (values.provider === OTHER_PROVIDER) {
    const other = values.otherProvider.trim()
    if (other === '') errors.otherProvider = 'Indiquez son nom'
    else if (other.length > NAME_MAX)
      errors.otherProvider = '100 caractères maximum'
  }
  if (withSource && values.cryptoKind === 'wallet') {
    const seen = new Set<string>()
    const keyErrors = values.walletKeys.map((key) => {
      const keyError = validateWalletKey(key)
      const text = key.publicKey.trim().toLowerCase()
      if (!keyError.publicKey && seen.has(text))
        keyError.publicKey = 'Cette clé est déjà saisie ci-dessus'
      seen.add(text)
      return keyError
    })
    if (keyErrors.some((keyError) => Object.keys(keyError).length > 0))
      errors.walletKeys = keyErrors
  }
  return errors
}

/**
 * The wallet keys typed when a wallet is set up: one block per key, removable
 * while there are several, and "Ajouter une autre clé".
 */
function NewWalletKeys({
  id,
  keys,
  errors,
  serverError,
  provider,
  onChange,
}: {
  id: string
  /** The wallet chosen, for « Où trouver ma clé ? ». */
  provider?: string
  keys: readonly WalletKeyValues[]
  errors: readonly WalletKeyErrors[] | undefined
  serverError: string | undefined
  onChange: (keys: WalletKeyValues[]) => void
}) {
  const single = keys.length === 1
  const update = (index: number, patch: Partial<WalletKeyValues>) =>
    onChange(keys.map((key, i) => (i === index ? { ...key, ...patch } : key)))
  return (
    <div className="space-y-3">
      {keys.map((key, index) => {
        const keyErrors = errors?.[index] ?? {}
        const fields = (
          <WalletKeyFields
            id={`${id}-key-${index}`}
            label={single ? undefined : `Clé publique ${index + 1}`}
            values={key}
            provider={provider}
            errors={
              single && serverError && !keyErrors.publicKey
                ? { ...keyErrors, publicKey: serverError }
                : keyErrors
            }
            onChange={(patch) => update(index, patch)}
          />
        )
        return single ? (
          <div key={index} className="space-y-4">
            {fields}
          </div>
        ) : (
          <div key={index} className="space-y-4 rounded-lg border p-3">
            {fields}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              ghost
              iconStart={<Trash2Icon />}
              aria-label={`Retirer la clé publique ${index + 1}`}
              onClick={() => onChange(keys.filter((_, i) => i !== index))}
            >
              Retirer cette clé
            </Button>
          </div>
        )
      })}
      {!single && serverError && <FieldError>{serverError}</FieldError>}
      {keys.length < WALLET_KEYS_MAX && (
        <Button
          type="button"
          size="sm"
          outline
          variant="secondary"
          iconStart={<PlusIcon />}
          onClick={() => onChange([...keys, EMPTY_WALLET_KEY])}
        >
          Ajouter une autre clé
        </Button>
      )}
      <p className="text-muted-foreground text-xs">
        Une clé par compte du wallet : par exemple la xpub du compte Bitcoin et
        l’adresse 0x d’Ethereum.
      </p>
    </div>
  )
}

/**
 * Wallet sync is off on this server: a wallet account would stay empty until
 * it is turned on, so the form says so before anything is created.
 */
function WalletSyncOffNotice() {
  const settings = useQuery(cryptoSettingsQuery)
  if (settings.data?.walletSyncEnabled !== false) return null
  return (
    <Alert variant="warning">
      <AlertTitle>Synchronisation des wallets désactivée</AlertTitle>
      <AlertDescription>
        Ce serveur ne lit pas les blockchains : le wallet sera créé avec ses
        clés, mais ses avoirs n’apparaîtront qu’une fois la synchronisation
        activée (WALLET_SYNC_ENABLED). En attendant, ajoutez-les à la main
        depuis sa page.
      </AlertDescription>
    </Alert>
  )
}

const KIND_ICONS = {
  exchange: Building2Icon,
  wallet: WalletIcon,
  manual: PencilLineIcon,
} as const

/**
 * "Où sont ces cryptos ?": an exchange or a wallet, then which one (or
 * "Autre…" and its name). Used to set up a new crypto account. With
 * `withSource`, the choice also sets how its holdings are fed: exchange
 * exports, the wallet's public keys (asked here, several allowed), or typed
 * by hand ("Saisie manuelle"); a wallet says so when this server does not
 * sync wallets.
 */
export function CryptoSourceFields({
  id,
  values,
  errors,
  onChange,
  withSource = false,
  kinds = withSource
    ? ['exchange', 'wallet', 'manual']
    : ['exchange', 'wallet'],
}: {
  id: string
  values: CryptoSourceValues
  /** Errors to show (empty until the form is submitted). */
  errors: CryptoSourceErrors
  onChange: (patch: Partial<CryptoSourceValues>) => void
  withSource?: boolean
  /** Sources offered (default: all of them with `withSource`). */
  kinds?: readonly CryptoKind[]
}) {
  const kind = values.cryptoKind
  return (
    <>
      <fieldset className="space-y-2">
        <legend id={`${id}-kind-legend`} className="mb-2 text-sm font-medium">
          {withSource ? 'D’où viennent les avoirs ?' : 'Où sont ces cryptos ?'}
        </legend>
        <RadioCardGroup
          aria-labelledby={`${id}-kind-legend`}
          aria-describedby={errors.cryptoKind ? `${id}-kind-error` : undefined}
          className={
            withSource && kinds.length > 2
              ? 'grid-cols-1'
              : 'grid-cols-1 sm:grid-cols-2'
          }
          value={values.cryptoKind}
          onValueChange={(value) =>
            onChange({
              cryptoKind: value as CryptoKind,
              provider: '',
              otherProvider: '',
              walletKeys: [EMPTY_WALLET_KEY],
            })
          }
        >
          {kinds.map((option) => {
            const Icon = KIND_ICONS[option]
            return (
              <RadioCard
                key={option}
                value={option}
                aria-invalid={errors.cryptoKind !== undefined}
                className="flex-row items-center gap-3"
              >
                <Icon
                  aria-hidden
                  className="text-muted-foreground shrink-0 group-data-[state=checked]/radio-card:text-primary"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">
                    {CRYPTO_KIND_TEXT[option].label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {withSource
                      ? CRYPTO_KIND_TEXT[option].sourceDescription
                      : CRYPTO_KIND_TEXT[option].description}
                  </span>
                </span>
              </RadioCard>
            )
          })}
        </RadioCardGroup>
        {errors.cryptoKind && (
          <FieldError id={`${id}-kind-error`}>{errors.cryptoKind}</FieldError>
        )}
      </fieldset>
      {(kind === 'exchange' || kind === 'wallet') && (
        <fieldset className="space-y-2">
          <legend
            id={`${id}-provider-legend`}
            className="mb-2 text-sm font-medium"
          >
            {CRYPTO_KIND_TEXT[kind].field}
          </legend>
          <RadioCardGroup
            aria-labelledby={`${id}-provider-legend`}
            aria-describedby={
              errors.provider ? `${id}-provider-error` : undefined
            }
            className="grid-cols-2"
            value={values.provider}
            onValueChange={(provider) => onChange({ provider })}
          >
            {[...CRYPTO_PROVIDERS[kind], OTHER_PROVIDER].map((provider) => (
              <RadioCard
                key={provider}
                value={provider}
                aria-invalid={errors.provider !== undefined}
                indicator={false}
                className="items-center justify-center px-3 font-medium"
              >
                {provider === OTHER_PROVIDER ? 'Autre…' : provider}
              </RadioCard>
            ))}
          </RadioCardGroup>
          {errors.provider && (
            <FieldError id={`${id}-provider-error`}>
              {errors.provider}
            </FieldError>
          )}
        </fieldset>
      )}
      {kind !== '' &&
        (values.provider === OTHER_PROVIDER || kind === 'manual') && (
          <Field data-invalid={errors.otherProvider !== undefined}>
            <FieldLabel htmlFor={`${id}-other-provider`}>
              {CRYPTO_KIND_TEXT[kind].other}
            </FieldLabel>
            <Input
              id={`${id}-other-provider`}
              autoComplete="off"
              maxLength={NAME_MAX}
              value={values.otherProvider}
              aria-invalid={errors.otherProvider !== undefined}
              onChange={(event) =>
                onChange({ otherProvider: event.target.value })
              }
            />
            {errors.otherProvider && (
              <FieldError>{errors.otherProvider}</FieldError>
            )}
          </Field>
        )}
      {withSource && kind === 'wallet' && (
        <>
          <NewWalletKeys
            id={id}
            keys={values.walletKeys}
            errors={errors.walletKeys}
            serverError={errors.walletKeysError}
            provider={values.provider}
            onChange={(walletKeys) => onChange({ walletKeys })}
          />
          <WalletSyncOffNotice />
        </>
      )}
    </>
  )
}
