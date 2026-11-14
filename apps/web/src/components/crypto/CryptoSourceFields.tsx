import {
  FieldError,
  FieldLabel,
  Field,
  Input,
  RadioCard,
  RadioCardGroup,
} from '@finances/ui'
import { Building2Icon, PencilLineIcon, WalletIcon } from 'lucide-react'
import type { CreateAccountDto } from '#/api/types.gen'
import { exchangeProviderOf } from './sources'
import {
  EMPTY_WALLET_KEY,
  validateWalletKey,
  walletKeyBody,
  WalletKeyFields,
} from './WalletKeyFields'
import type { WalletKeyErrors, WalletKeyValues } from './WalletKeyFields'

const NAME_MAX = 100

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
    sourceDescription: 'Ledger, MetaMask… avoirs lus avec sa clé publique.',
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
  /** Wallet source: the public key to read it from. */
  walletKey: WalletKeyValues
}

export interface CryptoSourceErrors {
  cryptoKind?: string
  provider?: string
  otherProvider?: string
  publicKey?: string
  chains?: string
}

export const EMPTY_CRYPTO_SOURCE: CryptoSourceValues = {
  cryptoKind: '',
  provider: '',
  otherProvider: '',
  walletKey: EMPTY_WALLET_KEY,
}

/** The exchange or wallet chosen (or typed for manual holdings), or ''. */
export function cryptoProviderName(values: CryptoSourceValues): string {
  return values.provider === OTHER_PROVIDER || values.cryptoKind === 'manual'
    ? values.otherProvider.trim()
    : values.provider
}

/**
 * Source fields of the account to create: the source, the exchange provider
 * and the wallet key. Only for the account form (`withSource`); accounts set
 * up from the holding editor are `manual`.
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
      walletKeys: [walletKeyBody(values.walletKey)],
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
    const keyErrors: WalletKeyErrors = validateWalletKey(values.walletKey)
    if (keyErrors.publicKey) errors.publicKey = keyErrors.publicKey
    if (keyErrors.chains) errors.chains = keyErrors.chains
  }
  return errors
}

const KIND_ICONS = {
  exchange: Building2Icon,
  wallet: WalletIcon,
  manual: PencilLineIcon,
} as const

/**
 * "Où sont ces cryptos ?": an exchange or a wallet, then which one (or
 * "Autre…" and its name). Used to set up a new crypto account. With
 * `withSource` (the account form), the choice also sets how its holdings are
 * fed: exchange exports, the wallet's public key (asked here), or typed by
 * hand ("Saisie manuelle").
 */
export function CryptoSourceFields({
  id,
  values,
  errors,
  onChange,
  withSource = false,
}: {
  id: string
  values: CryptoSourceValues
  /** Errors to show (empty until the form is submitted). */
  errors: CryptoSourceErrors
  onChange: (patch: Partial<CryptoSourceValues>) => void
  withSource?: boolean
}) {
  const kinds: readonly CryptoKind[] = withSource
    ? ['exchange', 'wallet', 'manual']
    : ['exchange', 'wallet']
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
          className={withSource ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}
          value={values.cryptoKind}
          onValueChange={(value) =>
            onChange({
              cryptoKind: value as CryptoKind,
              provider: '',
              otherProvider: '',
              walletKey: EMPTY_WALLET_KEY,
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
        <WalletKeyFields
          id={id}
          values={values.walletKey}
          errors={{ publicKey: errors.publicKey, chains: errors.chains }}
          onChange={(patch) =>
            onChange({ walletKey: { ...values.walletKey, ...patch } })
          }
        />
      )}
    </>
  )
}
