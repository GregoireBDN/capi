import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Field,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  NativeSelectOption,
  SegmentedControl,
  SegmentedControlItem,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CoinsIcon,
  FileUpIcon,
  KeyRoundIcon,
  LinkIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type {
  AccountDto,
  AccountHoldingsDto,
  CryptoChain,
  WalletKeyAddressTypeChoice,
  WalletKeyDto,
  WalletTokenDto,
} from '#/api/types.gen'
import { ApiRequestError } from '#/lib/queries'
import { ChangeCryptoSourceSheet } from './ChangeCryptoSourceSheet'
import { holdingErrorMessage } from './errors'
import { ExchangeImportSheet } from './ExchangeImportSheet'
import { AssetPicker } from './HoldingEditor'
import {
  addWalletKey,
  addWalletToken,
  afterHoldingsChanged,
  cryptoKeys,
  removeWalletKey,
  removeWalletToken,
  syncWallet,
  updateWalletKeyAddressType,
  walletKeysQuery,
  walletTokensQuery,
} from './queries'
import {
  BITCOIN_ADDRESS_TYPE_LABELS,
  CRYPTO_CHAIN_LABELS,
  CRYPTO_EXCHANGE_PROVIDER_LABELS,
  CRYPTO_SOURCE_LABELS,
  EVM_CHAINS,
  maskPublicKey,
  walletKeyErrorMessage,
  walletKeyTypeLabel,
} from './sources'
import {
  EMPTY_WALLET_KEY,
  validateWalletKey,
  walletKeyBody,
  WalletKeyFields,
  XpubAddressTypeRadios,
} from './WalletKeyFields'
import type { WalletKeyValues } from './WalletKeyFields'
import { syncFailedToast } from './wallet-sync-status'

const syncedAtFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** "Dernier import : jamais" / "Dernière synchronisation : 5 novembre…". */
export function syncedAtText(
  account: AccountDto,
  syncedAt: string | null = account.cryptoSyncedAt,
): string {
  const what =
    account.cryptoSource === 'exchange'
      ? 'Dernier import'
      : 'Dernière synchronisation'
  return syncedAt === null
    ? `${what} : jamais`
    : `${what} : ${syncedAtFormat.format(new Date(syncedAt))}`
}

/** Whether the latest sync attempt failed (the holdings shown are older). */
export function syncFailed(result: AccountHoldingsDto): boolean {
  const sync = result.sync
  if (!sync?.failedAt) return false
  return (
    sync.syncedAt === null ||
    new Date(sync.failedAt).getTime() >= new Date(sync.syncedAt).getTime()
  )
}

function syncErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 400) {
    return 'La synchronisation est désactivée sur ce serveur.'
  }
  return holdingErrorMessage(error)
}

/** "Synchroniser" and its mutation, shared by the card and the token list. */
export function useWalletSync(accountId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => syncWallet(accountId),
    // The sync date before, to tell a fresh sync from a skipped one (the API
    // asks the chains at most every 30 s).
    onMutate: () =>
      queryClient.getQueryData<AccountHoldingsDto>(
        cryptoKeys.holdings(accountId),
      )?.sync?.syncedAt ?? null,
    onSuccess: async (result, _variables, syncedBefore) => {
      queryClient.setQueryData(cryptoKeys.holdings(accountId), result)
      if (syncFailed(result) && result.sync) {
        toast.error(syncFailedToast(result.sync))
      } else if (
        syncedBefore !== null &&
        result.sync?.syncedAt === syncedBefore
      ) {
        toast('Wallet déjà synchronisé il y a quelques secondes')
      } else {
        toast.success('Wallet synchronisé')
      }
      await afterHoldingsChanged(queryClient)
    },
    onError: (error) => toast.error(syncErrorMessage(error)),
  })
}

function tokenErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 409) return 'Ce jeton est déjà suivi.'
    if (error.status === 503) {
      return 'La chaîne ne répond pas pour le moment : réessayez dans quelques minutes.'
    }
    if (error.status === 400) {
      const message = error.apiMessage ?? ''
      if (message.startsWith('Native'))
        return 'BTC, ETH, BNB et POL sont toujours lus : inutile de les ajouter.'
      if (/checksum/i.test(message))
        return 'Adresse mal recopiée (les majuscules ne correspondent pas) : vérifiez-la.'
      if (/Not a contract address/i.test(message))
        return 'Une adresse de contrat commence par 0x suivi de 40 caractères (0-9, a-f).'
      if (/No token contract/i.test(message))
        return 'Aucun jeton à cette adresse sur cette chaîne : vérifiez l’adresse et la chaîne.'
      if (/disabled/i.test(message))
        return 'Cette chaîne n’est pas lue par ce serveur (synchronisation désactivée).'
      return 'Ce jeton n’existe sur aucune des chaînes EVM prises en charge.'
    }
  }
  return holdingErrorMessage(error)
}

const CONTRACT_PATTERN = /^0x[0-9a-fA-F]{40}$/

/** `0xdAC17F…831ec7`. */
function maskContract(contract: string): string {
  return `${contract.slice(0, 8)}…${contract.slice(-6)}`
}

/**
 * "Ajouter un jeton": a token found by its name (read on every EVM chain of
 * the wallet where it exists), or by its contract address on one chain
 * (#269), what Etherscan shows: for a token the price service does not know.
 */
/** « Trouver le jeton » segments: both labels fit a 320px phone. */
const FIT = 'px-1.5 text-[min(0.875rem,6cqi)]'

function AddWalletTokenSheet({
  open,
  onOpenChange,
  accountId,
  chains,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  /** EVM chains the wallet's addresses are read on (first: the default). */
  chains: readonly CryptoChain[]
  onAdded: () => void
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [mode, setMode] = useState<'name' | 'contract'>('name')
  const [contract, setContract] = useState('')
  const firstChain = chains[0] ?? 'ethereum'
  const [chain, setChain] = useState<CryptoChain>(firstChain)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return
    setMode('name')
    setContract('')
    setChain(firstChain)
    setSubmitted(false)
  }, [open, firstChain])

  const add = useMutation({
    mutationFn: (
      body:
        | { kind: 'name'; asset: { id: string; symbol: string; name: string } }
        | { kind: 'contract'; contract: string; chain: CryptoChain },
    ) =>
      addWalletToken(
        accountId,
        body.kind === 'name'
          ? {
              assetId: body.asset.id,
              symbol: body.asset.symbol,
              name: body.asset.name,
            }
          : { contract: body.contract, chain: body.chain },
      ),
    onSuccess: async (token) => {
      toast.success(`${token.symbol} sera lu à la prochaine actualisation`)
      onOpenChange(false)
      await queryClient.invalidateQueries({
        queryKey: cryptoKeys.walletTokens(accountId),
      })
      onAdded()
    },
    onError: (error) => toast.error(tokenErrorMessage(error)),
  })

  const trimmed = contract.trim()
  const contractError =
    trimmed === ''
      ? 'Collez l’adresse du contrat du jeton.'
      : CONTRACT_PATTERN.test(trimmed)
        ? undefined
        : 'Une adresse de contrat commence par 0x suivi de 40 caractères (0-9, a-f).'
  // The chains the wallet's addresses are read on: a token elsewhere would
  // never be read.
  const chainOptions = chains.length > 0 ? chains : EVM_CHAINS

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={
          isMobile
            ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
            : undefined
        }
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Ajouter un jeton</SheetTitle>
          <SheetDescription>
            ETH, BNB et POL sont toujours lus. Ajoutez les jetons ERC-20 /
            BEP-20 de vos adresses.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {/* Both labels on a 320px phone: sized on the row's width. */}
          <div className="@container">
            <SegmentedControl
              fullWidth
              aria-label="Trouver le jeton"
              value={mode}
              onValueChange={setMode}
            >
              <SegmentedControlItem value="name" className={FIT}>
                Par son nom
              </SegmentedControlItem>
              <SegmentedControlItem value="contract" className={FIT}>
                Par son adresse
              </SegmentedControlItem>
            </SegmentedControl>
          </div>
          {mode === 'name' ? (
            <div className="space-y-2">
              <label htmlFor={id} className="text-sm font-medium">
                Jeton
              </label>
              <AssetPicker
                id={id}
                invalid={false}
                onPick={(asset) => {
                  if (!add.isPending) add.mutate({ kind: 'name', asset })
                }}
              />
              <p className="text-muted-foreground text-xs">
                Introuvable, ou plusieurs jetons du même nom ? Ajoutez-le par
                l’adresse de son contrat.
              </p>
            </div>
          ) : (
            <form
              noValidate
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                setSubmitted(true)
                if (!contractError) {
                  add.mutate({ kind: 'contract', contract: trimmed, chain })
                }
              }}
            >
              <Field data-invalid={submitted && !!contractError}>
                <FieldLabel htmlFor={`${id}-contract`}>
                  Adresse du contrat
                </FieldLabel>
                <Input
                  id={`${id}-contract`}
                  value={contract}
                  onChange={(event) => setContract(event.target.value)}
                  placeholder="0x…"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="font-mono"
                  aria-invalid={submitted && !!contractError}
                />
                {submitted && contractError && (
                  <FieldError>{contractError}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-chain`}>Chaîne</FieldLabel>
                <NativeSelect
                  id={`${id}-chain`}
                  value={chain}
                  onChange={(event) =>
                    setChain(event.target.value as CryptoChain)
                  }
                >
                  {chainOptions.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {CRYPTO_CHAIN_LABELS[option]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <p className="text-muted-foreground text-xs">
                L’adresse affichée par Etherscan (ou l’explorateur de la chaîne)
                sur la page du jeton. Seule cette adresse est envoyée à la
                chaîne pour lire son symbole et ses décimales.
              </p>
              <Button type="submit" className="w-full" loading={add.isPending}>
                Ajouter le jeton
              </Button>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function WalletTokenList({
  accountId,
  writable,
  chains,
  onChanged,
}: {
  accountId: string
  writable: boolean
  /** EVM chains the wallet's addresses are read on. */
  chains: readonly CryptoChain[]
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const tokens = useQuery(walletTokensQuery(accountId))
  const [adding, setAdding] = useState(false)

  const remove = useMutation({
    mutationFn: (token: WalletTokenDto) =>
      removeWalletToken(accountId, token.id),
    onSuccess: async (_, token) => {
      toast.success(`${token.symbol} n’est plus lu`)
      await queryClient.invalidateQueries({
        queryKey: cryptoKeys.walletTokens(accountId),
      })
      onChanged()
    },
    onError: (error) => toast.error(tokenErrorMessage(error)),
  })

  if (tokens.isPending) {
    return <Skeleton className="h-10 w-full" aria-label="Chargement" />
  }
  if (tokens.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Impossible de charger les jetons.</AlertTitle>
      </Alert>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Jetons</p>
      <p className="text-muted-foreground text-sm">
        ETH, BNB et POL sont toujours lus. Ajoutez les jetons ERC-20 / BEP-20 de
        vos adresses.
      </p>
      {tokens.data.length > 0 && (
        <ul className="divide-y" aria-label="Jetons lus">
          {tokens.data.map((token) => (
            <li
              key={token.id}
              className="flex min-h-11 items-center gap-3 py-1 text-sm"
            >
              <CoinsIcon
                aria-hidden
                className="text-muted-foreground size-4 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <span className="font-medium">{token.symbol}</span>
                  {token.name !== token.symbol && (
                    <span className="text-muted-foreground"> {token.name}</span>
                  )}
                </p>
                {(token.contract || !token.priced) && (
                  <p className="text-muted-foreground truncate text-xs">
                    {[
                      token.chain && CRYPTO_CHAIN_LABELS[token.chain],
                      token.contract && maskContract(token.contract),
                      !token.priced && 'sans cours',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
              {writable && (
                <Button
                  size="sm"
                  iconOnly
                  variant="secondary"
                  ghost
                  aria-label={`Ne plus lire ${token.symbol}`}
                  loading={remove.isPending && remove.variables.id === token.id}
                  onClick={() => remove.mutate(token)}
                >
                  <Trash2Icon />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {writable && (
        <>
          <Button
            size="sm"
            outline
            variant="secondary"
            iconStart={<PlusIcon />}
            onClick={() => setAdding(true)}
          >
            Ajouter un jeton
          </Button>
          <AddWalletTokenSheet
            open={adding}
            onOpenChange={setAdding}
            accountId={accountId}
            chains={chains}
            onAdded={onChanged}
          />
        </>
      )}
    </div>
  )
}

function keyErrorMessage(error: unknown): string {
  return walletKeyErrorMessage(error) ?? holdingErrorMessage(error)
}

/** Adds a public key to a wallet account. */
function AddWalletKeySheet({
  open,
  onOpenChange,
  accountId,
  provider,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  /** The wallet (Ledger, Trezor…), for « Où trouver ma clé ? ». */
  provider?: string
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [values, setValues] = useState<WalletKeyValues>(EMPTY_WALLET_KEY)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string>()

  useEffect(() => {
    if (!open) return
    setValues(EMPTY_WALLET_KEY)
    setSubmitted(false)
    setServerError(undefined)
  }, [open])

  const errors = validateWalletKey(values)
  const shown = submitted
    ? { ...errors, ...(serverError && { publicKey: serverError }) }
    : {}

  const add = useMutation({
    mutationFn: () => addWalletKey(accountId, walletKeyBody(values)),
    onSuccess: async () => {
      toast.success('Clé ajoutée')
      onOpenChange(false)
      await queryClient.invalidateQueries({
        queryKey: cryptoKeys.walletKeys(accountId),
      })
    },
    onError: (error) => {
      const message = walletKeyErrorMessage(error)
      if (message) setServerError(message)
      toast.error(message ?? holdingErrorMessage(error))
    },
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={
          isMobile
            ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
            : undefined
        }
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Ajouter une clé publique</SheetTitle>
          <SheetDescription>
            Une autre clé du même wallet (compte Bitcoin, adresse Ethereum…).
          </SheetDescription>
        </SheetHeader>
        <form
          noValidate
          className="space-y-4 px-4 pb-6"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(true)
            if (Object.keys(errors).length === 0) add.mutate()
          }}
        >
          <WalletKeyFields
            id={id}
            values={values}
            errors={shown}
            withLabel
            provider={provider}
            onChange={(patch) => {
              setServerError(undefined)
              setValues((current) => ({ ...current, ...patch }))
            }}
          />
          <Button type="submit" className="w-full" loading={add.isPending}>
            Ajouter la clé
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Changes the address type an `xpub` is read as (Ledger Live exports `xpub`
 * for every account type), or asks to detect it on the next sync.
 */
function WalletKeyTypeSheet({
  accountId,
  walletKey,
  onOpenChange,
}: {
  accountId: string
  /** The key being changed; the sheet is closed without one. */
  walletKey: WalletKeyDto | undefined
  onOpenChange: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [value, setValue] =
    useState<WalletKeyAddressTypeChoice>('native_segwit')

  useEffect(() => {
    if (!walletKey) return
    const current = walletKey.addressTypes ?? []
    setValue(
      walletKey.detectingAddressType || current.length !== 1
        ? 'detect'
        : (current[0] as WalletKeyAddressTypeChoice),
    )
  }, [walletKey])

  const save = useMutation({
    mutationFn: (key: WalletKeyDto) =>
      updateWalletKeyAddressType(accountId, key.id, value),
    onSuccess: async () => {
      toast.success('Type d’adresses enregistré')
      onOpenChange(false)
      await queryClient.invalidateQueries({
        queryKey: cryptoKeys.walletKeys(accountId),
      })
    },
    onError: (error) => toast.error(keyErrorMessage(error)),
  })

  return (
    <Sheet open={walletKey !== undefined} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={
          isMobile
            ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
            : undefined
        }
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Type d’adresses</SheetTitle>
          <SheetDescription>
            {walletKey && maskPublicKey(walletKey.publicKey)} · Ledger Live
            affiche « xpub » pour tous ses comptes : le chemin du compte (84’,
            49’ ou 44’) donne le type.
          </SheetDescription>
        </SheetHeader>
        <form
          noValidate
          className="space-y-4 px-4 pb-6"
          onSubmit={(event) => {
            event.preventDefault()
            if (walletKey) save.mutate(walletKey)
          }}
        >
          <XpubAddressTypeRadios id={id} value={value} onChange={setValue} />
          <Button type="submit" className="w-full" loading={save.isPending}>
            Enregistrer
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/**
 * What the last complete scan of a Bitcoin key found (#268): « 3 adresses
 * utilisées », or a warning when an xpub found none in its type (Ledger Live
 * exports `xpub` for every account type, so it is often the wrong one).
 */
export function keyScanText(
  key: Pick<WalletKeyDto, 'family' | 'format' | 'scans'>,
): { text: string; warning: boolean } | null {
  if (key.family !== 'bitcoin' || key.scans.length === 0) return null
  const used = key.scans.reduce((n, scan) => n + scan.usedAddresses, 0)
  if (key.format === 'address') {
    return used > 0
      ? { text: 'Adresse utilisée', warning: false }
      : { text: 'Adresse jamais utilisée', warning: false }
  }
  if (used === 0) {
    const types = key.scans
      .map((scan) => BITCOIN_ADDRESS_TYPE_LABELS[scan.addressType])
      .join(' + ')
    return {
      text: `Aucune adresse utilisée en ${types} : vérifiez le type`,
      warning: true,
    }
  }
  return {
    text: used === 1 ? '1 adresse utilisée' : `${used} adresses utilisées`,
    warning: false,
  }
}

export function WalletKeyList({
  accountId,
  writable,
  provider,
}: {
  accountId: string
  writable: boolean
  /** The wallet (Ledger, Trezor…), for « Où trouver ma clé ? ». */
  provider?: string
}) {
  const queryClient = useQueryClient()
  const keys = useQuery(walletKeysQuery(accountId))
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<WalletKeyDto>()
  const [typing, setTyping] = useState<WalletKeyDto>()

  const remove = useMutation({
    mutationFn: (key: WalletKeyDto) => removeWalletKey(accountId, key.id),
    onSuccess: async () => {
      toast.success('Clé retirée')
      setRemoving(undefined)
      await queryClient.invalidateQueries({
        queryKey: cryptoKeys.walletKeys(accountId),
      })
    },
    onError: (error) => toast.error(keyErrorMessage(error)),
  })

  if (keys.isPending) {
    return <Skeleton className="h-12 w-full" aria-label="Chargement" />
  }
  if (keys.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Impossible de charger les clés.</AlertTitle>
      </Alert>
    )
  }
  const list = keys.data
  return (
    <div className="space-y-2">
      <ul className="divide-y" aria-label="Clés publiques">
        {list.map((key) => (
          <li key={key.id} className="flex items-center gap-3 py-2 text-sm">
            <KeyRoundIcon
              aria-hidden
              className="text-muted-foreground size-4 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono" title={key.publicKey}>
                {maskPublicKey(key.publicKey)}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {[
                  // « Bitcoin · Bitcoin » said it twice.
                  key.chains.some((c) => CRYPTO_CHAIN_LABELS[c] === key.label)
                    ? null
                    : key.label,
                  key.chains.map((c) => CRYPTO_CHAIN_LABELS[c]).join(', '),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {walletKeyTypeLabel(key) && (
                <p
                  className={
                    keyScanText(key)?.warning
                      ? 'text-warning-foreground dark:text-warning text-xs font-medium'
                      : 'text-muted-foreground text-xs'
                  }
                >
                  {keyScanText(key)?.warning
                    ? keyScanText(key)!.text
                    : [walletKeyTypeLabel(key), keyScanText(key)?.text]
                        .filter(Boolean)
                        .join(' · ')}
                  {writable && key.format === 'xpub' && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className="text-primary touch-hitbox relative font-medium underline-offset-2 hover:underline"
                        aria-label={`Changer le type d’adresses de ${maskPublicKey(key.publicKey)}`}
                        onClick={() => setTyping(key)}
                      >
                        Changer
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
            {writable && list.length > 1 && (
              <Button
                size="sm"
                iconOnly
                variant="secondary"
                ghost
                aria-label={`Retirer la clé ${maskPublicKey(key.publicKey)}`}
                onClick={() => setRemoving(key)}
              >
                <Trash2Icon />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {writable && (
        <Button
          size="sm"
          outline
          variant="secondary"
          iconStart={<PlusIcon />}
          onClick={() => setAdding(true)}
        >
          Ajouter une clé
        </Button>
      )}
      {writable && (
        <AddWalletKeySheet
          open={adding}
          onOpenChange={setAdding}
          accountId={accountId}
          provider={provider}
        />
      )}
      {writable && (
        <WalletKeyTypeSheet
          accountId={accountId}
          walletKey={typing}
          onOpenChange={(open) => !open && setTyping(undefined)}
        />
      )}
      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={(open) => !open && setRemoving(undefined)}
        title="Retirer cette clé ?"
        description="Les avoirs lus avec elle ne seront plus synchronisés. Vous pourrez l’ajouter à nouveau."
        confirmLabel="Retirer"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </div>
  )
}

/**
 * Where a crypto account's holdings come from: an exchange's exports or
 * typed by hand. Shows the last import and « Importer un export » for an
 * exchange (#128). A wallet's page is `WalletAccount`.
 */
export function CryptoSourceCard({
  account,
  writable,
}: {
  account: AccountDto
  writable: boolean
}) {
  const source = account.cryptoSource ?? 'manual'
  const where =
    source === 'exchange'
      ? (account.institution ??
        (account.cryptoProvider &&
          CRYPTO_EXCHANGE_PROVIDER_LABELS[account.cryptoProvider]))
      : account.institution
  const title = [CRYPTO_SOURCE_LABELS[source], where]
    .filter(Boolean)
    .join(' · ')

  if (source === 'manual') {
    return (
      <ManualSourceCard account={account} writable={writable} title={title} />
    )
  }
  // A wallet has its own page body (`WalletAccount`, #269).
  return (
    <ExchangeSourceCard account={account} writable={writable} title={title} />
  )
}

/**
 * Holdings typed by hand, and the way to read them from a wallet's keys or an
 * exchange's exports instead (an account set up by hand, #207).
 */
function ManualSourceCard({
  account,
  writable,
  title,
}: {
  account: AccountDto
  writable: boolean
  title: string
}) {
  const [changing, setChanging] = useState(false)
  return (
    <section aria-label="Source des avoirs">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Avoirs saisis à la main : ajoutez-les et modifiez-les ci-dessous.
          </CardDescription>
          {writable && (
            <div className="pt-1">
              <Button
                size="sm"
                outline
                variant="secondary"
                iconStart={<LinkIcon />}
                onClick={() => setChanging(true)}
              >
                Relier à un wallet ou une plateforme
              </Button>
            </div>
          )}
        </CardHeader>
      </Card>
      {writable && (
        <ChangeCryptoSourceSheet
          open={changing}
          onOpenChange={setChanging}
          account={account}
        />
      )}
    </section>
  )
}

/** An exchange: its holdings come from its exports (#128). */
function ExchangeSourceCard({
  account,
  writable,
  title,
}: {
  account: AccountDto
  writable: boolean
  title: string
}) {
  const [importing, setImporting] = useState(false)
  return (
    <section aria-label="Source des avoirs">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Avoirs calculés depuis les exports de la plateforme.
          </CardDescription>
          <p className="text-sm">{syncedAtText(account)}</p>
          {writable && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
              <Button
                size="sm"
                iconStart={<FileUpIcon />}
                onClick={() => setImporting(true)}
              >
                Importer un export
              </Button>
            </div>
          )}
        </CardHeader>
      </Card>
      {writable && (
        <ExchangeImportSheet
          open={importing}
          onOpenChange={setImporting}
          accountId={account.id}
        />
      )}
    </section>
  )
}
