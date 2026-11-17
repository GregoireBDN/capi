import {
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  Textarea,
} from '@finances/ui'
import type { CryptoChain, WalletKeyInputDto } from '#/api/types.gen'
import { CRYPTO_CHAIN_LABELS, EVM_CHAINS, publicKeyFormat } from './sources'

const LABEL_MAX = 100

/** A public key being typed, with the chains to read it on. */
export interface WalletKeyValues {
  publicKey: string
  /** EVM chains ticked (a Bitcoin key is read on Bitcoin only). */
  chains: CryptoChain[]
  label: string
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
  const evm = publicKeyFormat(publicKey).family === 'evm'
  return {
    publicKey,
    chains: evm ? values.chains : ['bitcoin'],
    label: values.label.trim() || null,
  }
}

/**
 * Public key of a self-custody wallet (xpub / ypub / zpub or 0x address) and,
 * for an EVM address, the chains to read. The key is checked as it is typed:
 * a private key or a recovery phrase is flagged at once.
 */
export function WalletKeyFields({
  id,
  values,
  errors,
  onChange,
  withLabel = false,
  label = 'Clé publique',
}: {
  id: string
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
          placeholder="xpub…, zpub… ou 0x…"
          className="font-mono text-sm break-all"
          value={values.publicKey}
          aria-invalid={keyError !== undefined}
          onChange={(event) => onChange({ publicKey: event.target.value })}
        />
        {keyError ? (
          <FieldError>{keyError}</FieldError>
        ) : (
          <FieldDescription>
            Bitcoin : xpub, ypub ou zpub. Ethereum et compatibles : adresse 0x.
            Jamais la phrase de récupération ni une clé privée. La clé reste sur
            votre serveur.
          </FieldDescription>
        )}
      </Field>
      {format.family === 'bitcoin' && (
        <p className="text-muted-foreground text-sm">Réseau : Bitcoin.</p>
      )}
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
