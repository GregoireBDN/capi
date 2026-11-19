import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
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
  Skeleton,
  StatCard,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  WifiOffIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  CryptoAccountSource,
  HoldingsTotalsDto,
  ValuedHoldingDto,
} from '#/api/types.gen'
import { afterSnapshotsChanged } from '#/components/accounts/queries'
import { formatCents } from '#/lib/money'
import { DIVIDED_LIST, ROW_BUTTON } from '#/lib/row-list'
import { holdingErrorMessage } from './errors'
import { formatPrice, formatPriceAge, formatQuantity } from './format'
import { AssetBadge } from './AssetBadge'
import { HoldingEditor } from './HoldingEditor'
import {
  afterHoldingsChanged,
  cryptoKeys,
  holdingsQuery,
  refreshPrices,
  removeHolding,
} from './queries'
import { DERIVED_ORIGIN_LABELS, isContractAsset } from './sources'

const dash = () => '—'
const signedWholeEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})
/** Half-width tiles use whole euros so two fit side by side on a phone. */
const formatSignedWholeEuros = (cents: number) =>
  signedWholeEuros.format(cents / 100)
const signed = (cents: number) => `${cents > 0 ? '+' : ''}${formatCents(cents)}`

type EditorState = { open: false } | { open: true; holding?: ValuedHoldingDto }

function PriceLine({ holding, now }: { holding: ValuedHoldingDto; now: Date }) {
  if (holding.priceEur === null || holding.priceFetchedAt === null) {
    // A token added by its contract has no price to look up (#269).
    if (isContractAsset(holding.assetId)) {
      return <span className="text-muted-foreground text-xs">sans cours</span>
    }
    return (
      <Badge variant="warning" outline>
        Cours inconnu
      </Badge>
    )
  }
  return (
    <span className="text-muted-foreground inline-flex flex-wrap items-center gap-1.5 text-xs">
      <span className="tabular-nums">{formatPrice(holding.priceEur)}</span>
      <span>
        {holding.priceSource === 'manual' ? 'manuel, ' : ''}
        {formatPriceAge(holding.priceFetchedAt, now)}
      </span>
      {holding.priceStale && (
        <Badge variant="warning" outline>
          Non à jour
        </Badge>
      )}
    </span>
  )
}

/**
 * Where a line comes from, shown only when the list mixes origins (#269):
 * on an account whose lines all come from its sync or imports, it says
 * nothing.
 */
function OriginBadge({ holding }: { holding: ValuedHoldingDto }) {
  return (
    <Badge variant="secondary" outline className="shrink-0">
      {holding.origin === 'manual'
        ? 'Saisi à la main'
        : DERIVED_ORIGIN_LABELS[holding.origin]}
    </Badge>
  )
}

/**
 * "Ethereum · Arbitrum": the asset's name when it is not its symbol, and the
 * place when it is not the asset's name (« Ethereum · Ethereum » said it
 * twice).
 */
export function holdingSubtitle(
  holding: Pick<ValuedHoldingDto, 'symbol' | 'name' | 'location'>,
): string {
  const name = holding.name !== holding.symbol ? holding.name : ''
  const where = holding.location !== holding.name ? holding.location : ''
  return [name, where].filter(Boolean).join(' · ')
}

function HoldingRow({
  holding,
  now,
  mixed,
}: {
  holding: ValuedHoldingDto
  now: Date
  /** The list holds both derived and manual lines. */
  mixed: boolean
}) {
  return (
    <>
      <AssetBadge symbol={holding.symbol} />
      {/* The amounts go under the asset when both don't fit side by side. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-[8rem] flex-1 space-y-0.5">
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="shrink-0 font-medium">{holding.symbol}</span>
            {holdingSubtitle(holding) && (
              <span className="text-muted-foreground min-w-0 truncate text-xs">
                {holdingSubtitle(holding)}
              </span>
            )}
            {mixed && <OriginBadge holding={holding} />}
          </p>
          <p className="text-sm tabular-nums">
            {formatQuantity(holding.quantity)} {holding.symbol}
          </p>
          <PriceLine holding={holding} now={now} />
        </div>
        <div className="ml-auto space-y-0.5 text-right whitespace-nowrap">
          <p className="font-medium tabular-nums">
            {holding.valueCents === null
              ? '—'
              : formatCents(holding.valueCents)}
          </p>
          {holding.investedCents !== null && (
            <p className="text-muted-foreground text-xs tabular-nums">
              Investi {formatCents(holding.investedCents)}
            </p>
          )}
          {holding.gainCents !== null && (
            <p
              className={cn(
                'text-xs tabular-nums',
                holding.gainCents >= 0
                  ? 'text-success-foreground dark:text-success'
                  : 'text-destructive',
              )}
            >
              {signed(holding.gainCents)}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

/** Prices not refreshed, or holdings without a price. */
export function PriceAlerts({
  refreshFailed,
  totals,
}: {
  refreshFailed: boolean
  totals: HoldingsTotalsDto
}) {
  const stale = refreshFailed || totals.staleCount > 0
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
  now,
  onEdit,
  onDelete,
  label = 'Avoirs',
}: {
  holdings: readonly ValuedHoldingDto[]
  now: Date
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
        const row = 'flex items-start gap-3 px-2 py-2.5 text-left text-sm'
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
                <HoldingRow holding={holding} now={now} mixed={mixed} />
                <PencilIcon
                  aria-hidden
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                />
              </button>
            ) : onDelete && holding.origin === 'manual' ? (
              <div className={row}>
                <HoldingRow holding={holding} now={now} mixed={mixed} />
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
                <HoldingRow holding={holding} now={now} mixed={mixed} />
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
 * may refresh prices (rate-limited by the API) and write today's value; the
 * snapshot history then gets a point for the day.
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
  const holdings = useQuery(holdingsQuery(accountId))
  const [editor, setEditor] = useState<EditorState>({ open: false })
  const [deleting, setDeleting] = useState<ValuedHoldingDto>()
  const now = new Date()
  // A wallet's holdings come from the chain: nothing is typed there (#269).
  const wallet = source === 'wallet'

  // A valuation wrote today's snapshot: balance, chart and net worth follow.
  const written = holdings.data?.snapshot
  useEffect(() => {
    if (written) void afterSnapshotsChanged(queryClient)
  }, [written, holdings.dataUpdatedAt, queryClient])

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
      <Skeleton className="h-48 w-full rounded-xl" aria-label="Chargement" />
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
  const openAdd = () => setEditor({ open: true })

  return (
    <section aria-label="Avoirs crypto" className="space-y-3">
      <PriceAlerts refreshFailed={data.refreshFailed} totals={totals} />

      {!wallet && data.holdings.length > 0 && (
        <div className="grid grid-cols-1 gap-2 @lg:grid-cols-2 @2xl:grid-cols-3">
          <StatCard
            className="@lg:col-span-2 @2xl:col-span-1"
            label="Valeur des avoirs"
            value={totals.valueCents}
          />
          <StatCard
            label="Investi"
            value={totals.investedCents ?? 0}
            valueFormatter={
              totals.investedCents === null ? dash : formatWholeEuros
            }
          />
          <StatCard
            label="Plus-value"
            value={totals.gainCents ?? 0}
            valueFormatter={
              totals.gainCents === null ? dash : formatSignedWholeEuros
            }
          />
        </div>
      )}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Avoirs</CardTitle>
          <CardDescription>
            {wallet
              ? data.priceApiEnabled
                ? 'Lus sur la blockchain, au cours du jour.'
                : 'Lus sur la blockchain. Cours automatiques désactivés : cours saisis à la main.'
              : data.priceApiEnabled
                ? 'Cours en euros mis à jour automatiquement.'
                : 'Cours automatiques désactivés : cours saisis à la main.'}
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
              <Button size="sm" iconStart={<PlusIcon />} onClick={openAdd}>
                Ajouter un avoir
              </Button>
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
              now={now}
              onEdit={
                writable && !wallet
                  ? (holding) => setEditor({ open: true, holding })
                  : undefined
              }
              onDelete={writable && wallet ? setDeleting : undefined}
            />
          )}
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
