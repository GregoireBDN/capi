import { useRegisterPageAction } from '#/components/app-shell/page-actions'
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
  cn,
  ConfirmDialog,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  formatWholeEuros,
} from '@capi/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRightIcon,
  CoinsIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  WifiOffIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  AssetCostDto,
  CryptoAccountSource,
  HoldingsTotalsDto,
  ValuedHoldingDto,
} from '#/api/types.gen'
import { accountKeys } from '#/components/accounts/queries'
import { formatCents } from '#/lib/money'
import { DIVIDED_LIST, ROW_BUTTON } from '#/lib/row-list'
import { holdingErrorMessage } from './errors'
import { formatPriceAge, formatQuantity } from './format'
import { AssetBadge } from './AssetBadge'
import { HoldingEditor } from './HoldingEditor'
import { pricesSettling, staleShown, useLiveRefresh } from './live-refresh'
import { costLines } from './pending-text'
import {
  afterHoldingsChanged,
  cryptoKeys,
  holdingsQuery,
  refreshPrices,
  removeHolding,
} from './queries'
import { RowsCardSkeleton } from './skeletons'
import { DERIVED_ORIGIN_LABELS, isContractAsset } from './sources'

const signedWholeEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})
const formatSignedWholeEuros = (cents: number) =>
  signedWholeEuros.format(cents / 100)
const signed = (cents: number) => `${cents > 0 ? '+' : ''}${formatCents(cents)}`

/**
 * From 1 000 € a row drops the cents (« 2 871 € »), so the line's name
 * keeps its room on a phone (#323); the totals keep them.
 */
const WHOLE_FROM_CENTS = 100_000
export const rowAmount = (cents: number) =>
  Math.abs(cents) >= WHOLE_FROM_CENTS
    ? formatWholeEuros(cents)
    : formatCents(cents)
export const rowGain = (cents: number) =>
  Math.abs(cents) >= WHOLE_FROM_CENTS
    ? formatSignedWholeEuros(cents)
    : signed(cents)

type EditorState = { open: false } | { open: true; holding?: ValuedHoldingDto }

/**
 * The age of the oldest price shown (« il y a 3 h »), said once for the
 * whole list rather than on each line (#323, owner's « A. Deux lignes »).
 */
export function oldestPriceAge(
  holdings: readonly ValuedHoldingDto[],
  now: Date,
): string | null {
  const dates = holdings
    .map((holding) => holding.priceFetchedAt)
    .filter((at): at is string => at !== null)
  if (dates.length === 0) return null
  const oldest = dates.reduce((a, b) =>
    Date.parse(a) <= Date.parse(b) ? a : b,
  )
  return formatPriceAge(oldest, now)
}

/**
 * Where the line is held, when it says more than the asset's name (a
 * chain's line is located on « Ethereum »: said once).
 */
function holdingPlace(
  holding: Pick<ValuedHoldingDto, 'name' | 'location'>,
): string {
  return holding.location !== holding.name ? holding.location : ''
}

/** What ends the second line: the gain, or why there is no value. */
function HoldingStatus({
  holding,
  settling,
}: {
  holding: ValuedHoldingDto
  /** The live step is due or running: a stale price is not news yet. */
  settling: boolean
}) {
  if (holding.priceEur === null) {
    // A token added by its contract has no price to look up (#269).
    return isContractAsset(holding.assetId) ? (
      <span className="shrink-0">sans cours</span>
    ) : (
      <span className="text-warning-foreground dark:text-warning shrink-0">
        cours inconnu
      </span>
    )
  }
  if (holding.priceStale && !settling) {
    return (
      <span className="text-warning-foreground dark:text-warning shrink-0">
        non à jour
      </span>
    )
  }
  if (holding.gainCents === null) return null
  return (
    <span
      className={cn(
        'shrink-0 tabular-nums',
        holding.gainCents >= 0
          ? 'text-success-foreground dark:text-success'
          : 'text-destructive',
      )}
    >
      {rowGain(holding.gainCents)}
    </span>
  )
}

/**
 * One line on two rows (#323, owner's « A. Deux lignes »): where it is held
 * (or the coin's name) and its value, then the quantity and the gain. The
 * price, the amount invested and the note are in the line's editor.
 */
function HoldingRow({
  holding,
  mixed,
  settling,
}: {
  holding: ValuedHoldingDto
  /** The list holds both derived and manual lines. */
  mixed: boolean
  settling: boolean
}) {
  // The badge and the quantity say which coin: the first line says where
  // it is held when that tells two lines apart, else the coin's name.
  const title = holdingPlace(holding) || holding.name || holding.symbol
  const details = [
    `${formatQuantity(holding.quantity)} ${holding.symbol}`,
    mixed
      ? holding.origin === 'manual'
        ? 'à la main'
        : DERIVED_ORIGIN_LABELS[holding.origin].toLowerCase()
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <>
      <AssetBadge symbol={holding.symbol} />
      <span className="block min-w-0 flex-1 space-y-0.5">
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
          <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
            {holding.valueCents === null ? '—' : rowAmount(holding.valueCents)}
          </span>
        </span>
        <span className="text-muted-foreground flex items-baseline gap-3 text-xs">
          <span className="min-w-0 flex-1 truncate tabular-nums">
            {details}
          </span>
          <HoldingStatus holding={holding} settling={settling} />
        </span>
      </span>
    </>
  )
}

/**
 * « Prix de revient » per asset (#373): what its coins cost, carried from
 * exchange to wallet and back, and those of unknown cost; then the euros
 * waiting on an exchange, counted in its value.
 */
function CostList({
  costs,
  fiatCents,
}: {
  costs: readonly AssetCostDto[]
  fiatCents: number
}) {
  if (costs.length === 0 && fiatCents === 0) return null
  return (
    <div className="space-y-1 pt-3 text-xs">
      {costs.length > 0 && (
        <>
          <h3 className="text-muted-foreground font-medium">Prix de revient</h3>
          <ul aria-label="Prix de revient" className="space-y-1">
            {costs.map((cost) => (
              <li key={cost.assetId} className="flex gap-2 tabular-nums">
                <span className="w-12 shrink-0 font-medium">{cost.symbol}</span>
                <span className="text-muted-foreground min-w-0 flex-1">
                  {costLines(cost).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {fiatCents > 0 && (
        <p className="text-muted-foreground tabular-nums">
          {formatCents(fiatCents)} en euros sur la plateforme, comptés dans la
          valeur.
        </p>
      )}
    </div>
  )
}

/** Prices not refreshed, or holdings without a price. */
export function PriceAlerts({
  refreshFailed,
  refreshDue = false,
  refreshing = false,
  totals,
}: {
  refreshFailed: boolean
  /** A live refresh is due (#381): stale prices are not news yet. */
  refreshDue?: boolean
  /** A refresh is running. */
  refreshing?: boolean
  totals: HoldingsTotalsDto
}) {
  const stale = staleShown({ refreshDue, refreshFailed, totals }, refreshing)
  return (
    <>
      {stale && (
        <Alert variant="warning">
          <WifiOffIcon aria-hidden />
          <AlertTitle>Cours non actualisés</AlertTitle>
          <AlertDescription>
            Le service de cours ne répond pas : les derniers cours connus sont
            utilisés.
          </AlertDescription>
        </Alert>
      )}
      {totals.missingPriceCount > 0 && (
        <Alert variant="warning">
          <AlertTitle>
            {totals.missingPriceCount === 1
              ? 'Un avoir sans cours'
              : `${totals.missingPriceCount} avoirs sans cours`}
          </AlertTitle>
          <AlertDescription>
            La valeur du compte n’est pas mise à jour tant qu’un cours manque :
            saisissez-le sur l’avoir.
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}

/**
 * Holdings with their price and value; each line typed by hand opens its
 * editor when `onEdit` is given. Imported or synced lines are read-only.
 */
export function HoldingList({
  holdings,
  onEdit,
  onDelete,
  label = 'Avoirs',
  settling = false,
}: {
  holdings: readonly ValuedHoldingDto[]
  /** The live step is due or running (#381). */
  settling?: boolean
  onEdit?: (holding: ValuedHoldingDto) => void
  /** Lines typed by hand that can only be deleted (on a wallet, #269). */
  onDelete?: (holding: ValuedHoldingDto) => void
  label?: string
}) {
  const mixed =
    holdings.some((holding) => holding.origin !== 'manual') &&
    holdings.some((holding) => holding.origin === 'manual')
  return (
    // A container: the badges step aside on the narrowest cards.
    <ul className={cn(DIVIDED_LIST, '@container')} aria-label={label}>
      {holdings.map((holding) => {
        const row =
          'flex min-h-11 items-center gap-3 px-2 py-2.5 text-left text-sm'
        const name = [holding.symbol, holding.location]
          .filter(Boolean)
          .join(' · ')
        return (
          <li key={holding.id}>
            {onEdit && holding.origin === 'manual' ? (
              <button
                type="button"
                aria-label={`Modifier ${name}`}
                onClick={() => onEdit(holding)}
                className={cn(ROW_BUTTON, row)}
              >
                <HoldingRow
                  holding={holding}
                  mixed={mixed}
                  settling={settling}
                />
                <ChevronRightIcon
                  aria-hidden
                  className="text-muted-foreground size-4 shrink-0"
                />
              </button>
            ) : onDelete && holding.origin === 'manual' ? (
              <div className={row}>
                <HoldingRow
                  holding={holding}
                  mixed={mixed}
                  settling={settling}
                />
                <Button
                  size="sm"
                  iconOnly
                  variant="secondary"
                  ghost
                  aria-label={`Supprimer ${name}`}
                  onClick={() => onDelete(holding)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ) : (
              <div className={row}>
                <HoldingRow
                  holding={holding}
                  mixed={mixed}
                  settling={settling}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Holdings of a crypto account valued at the last known EUR prices: what is
 * held where, price and its age, value, invested and gain. Opening the page
 * may refresh prices (rate-limited by the API): today's live value follows,
 * never stored (#366; the daily close writes one value per day).
 */
export function HoldingsPanel({
  accountId,
  writable,
  source = 'manual',
}: {
  accountId: string
  writable: boolean
  /** Where the account's holdings come from (`manual`: typed by hand). */
  source?: CryptoAccountSource
}) {
  const queryClient = useQueryClient()
  // Stored lines and prices at once (#381), then the live step: the prices
  // older than the TTL, in place.
  const holdings = useQuery(holdingsQuery(accountId))
  const live = useLiveRefresh({
    target: accountId,
    queryKey: cryptoKeys.holdings(accountId),
    data: holdings.data,
    run: () => refreshPrices(accountId, 'auto'),
  })
  const [editor, setEditor] = useState<EditorState>({ open: false })
  const [deleting, setDeleting] = useState<ValuedHoldingDto>()
  const now = new Date()
  // A wallet's holdings come from the chain: nothing is typed there (#269).
  const wallet = source === 'wallet'
  const openAdd = () => setEditor({ open: true })
  // In the page's « ⋮ » inside the shell (#386).
  const inMenu = useRegisterPageAction(
    writable && !wallet
      ? { label: 'Ajouter un avoir', icon: <CoinsIcon />, onSelect: openAdd }
      : null,
  )

  // Fresh prices or lines: the summary and the curve's live point follow.
  useEffect(() => {
    if (holdings.dataUpdatedAt) {
      void queryClient.invalidateQueries({
        queryKey: accountKeys.performance(accountId),
      })
    }
  }, [accountId, holdings.dataUpdatedAt, queryClient])

  const refresh = useMutation({
    mutationFn: () => refreshPrices(accountId),
    onSuccess: (result) => {
      queryClient.setQueryData(cryptoKeys.holdings(accountId), result)
      if (result.refreshFailed) {
        toast.error('Cours non actualisés : le service ne répond pas.')
      } else toast.success('Cours actualisés')
    },
    onError: (error) => toast.error(holdingErrorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: (holding: ValuedHoldingDto) =>
      removeHolding(accountId, holding.id),
    onSuccess: async (_, holding) => {
      toast.success(`${holding.symbol} supprimé`)
      setDeleting(undefined)
      await afterHoldingsChanged(queryClient)
    },
    onError: (error) => toast.error(holdingErrorMessage(error)),
  })

  if (holdings.isPending) {
    return (
      <div role="status" aria-busy="true" aria-label="Chargement des avoirs">
        <RowsCardSkeleton title="Avoirs" rows={3} />
      </div>
    )
  }
  if (holdings.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Impossible de charger les avoirs.</AlertTitle>
        <AlertDescription>
          <Button size="sm" outline onClick={() => void holdings.refetch()}>
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const data = holdings.data
  const { totals } = data
  const priceAge = oldestPriceAge(data.holdings, now)
  const refreshing = live || refresh.isPending
  const settling = pricesSettling(data, refreshing)

  return (
    <section aria-label="Avoirs crypto" className="space-y-3">
      <PriceAlerts
        refreshFailed={data.refreshFailed}
        refreshDue={data.refreshDue}
        refreshing={refreshing}
        totals={totals}
      />

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Avoirs</CardTitle>
          <CardDescription aria-live="polite">
            {[
              wallet ? 'Lus sur la blockchain' : null,
              data.priceApiEnabled
                ? 'Cours mis à jour automatiquement'
                : 'Cours saisis à la main',
              // In place of the price age while the prices are asked.
              live ? 'actualisation…' : priceAge,
            ]
              .filter(Boolean)
              .join(' · ')}
            {live && (
              <LoaderCircleIcon
                aria-hidden
                className="ml-1.5 inline size-3.5 animate-spin align-[-0.125em]"
              />
            )}
          </CardDescription>
          {writable && !wallet && data.holdings.length > 0 && (
            <div className="grid gap-2 pt-2 @md:grid-cols-2 @2xl:flex">
              {data.priceApiEnabled && (
                <Button
                  size="sm"
                  outline
                  variant="secondary"
                  iconStart={<RefreshCwIcon />}
                  loading={refresh.isPending}
                  onClick={() => refresh.mutate()}
                >
                  Actualiser les cours
                </Button>
              )}
              {!inMenu && (
                <Button size="sm" iconStart={<PlusIcon />} onClick={openAdd}>
                  Ajouter un avoir
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {data.holdings.length === 0 && wallet ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>
                  {data.sync?.syncedAt
                    ? 'Aucun solde trouvé'
                    : 'Aucun avoir lu'}
                </EmptyTitle>
                <EmptyDescription>
                  {!data.sync?.enabled
                    ? 'La synchronisation est désactivée sur ce serveur : les soldes de ce wallet ne peuvent pas être lus.'
                    : data.sync.syncedAt
                      ? 'Les clés de ce wallet n’ont rien sur la blockchain : vérifiez le type d’adresses de chaque clé.'
                      : 'Actualisez pour lire les soldes de vos clés publiques sur la blockchain.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : data.holdings.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Aucun avoir</EmptyTitle>
                <EmptyDescription>
                  {source === 'manual'
                    ? 'Ajoutez les quantités détenues sur ce compte : leur valeur est calculée avec le cours du jour.'
                    : `Les avoirs ${source === 'exchange' ? 'importés' : 'synchronisés'} apparaîtront ici. En attendant, ajoutez les quantités détenues à la main : leur valeur est calculée avec le cours du jour.`}
                </EmptyDescription>
              </EmptyHeader>
              {writable && (
                <EmptyContent>
                  <Button iconStart={<PlusIcon />} onClick={openAdd}>
                    Ajouter un avoir
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <HoldingList
              holdings={data.holdings}
              settling={settling}
              onEdit={
                writable && !wallet
                  ? (holding) => setEditor({ open: true, holding })
                  : undefined
              }
              onDelete={writable && wallet ? setDeleting : undefined}
            />
          )}
          <CostList costs={data.costs} fiatCents={data.totals.fiatCents} />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Supprimer ${deleting?.symbol ?? 'cet avoir'} ?`}
        description="Cette ligne a été saisie à la main : les avoirs d’un wallet sont lus sur la blockchain. Elle ne pourra pas être saisie à nouveau."
        confirmLabel="Supprimer"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />

      {writable && !wallet && (
        <HoldingEditor
          open={editor.open}
          onOpenChange={(open) => !open && setEditor({ open: false })}
          accountId={accountId}
          holding={editor.open ? editor.holding : undefined}
          priceApiEnabled={data.priceApiEnabled}
        />
      )}
    </section>
  )
}
