import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
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
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type {
  AccountDto,
  AccountHoldingsDto,
  WalletKeyDto,
  WalletTokenDto,
} from '#/api/types.gen'
import { ApiRequestError } from '#/lib/queries'
import { holdingErrorMessage } from './errors'
import { ExchangeImportSheet } from './ExchangeImportSheet'
import { AssetPicker } from './HoldingEditor'
import {
  addWalletKey,
  addWalletToken,
  afterHoldingsChanged,
  cryptoKeys,
  holdingsQuery,
  removeWalletKey,
  removeWalletToken,
  syncWallet,
  walletKeysQuery,
  walletTokensQuery,
} from './queries'
import {
  CRYPTO_CHAIN_LABELS,
  CRYPTO_EXCHANGE_PROVIDER_LABELS,
  CRYPTO_SOURCE_LABELS,
  maskPublicKey,
  walletKeyErrorMessage,
} from './sources'
import {
  EMPTY_WALLET_KEY,
  validateWalletKey,
  walletKeyBody,
  WalletKeyFields,
} from './WalletKeyFields'
import type { WalletKeyValues } from './WalletKeyFields'

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
function useWalletSync(accountId: string) {
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
      if (syncFailed(result)) {
        toast.error(
          'Synchronisation impossible pour le moment : les derniers avoirs connus sont conservés.',
        )
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
    if (error.status === 400) {
      return error.apiMessage?.startsWith('Native')
        ? 'BTC, ETH, BNB et POL sont toujours lus : inutile de les ajouter.'
        : 'Ce jeton n’existe sur aucune des chaînes EVM prises en charge.'
    }
  }
  return holdingErrorMessage(error)
}

/** "Ajouter un jeton": picks an asset, read on the wallet's EVM chains. */
function AddWalletTokenSheet({
  open,
  onOpenChange,
  accountId,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  onAdded: () => void
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()

  const add = useMutation({
    mutationFn: (asset: { id: string; symbol: string; name: string }) =>
      addWalletToken(accountId, {
        assetId: asset.id,
        symbol: asset.symbol,
        name: asset.name,
      }),
    onSuccess: async (token) => {
      toast.success(`${token.symbol} sera lu à la prochaine synchronisation`)
      onOpenChange(false)
      await queryClient.invalidateQueries({
        queryKey: cryptoKeys.walletTokens(accountId),
      })
      onAdded()
    },
    onError: (error) => toast.error(tokenErrorMessage(error)),
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
          <SheetTitle>Ajouter un jeton</SheetTitle>
          <SheetDescription>
            Un jeton ERC-20 ou BEP-20 à lire sur les chaînes EVM du wallet
            (USDC, USDT…). Les monnaies natives sont toujours lues.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2 px-4 pb-6">
          <label htmlFor={id} className="text-sm font-medium">
            Jeton
          </label>
          <AssetPicker
            id={id}
            invalid={false}
            onPick={(asset) => {
              if (!add.isPending) add.mutate(asset)
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function WalletTokenList({
  accountId,
  writable,
  onChanged,
}: {
  accountId: string
  writable: boolean
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
      <p className="text-sm font-medium">Jetons lus</p>
      {tokens.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Monnaies natives et actifs déjà détenus uniquement.
        </p>
      ) : (
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
              <span className="font-medium">{token.symbol}</span>
              <span className="text-muted-foreground min-w-0 flex-1 truncate">
                {token.name}
              </span>
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
            onAdded={onChanged}
          />
        </>
      )}
    </div>
  )
}

/** Last sync, stale state and "Synchroniser" of a wallet account. */
function WalletSyncSection({
  account,
  writable,
  holdings,
  mutation,
}: {
  account: AccountDto
  writable: boolean
  holdings: AccountHoldingsDto | undefined
  mutation: ReturnType<typeof useWalletSync>
}) {
  const sync = holdings?.sync ?? null
  const enabled = sync?.enabled ?? false
  const failed = holdings ? syncFailed(holdings) : false

  return (
    <>
      <p className="text-sm">
        {syncedAtText(account, sync?.syncedAt ?? account.cryptoSyncedAt)}
      </p>
      {failed && sync?.failedAt && (
        <Alert variant="warning">
          <AlertTitle>La dernière synchronisation a échoué</AlertTitle>
          <AlertDescription>
            Tentative du {syncedAtFormat.format(new Date(sync.failedAt))}. Les
            avoirs affichés sont ceux de la dernière synchronisation réussie.
          </AlertDescription>
        </Alert>
      )}
      {writable && holdings && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
          <Button
            size="sm"
            disabled={!enabled}
            loading={mutation.isPending}
            iconStart={<RefreshCwIcon />}
            onClick={() => mutation.mutate()}
          >
            Synchroniser
          </Button>
          {!enabled && (
            <span className="text-muted-foreground text-xs">
              Synchronisation désactivée sur ce serveur : ajoutez vos avoirs à
              la main.
            </span>
          )}
        </div>
      )}
    </>
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
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

function WalletKeyList({
  accountId,
  writable,
}: {
  accountId: string
  writable: boolean
}) {
  const queryClient = useQueryClient()
  const keys = useQuery(walletKeysQuery(accountId))
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<WalletKeyDto>()

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
                  key.label,
                  key.chains.map((c) => CRYPTO_CHAIN_LABELS[c]).join(', '),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
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
 * Where a crypto account's holdings come from: an exchange's exports, a
 * wallet's public keys, or typed by hand. Shows the last import or sync and
 * its action: "Importer un export" for an exchange (#128), "Synchroniser"
 * for a wallet when the server reads chains (#129).
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
      <section aria-label="Source des avoirs">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              Avoirs saisis à la main : ajoutez-les et modifiez-les ci-dessous.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    )
  }

  const exchange = source === 'exchange'
  return (
    <ExternalSourceCard
      account={account}
      writable={writable}
      title={title}
      exchange={exchange}
    />
  )
}

function ExternalSourceCard({
  account,
  writable,
  title,
  exchange,
}: {
  account: AccountDto
  writable: boolean
  title: string
  exchange: boolean
}) {
  const [importing, setImporting] = useState(false)
  // Same query (and cache entry) as the holdings panel below.
  const holdings = useQuery({
    ...holdingsQuery(account.id),
    enabled: !exchange,
  })
  const walletSync = useWalletSync(account.id)
  const syncAfterChange = () => {
    if (!exchange && writable && holdings.data?.sync?.enabled) {
      walletSync.mutate()
    }
  }
  return (
    <section aria-label="Source des avoirs">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {exchange
              ? 'Avoirs calculés depuis les exports de la plateforme.'
              : 'Avoirs lus sur la blockchain avec les clés publiques du wallet.'}
          </CardDescription>
          {exchange ? (
            <>
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
            </>
          ) : (
            <WalletSyncSection
              account={account}
              writable={writable}
              holdings={holdings.data}
              mutation={walletSync}
            />
          )}
        </CardHeader>
        {!exchange && (
          <CardContent className="space-y-6">
            <WalletKeyList accountId={account.id} writable={writable} />
            <WalletTokenList
              accountId={account.id}
              writable={writable}
              onChanged={syncAfterChange}
            />
          </CardContent>
        )}
      </Card>
      {writable && exchange && (
        <ExchangeImportSheet
          open={importing}
          onOpenChange={setImporting}
          accountId={account.id}
        />
      )}
    </section>
  )
}
