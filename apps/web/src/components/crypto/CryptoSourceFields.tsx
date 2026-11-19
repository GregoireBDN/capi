import {
  Alert,
  AlertDescription,
  Button,
  FieldError,
  FieldLabel,
  Field,
  Input,
  RadioCard,
  RadioCardGroup,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
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

/** How long « Annuler » stays offered after a key is removed. */
const UNDO_TOAST_MS = 6_000

/** Whether nothing was typed in a key block. */
function isEmptyKey(key: WalletKeyValues): boolean {
  return key.publicKey.trim() === '' && key.label.trim() === ''
}

/**
 * The wallet keys typed when a wallet is set up: one card per key, removed
 * with the icon in its header (« Annuler » in the toast puts it back), and
 * « Ajouter une autre clé ».
 */
export function NewWalletKeys({
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
  // The undo runs later: it restores into the keys as they are by then.
  const latest = useRef(keys)
  useEffect(() => {
    latest.current = keys
  }, [keys])

  const single = keys.length === 1
  const update = (index: number, patch: Partial<WalletKeyValues>) =>
    onChange(keys.map((key, i) => (i === index ? { ...key, ...patch } : key)))

  const remove = (index: number) => {
    const removed = keys[index]
    onChange(single ? [EMPTY_WALLET_KEY] : keys.filter((_, i) => i !== index))
    toast('Clé retirée', {
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Annuler',
        onClick: () => {
          const current = [...latest.current]
          // The empty block left by removing the only key gives way to it.
          if (current.length === 1 && isEmptyKey(current[0])) current.pop()
          current.splice(Math.min(index, current.length), 0, removed)
          onChange(current.slice(0, WALLET_KEYS_MAX))
        },
      },
    })
  }

  return (
    <div className="space-y-3">
      {keys.map((key, index) => {
        const keyErrors = errors?.[index] ?? {}
        const label = single ? 'Clé publique' : `Clé publique ${index + 1}`
        const removable = !single || !isEmptyKey(key)
        const fields = (
          <WalletKeyFields
            id={`${id}-key-${index}`}
            label={label}
            values={key}
            provider={provider}
            labelAction={
              removable && (
                <Button
                  type="button"
                  size="sm"
                  iconOnly
                  variant="secondary"
                  ghost
                  aria-label={
                    single ? 'Retirer la clé' : `Retirer la clé ${index + 1}`
                  }
                  onClick={() => remove(index)}
                >
                  <Trash2Icon />
                </Button>
              )
            }
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
 * it is turned on, so the form says so, briefly and in the owner's terms
 * (the setting itself is in the production runbook), before anything is
 * created.
 */
export function WalletSyncOffNotice() {
  const settings = useQuery(cryptoSettingsQuery)
  if (settings.data?.walletSyncEnabled !== false) return null
  return (
    <Alert variant="warning">
      <AlertDescription>
        <p>
          Synchronisation des wallets désactivée sur ce serveur : vous saisirez
          les avoirs à la main.
        </p>
        <details className="mt-1">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium">
            En savoir plus
          </summary>
          <p>
            Le wallet est créé avec ses clés publiques. Tant que la
            synchronisation reste désactivée, ses avoirs s’ajoutent depuis sa
            page ; dès qu’elle est activée par l’administrateur du serveur, ils
            sont lus sur la blockchain à partir de ces clés, sans rien saisir de
            plus.
          </p>
        </details>
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
