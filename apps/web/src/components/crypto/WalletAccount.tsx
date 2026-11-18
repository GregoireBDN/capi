import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlertIcon } from 'lucide-react'
import { toast } from 'sonner'
import type {
  AccountDto,
  AccountHoldingsDto,
  CryptoChain,
} from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import {
  syncFailed,
  useWalletSync,
  WalletKeyList,
  WalletTokenList,
} from './CryptoSourceCard'
import { holdingErrorMessage } from './errors'
import { formatPriceAge } from './format'
import { HoldingsPanel } from './HoldingsPanel'
import {
  afterHoldingsChanged,
  cryptoKeys,
  holdingsQuery,
  refreshPrices,
  walletKeysQuery,
} from './queries'
import { chainFailureText } from './wallet-sync-status'

/**
 * « Actualiser » of a wallet account (#269): reads the chains (when the
 * server syncs wallets) then the prices, in one request; without sync, the
 * prices only.
 */
export function useWalletRefresh(accountId: string) {
  const queryClient = useQueryClient()
  const holdings = useQuery({ ...holdingsQuery(accountId), enabled: false })
  const sync = useWalletSync(accountId)
  const prices = useMutation({
    mutationFn: () => refreshPrices(accountId),
    onSuccess: async (result) => {
      queryClient.setQueryData(cryptoKeys.holdings(accountId), result)
      if (result.refreshFailed) {
        toast.error('Cours non actualisés : le service ne répond pas.')
      } else toast.success('Cours actualisés')
      await afterHoldingsChanged(queryClient)
    },
    onError: (error) => toast.error(holdingErrorMessage(error)),
  })
  const syncEnabled = holdings.data?.sync?.enabled ?? false
  return {
    refresh: () => (syncEnabled ? sync.mutate() : prices.mutate()),
    isPending: sync.isPending || prices.isPending,
    /** Nothing to refresh: no sync and no price service. */
    disabled:
      holdings.data !== undefined &&
      !syncEnabled &&
      !holdings.data.priceApiEnabled,
  }
}

/** « À jour il y a 6 min » / « Jamais synchronisé » / the sync is off. */
function freshnessText(holdings: AccountHoldingsDto, now: Date): string {
  const sync = holdings.sync
  if (!sync?.enabled) {
    return 'Synchronisation désactivée sur ce serveur : les soldes ne sont pas lus sur la blockchain.'
  }
  if (sync.syncedAt === null)
    return 'Jamais synchronisé : actualisez pour lire vos clés.'
  return `Soldes lus ${formatPriceAge(sync.syncedAt, now)}`
}

/**
 * Top of a wallet account: its value (once on the page), how fresh it is,
 * and each chain the last sync could not read with its retry time, one line
 * each. « Actualiser » is the page action.
 */
export function WalletStatus({ accountId }: { accountId: string }) {
  const holdings = useQuery(holdingsQuery(accountId))
  const now = new Date()
  if (holdings.isPending) {
    return (
      <Skeleton className="h-20 w-full rounded-xl" aria-label="Chargement" />
    )
  }
  if (holdings.isError) return null
  const data = holdings.data
  const failures = syncFailed(data) && data.sync ? data.sync.failedChains : []
  return (
    <section aria-label="Valeur du wallet" className="space-y-1">
      <p className="text-3xl font-semibold whitespace-nowrap tabular-nums">
        {data.holdings.length === 0 && !data.sync?.syncedAt
          ? '—'
          : formatCents(data.totals.valueCents)}
      </p>
      <p className="text-muted-foreground text-sm">
        {freshnessText(data, now)}
      </p>
      {syncFailed(data) && failures.length === 0 && (
        <p className="text-warning-foreground dark:text-warning flex items-start gap-1.5 text-sm">
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          La dernière synchronisation a échoué : soldes de la précédente.
        </p>
      )}
      {failures.length > 0 && (
        <ul aria-label="Chaînes non lues" className="space-y-0.5">
          {failures.map((failure) => (
            <li
              key={failure.chain}
              className="text-warning-foreground dark:text-warning flex items-start gap-1.5 text-sm"
            >
              <TriangleAlertIcon
                aria-hidden
                className="mt-0.5 size-4 shrink-0"
              />
              {chainFailureText(failure, now)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The wallet's public keys (what each found) and the tokens it reads. */
function WalletKeysCard({
  account,
  writable,
  onTokensChanged,
}: {
  account: AccountDto
  writable: boolean
  onTokensChanged: () => void
}) {
  const keys = useQuery(walletKeysQuery(account.id))
  const evmChains = [
    ...new Set(
      (keys.data ?? [])
        .filter((key) => key.family === 'evm')
        .flatMap((key) => key.chains),
    ),
  ] as CryptoChain[]
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Clés et jetons</CardTitle>
        <CardDescription>
          Clés publiques du wallet
          {account.institution ? ` ${account.institution}` : ''}, lues sur la
          blockchain.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <WalletKeyList
          accountId={account.id}
          writable={writable}
          provider={account.institution ?? undefined}
        />
        {evmChains.length > 0 && (
          <WalletTokenList
            accountId={account.id}
            writable={writable}
            chains={evmChains}
            onChanged={onTokensChanged}
          />
        )}
      </CardContent>
    </Card>
  )
}

/**
 * A wallet account's page body (#269): status, then the holdings beside the
 * keys and tokens from `@2xl` (924px at the 22px root), one column on phones.
 */
export function WalletAccount({
  account,
  writable,
  onTokensChanged,
}: {
  account: AccountDto
  writable: boolean
  /** A token added or removed: read it at once (« Actualiser »). */
  onTokensChanged: () => void
}) {
  return (
    <>
      <WalletStatus accountId={account.id} />
      <div className="grid grid-cols-1 items-start gap-4 @2xl:grid-cols-2">
        <HoldingsPanel
          accountId={account.id}
          writable={writable}
          source="wallet"
        />
        <WalletKeysCard
          account={account}
          writable={writable}
          onTokensChanged={onTokensChanged}
        />
      </div>
    </>
  )
}
