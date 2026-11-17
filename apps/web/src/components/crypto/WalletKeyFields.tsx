import {
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from '@finances/ui'
import type {
  CryptoChain,
  WalletKeyAddressTypeChoice,
  WalletKeyInputDto,
} from '#/api/types.gen'
import {
  BITCOIN_ADDRESS_TYPE_LABELS,
  CRYPTO_CHAIN_LABELS,
  EVM_CHAINS,
  publicKeyFormat,
  WALLET_KEY_HELP,
  XPUB_ADDRESS_TYPE_OPTIONS,
} from './sources'

const LABEL_MAX = 100

/** A public key being typed, with the chains to read it on. */
export interface WalletKeyValues {
  publicKey: string
  /** EVM chains ticked (a Bitcoin key is read on Bitcoin only). */
  chains: CryptoChain[]
  label: string
  /** Address type of an `xpub` (Ledger exports `xpub` for every account). */
  addressType: WalletKeyAddressTypeChoice
}

export interface WalletKeyErrors {
  publicKey?: string
  chains?: string
  label?: string
}

export const EMPTY_WALLET_KEY: WalletKeyValues = {
  publicKey: '',
  chains: ['ethereum'],
  label: '',
  addressType: 'native_segwit',
}

export function validateWalletKey(values: WalletKeyValues): WalletKeyErrors {
  const errors: WalletKeyErrors = {}
  const format = publicKeyFormat(values.publicKey)
  if (format.error) errors.publicKey = format.error
  else if (format.family === 'evm' && values.chains.length === 0)
    errors.chains = 'Choisissez au moins un réseau'
  if (values.label.trim().length > LABEL_MAX)
    errors.label = '100 caractères maximum'
  return errors
}

/** The key as sent to the API (validated again there, checksum included). */
export function walletKeyBody(values: WalletKeyValues): WalletKeyInputDto {
  const publicKey = values.publicKey.trim()
  const format = publicKeyFormat(publicKey)
  return {
    publicKey,
    chains: format.family === 'evm' ? values.chains : ['bitcoin'],
    label: values.label.trim() || null,
    ...(format.kind === 'xpub' && { addressType: values.addressType }),
  }
}

/** "Où trouver ma clé ?": where the chosen wallet shows its public keys. */
export function WalletKeyHelp({ provider }: { provider?: string }) {
  const steps = WALLET_KEY_HELP[provider ?? ''] ?? WALLET_KEY_HELP.default
  return (
    <details className="group text-sm">
      <summary className="text-primary flex min-h-11 cursor-pointer items-center font-medium">
        Où trouver ma clé ?
      </summary>
      <ul className="text-muted-foreground list-disc space-y-1 pb-2 pl-5">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
    </details>
  )
}

/**
 * What a recognized Bitcoin key will read: the address type to derive an
 * `xpub` as (Ledger Live exports `xpub` for every account type), the type of
 * a ypub / zpub, or a single address (its own balance only).
 */
function BitcoinKeyType({
  id,
  values,
  onChange,
}: {
  id: string
  values: WalletKeyValues
  onChange: (patch: Partial<WalletKeyValues>) => void
}) {
  const format = publicKeyFormat(values.publicKey)
  if (format.family !== 'bitcoin') return null
  if (format.kind === 'xpub') {
    return (
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium">
          Type d’adresses du compte
        </legend>
        <p className="text-muted-foreground text-xs">
          Une xpub ne dit pas quel type d’adresses le compte utilise : Ledger
          Live l’affiche pour tous ses comptes Bitcoin.
        </p>
        <XpubAddressTypeRadios
          id={id}
          value={values.addressType}
          onChange={(addressType) => onChange({ addressType })}
        />
      </fieldset>
    )
  }
  if (format.kind === 'address') {
    return (
      <p className="text-muted-foreground text-sm">
        Adresse Bitcoin ·{' '}
        {format.addressType && BITCOIN_ADDRESS_TYPE_LABELS[format.addressType]}.
        Seul le solde de cette adresse est lu : la xpub du compte suit aussi ses
        autres adresses (monnaie rendue).
      </p>
    )
  }
  return (
    <p className="text-muted-foreground text-sm">
      Bitcoin ·{' '}
      {
        BITCOIN_ADDRESS_TYPE_LABELS[
          format.kind === 'ypub' ? 'nested_segwit' : 'native_segwit'
        ]
      }
      .
    </p>
  )
}

/** The address types an `xpub` can be read as, and « Je ne sais pas ». */
export function XpubAddressTypeRadios({
  id,
  value,
  onChange,
}: {
  id: string
  value: WalletKeyAddressTypeChoice
  onChange: (value: WalletKeyAddressTypeChoice) => void
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as WalletKeyAddressTypeChoice)}
      className="gap-0"
    >
      {XPUB_ADDRESS_TYPE_OPTIONS.map((option) => (
        <div
          key={option.value}
          className="flex min-h-11 items-start gap-2 py-1"
        >
          <RadioGroupItem
            value={option.value}
            id={`${id}-type-${option.value}`}
            className="mt-0.5"
          />
          <Label
            htmlFor={`${id}-type-${option.value}`}
            className="flex flex-col items-start gap-0.5 font-normal"
          >
            <span className="font-medium">{option.label}</span>
            <span className="text-muted-foreground text-xs">
              {option.description}
            </span>
          </Label>
        </div>
      ))}
    </RadioGroup>
  )
}

/**
 * Public key of a self-custody wallet (xpub / ypub / zpub, a Bitcoin address
 * or a 0x address) with what it reads: an xpub's address type, an EVM
 * address's chains. The key is checked as it is typed: a private key or a
 * recovery phrase is flagged at once.
 */
export function WalletKeyFields({
  id,
  values,
  errors,
  onChange,
  withLabel = false,
  label = 'Clé publique',
  provider,
}: {
  id: string
  /** The wallet chosen (Ledger, Trezor…), for « Où trouver ma clé ? ». */
  provider?: string
  /** Label of the key field (numbered when several keys are typed). */
  label?: string
  values: WalletKeyValues
  /** Errors to show (empty until the form is submitted). */
  errors: WalletKeyErrors
  onChange: (patch: Partial<WalletKeyValues>) => void
  /** Also ask for an optional label (e.g. "Épargne"). */
  withLabel?: boolean
}) {
  const format = publicKeyFormat(values.publicKey)
  // A private key or a recovery phrase is flagged as soon as it is pasted.
  const keyError =
    errors.publicKey ?? (format.danger ? format.error : undefined)

  const toggleChain = (chain: CryptoChain, checked: boolean) =>
    onChange({
      chains: checked
        ? EVM_CHAINS.filter((c) => c === chain || values.chains.includes(c))
        : values.chains.filter((c) => c !== chain),
    })

  return (
    <>
      <Field data-invalid={keyError !== undefined}>
        <FieldLabel htmlFor={`${id}-public-key`}>{label}</FieldLabel>
        <Textarea
          id={`${id}-public-key`}
          rows={3}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="xpub…, bc1… ou 0x…"
          className="font-mono text-sm break-all"
          value={values.publicKey}
          aria-invalid={keyError !== undefined}
          onChange={(event) => onChange({ publicKey: event.target.value })}
        />
        {keyError ? (
          <FieldError>{keyError}</FieldError>
        ) : (
          <FieldDescription>
            Bitcoin : xpub, ypub, zpub ou une adresse. Ethereum et compatibles :
            adresse 0x. Jamais la phrase de récupération ni une clé privée.
          </FieldDescription>
        )}
        <WalletKeyHelp provider={provider} />
      </Field>
      <BitcoinKeyType id={id} values={values} onChange={onChange} />
      {format.family === 'evm' && (
        <fieldset
          className="space-y-2"
          aria-describedby={errors.chains ? `${id}-chains-error` : undefined}
        >
          <legend className="mb-2 text-sm font-medium">Réseaux à lire</legend>
          <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
            {EVM_CHAINS.map((chain) => (
              <div key={chain} className="flex min-h-11 items-center gap-2">
                <Checkbox
                  id={`${id}-chain-${chain}`}
                  checked={values.chains.includes(chain)}
                  onCheckedChange={(checked) =>
                    toggleChain(chain, checked === true)
                  }
                />
                <Label htmlFor={`${id}-chain-${chain}`} className="font-normal">
                  {CRYPTO_CHAIN_LABELS[chain]}
                </Label>
              </div>
            ))}
          </div>
          {errors.chains && (
            <p id={`${id}-chains-error`} className="text-destructive text-sm">
              {errors.chains}
            </p>
          )}
        </fieldset>
      )}
      {withLabel && (
        <Field data-invalid={errors.label !== undefined}>
          <FieldLabel htmlFor={`${id}-key-label`}>
            Libellé (facultatif)
          </FieldLabel>
          <Input
            id={`${id}-key-label`}
            autoComplete="off"
            maxLength={LABEL_MAX}
            placeholder="Épargne, compte 2…"
            value={values.label}
            aria-invalid={errors.label !== undefined}
            onChange={(event) => onChange({ label: event.target.value })}
          />
          {errors.label && <FieldError>{errors.label}</FieldError>}
        </Field>
      )}
    </>
  )
}
