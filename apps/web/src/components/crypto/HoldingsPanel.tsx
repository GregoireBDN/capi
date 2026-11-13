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
import { PencilIcon, PlusIcon, RefreshCwIcon, WifiOffIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { ValuedHoldingDto } from '#/api/types.gen'
import { afterSnapshotsChanged } from '#/components/accounts/queries'
import { formatCents } from '#/lib/money'
import { holdingErrorMessage } from './errors'
import { formatPrice, formatPriceAge, formatQuantity } from './format'
import { HoldingEditor } from './HoldingEditor'
import { cryptoKeys, holdingsQuery, refreshPrices } from './queries'

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

function HoldingRow({
  holding,
  now,
}: {
  holding: ValuedHoldingDto
  now: Date
}) {
  return (
    // The amounts go under the asset when both don't fit side by side.
    <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1">
      <div className="min-w-[8rem] flex-1 space-y-0.5">
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 font-medium">{holding.symbol}</span>
          <span className="text-muted-foreground truncate text-xs">
            {[holding.name, holding.location].filter(Boolean).join(' · ')}
          </span>
        </p>
        <p className="text-sm tabular-nums">
          {formatQuantity(holding.quantity)} {holding.symbol}
        </p>
        <PriceLine holding={holding} now={now} />
      </div>
      <div className="ml-auto space-y-0.5 text-right whitespace-nowrap">
        <p className="font-medium tabular-nums">
          {holding.valueCents === null ? '—' : formatCents(holding.valueCents)}
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
}: {
  accountId: string
  writable: boolean
}) {
  const queryClient = useQueryClient()
  const holdings = useQuery(holdingsQuery(accountId))
  const [editor, setEditor] = useState<EditorState>({ open: false })
  const now = new Date()

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
  const stale = data.refreshFailed || totals.staleCount > 0

  return (
    <section aria-label="Avoirs crypto" className="space-y-3">
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

      {data.holdings.length > 0 && (
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
            {data.priceApiEnabled
              ? 'Cours en euros mis à jour automatiquement.'
              : 'Cours automatiques désactivés : cours saisis à la main.'}
          </CardDescription>
          {writable && data.holdings.length > 0 && (
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
          {data.holdings.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Aucun avoir</EmptyTitle>
                <EmptyDescription>
                  Ajoutez les quantités détenues sur ce compte : leur valeur est
                  calculée avec le cours du jour.
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
            <ul className="divide-y" aria-label="Avoirs">
              {data.holdings.map((holding) => {
                const row = 'flex items-start gap-3 py-2.5 text-left text-sm'
                const label = [holding.symbol, holding.location]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <li key={holding.id}>
                    {writable ? (
                      <button
                        type="button"
                        aria-label={`Modifier ${label}`}
                        onClick={() => setEditor({ open: true, holding })}
                        className={cn(
                          row,
                          'hover:bg-muted/50 focus-visible:ring-ring -mx-2 w-[calc(100%+1rem)] rounded-md px-2 outline-none focus-visible:ring-2',
                        )}
                      >
                        <HoldingRow holding={holding} now={now} />
                        <PencilIcon
                          aria-hidden
                          className="text-muted-foreground mt-0.5 size-4 shrink-0"
                        />
                      </button>
                    ) : (
                      <div className={row}>
                        <HoldingRow holding={holding} now={now} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {writable && (
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
