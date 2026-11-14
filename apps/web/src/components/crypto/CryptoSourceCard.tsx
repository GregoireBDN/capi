import {
  Alert,
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
  FileUpIcon,
  KeyRoundIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { AccountDto, WalletKeyDto } from '#/api/types.gen'
import { holdingErrorMessage } from './errors'
import {
  addWalletKey,
  cryptoKeys,
  removeWalletKey,
  walletKeysQuery,
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
export function syncedAtText(account: AccountDto): string {
  const what =
    account.cryptoSource === 'exchange'
      ? 'Dernier import'
      : 'Dernière synchronisation'
  return account.cryptoSyncedAt === null
    ? `${what} : jamais`
    : `${what} : ${syncedAtFormat.format(new Date(account.cryptoSyncedAt))}`
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
 * its action, which arrive with the exchange imports (#128) and the wallet
 * sync (#129): shown, not available yet.
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
    <section aria-label="Source des avoirs">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {exchange
              ? 'Avoirs calculés depuis les exports de la plateforme.'
              : 'Avoirs lus sur la blockchain avec les clés publiques du wallet.'}
          </CardDescription>
          <p className="text-sm">{syncedAtText(account)}</p>
          {writable && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
              <Button
                size="sm"
                disabled
                iconStart={exchange ? <FileUpIcon /> : <RefreshCwIcon />}
              >
                {exchange ? 'Importer un export' : 'Synchroniser'}
              </Button>
              <span className="text-muted-foreground text-xs">
                Bientôt disponible. En attendant, ajoutez vos avoirs à la main.
              </span>
            </div>
          )}
        </CardHeader>
        {!exchange && (
          <CardContent>
            <WalletKeyList accountId={account.id} writable={writable} />
          </CardContent>
        )}
      </Card>
    </section>
  )
}
