import {
  FieldError,
  FieldLabel,
  Field,
  Input,
  RadioCard,
  RadioCardGroup,
} from '@finances/ui'
import { Building2Icon, WalletIcon } from 'lucide-react'

const NAME_MAX = 100

/** Where a crypto account's assets are held. */
export type CryptoKind = 'exchange' | 'wallet'

/** "Autre…" in the provider list: the owner types the name. */
export const OTHER_PROVIDER = 'other'

/** Common providers, in the order of the list ("Autre…" comes last). */
export const CRYPTO_PROVIDERS: Record<CryptoKind, readonly string[]> = {
  exchange: ['Binance', 'Coinbase', 'Kraken', 'Bitpanda'],
  wallet: ['Ledger', 'Trezor', 'MetaMask'],
}

const CRYPTO_KIND_TEXT: Record<
  CryptoKind,
  { label: string; description: string; field: string; other: string }
> = {
  exchange: {
    label: 'Plateforme',
    description: 'Binance, Coinbase…',
    field: 'Plateforme',
    other: 'Nom de la plateforme',
  },
  wallet: {
    label: 'Wallet',
    description: 'Ledger, MetaMask…',
    field: 'Wallet',
    other: 'Nom du wallet',
  },
}

/** The exchange or wallet a new crypto account is set up from. */
export interface CryptoSourceValues {
  cryptoKind: CryptoKind | ''
  /** A name from `CRYPTO_PROVIDERS`, `OTHER_PROVIDER` or '' (none yet). */
  provider: string
  otherProvider: string
}

export interface CryptoSourceErrors {
  cryptoKind?: string
  provider?: string
  otherProvider?: string
}

export const EMPTY_CRYPTO_SOURCE: CryptoSourceValues = {
  cryptoKind: '',
  provider: '',
  otherProvider: '',
}

/** The exchange or wallet chosen, or ''. */
export function cryptoProviderName(values: CryptoSourceValues): string {
  return values.provider === OTHER_PROVIDER
    ? values.otherProvider.trim()
    : values.provider
}

export function validateCryptoSource(
  values: CryptoSourceValues,
): CryptoSourceErrors {
  const errors: CryptoSourceErrors = {}
  if (values.cryptoKind === '')
    errors.cryptoKind = 'Choisissez une plateforme ou un wallet'
  else if (values.provider === '')
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
  return errors
}

/**
 * "Où sont ces cryptos ?": an exchange or a wallet, then which one (or
 * "Autre…" and its name). Used to set up a new crypto account.
 */
export function CryptoSourceFields({
  id,
  values,
  errors,
  onChange,
}: {
  id: string
  values: CryptoSourceValues
  /** Errors to show (empty until the form is submitted). */
  errors: CryptoSourceErrors
  onChange: (patch: Partial<CryptoSourceValues>) => void
}) {
  return (
    <>
      <fieldset className="space-y-2">
        <legend id={`${id}-kind-legend`} className="mb-2 text-sm font-medium">
          Où sont ces cryptos ?
        </legend>
        <RadioCardGroup
          aria-labelledby={`${id}-kind-legend`}
          aria-describedby={errors.cryptoKind ? `${id}-kind-error` : undefined}
          className="grid-cols-1 sm:grid-cols-2"
          value={values.cryptoKind}
          onValueChange={(value) =>
            onChange({
              cryptoKind: value as CryptoKind,
              provider: '',
              otherProvider: '',
            })
          }
        >
          {(['exchange', 'wallet'] as const).map((kind) => {
            const Icon = kind === 'exchange' ? Building2Icon : WalletIcon
            return (
              <RadioCard
                key={kind}
                value={kind}
                aria-invalid={errors.cryptoKind !== undefined}
                className="flex-row items-center gap-3"
              >
                <Icon
                  aria-hidden
                  className="text-muted-foreground shrink-0 group-data-[state=checked]/radio-card:text-primary"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">
                    {CRYPTO_KIND_TEXT[kind].label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {CRYPTO_KIND_TEXT[kind].description}
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
      {values.cryptoKind !== '' && (
        <fieldset className="space-y-2">
          <legend
            id={`${id}-provider-legend`}
            className="mb-2 text-sm font-medium"
          >
            {CRYPTO_KIND_TEXT[values.cryptoKind].field}
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
            {[...CRYPTO_PROVIDERS[values.cryptoKind], OTHER_PROVIDER].map(
              (provider) => (
                <RadioCard
                  key={provider}
                  value={provider}
                  aria-invalid={errors.provider !== undefined}
                  indicator={false}
                  className="items-center justify-center px-3 font-medium"
                >
                  {provider === OTHER_PROVIDER ? 'Autre…' : provider}
                </RadioCard>
              ),
            )}
          </RadioCardGroup>
          {errors.provider && (
            <FieldError id={`${id}-provider-error`}>
              {errors.provider}
            </FieldError>
          )}
        </fieldset>
      )}
      {values.cryptoKind !== '' && values.provider === OTHER_PROVIDER && (
        <Field data-invalid={errors.otherProvider !== undefined}>
          <FieldLabel htmlFor={`${id}-other-provider`}>
            {CRYPTO_KIND_TEXT[values.cryptoKind].other}
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
    </>
  )
}
