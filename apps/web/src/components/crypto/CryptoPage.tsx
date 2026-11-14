import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
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
import { Link } from '@tanstack/react-router'
import { PlusIcon, RefreshCwIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  CryptoSummaryAccountDto,
  CryptoSummaryDto,
  ValuedHoldingDto,
} from '#/api/types.gen'
import { afterSnapshotsChanged } from '#/components/accounts/queries'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { accountsQuery } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { holdingErrorMessage } from './errors'
import { formatPriceAge } from './format'
import { HoldingEditor } from './HoldingEditor'
import { HoldingList, PriceAlerts } from './HoldingsPanel'
import { cryptoKeys, cryptoSummaryQuery, refreshAllPrices } from './queries'

const dash = () => '—'
const signedWholeEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})
const formatSignedWholeEuros = (cents: number) =>
  signedWholeEuros.format(cents / 100)

type EditorState =
  | { open: false }
  | { open: true; accountId?: string; holding?: ValuedHoldingDto }

/** When the most recent price was fetched or typed, or null without any. */
function latestPriceAt(summary: CryptoSummaryDto): string | null {
  let latest: string | null = null
  for (const account of summary.accounts) {
    for (const holding of account.holdings) {
      const at = holding.priceFetchedAt
      if (at !== null && (latest === null || at > latest)) latest = at
    }
  }
  return latest
}

function AccountCard({
  account,
  valuedOn,
  now,
  onAdd,
  onEdit,
}: {
  account: CryptoSummaryAccountDto
  /** Date of the account's latest value, if any. */
  valuedOn: string | null
  now: Date
  onAdd: () => void
  onEdit: (holding: ValuedHoldingDto) => void
}) {
  const where =
    account.institution && account.institution !== account.name
      ? `${account.institution} · `
      : ''
  return (
    <Card className="min-w-0" aria-label={account.name} role="region">
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <CardTitle className="min-w-[7rem] flex-1 break-words">
            <Link
              to={ROUTES.account}
              params={{ accountId: account.accountId }}
              className="hover:underline"
            >
              {account.name}
            </Link>
          </CardTitle>
          {account.holdings.length > 0 && (
            <p className="ml-auto font-semibold whitespace-nowrap tabular-nums">
              {formatCents(account.totals.valueCents)}
            </p>
          )}
        </div>
        <CardDescription>
          {where}
          {valuedOn === null
            ? 'Pas encore valorisé'
            : `Valorisé le ${formatCalendarDate(valuedOn)}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {account.holdings.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun avoir sur ce compte.
          </p>
        ) : (
          <HoldingList
            holdings={account.holdings}
            now={now}
            onEdit={onEdit}
            label={`Avoirs ${account.name}`}
          />
        )}
      </CardContent>
      <CardFooter>
        <Button
          size="sm"
          outline
          variant="secondary"
          iconStart={<PlusIcon />}
          aria-label={`Ajouter un avoir à ${account.name}`}
          onClick={onAdd}
        >
          Ajouter un avoir
        </Button>
      </CardFooter>
    </Card>
  )
}

/**
 * Crypto: every open crypto account (one per exchange or wallet) with what
 * it holds, the prices and how fresh they are, and the total. A first
 * holding can be added from an empty app: its exchange or wallet is set up
 * on the way.
 */
export function CryptoPage() {
  const queryClient = useQueryClient()
  const summary = useQuery(cryptoSummaryQuery)
  const accounts = useQuery(accountsQuery)
  const [editor, setEditor] = useState<EditorState>({ open: false })
  const now = new Date()

  // A valuation wrote today's snapshots: balances and net worth follow.
  const written = summary.data?.accounts.some((row) => row.snapshot !== null)
  useEffect(() => {
    if (written) void afterSnapshotsChanged(queryClient)
  }, [written, summary.dataUpdatedAt, queryClient])

  const refresh = useMutation({
    mutationFn: refreshAllPrices,
    onSuccess: async (result) => {
      queryClient.setQueryData(cryptoKeys.summary, result)
      if (result.refreshFailed) {
        toast.error('Cours non actualisés : le service ne répond pas.')
      } else toast.success('Cours actualisés')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['crypto', 'holdings'] }),
        afterSnapshotsChanged(queryClient),
      ])
    },
    onError: (error) => toast.error(holdingErrorMessage(error)),
  })

  const data = summary.data
  const list = data?.accounts ?? []
  const holdingCount = list.reduce((n, row) => n + row.holdings.length, 0)
  const valuedOn = new Map(
    (accounts.data ?? []).map((account) => [account.id, account.balanceDate]),
  )
  const latest = data ? latestPriceAt(data) : null
  const openAdd = (accountId?: string) => setEditor({ open: true, accountId })

  return (
    <div className="@container space-y-6">
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-end @2xl:justify-between">
        <PageHeader
          title="Crypto"
          description="Vos plateformes et wallets, valorisés au cours du jour."
        />
        {list.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data?.priceApiEnabled && holdingCount > 0 && (
              <Button
                outline
                variant="secondary"
                iconStart={<RefreshCwIcon />}
                loading={refresh.isPending}
                onClick={() => refresh.mutate()}
              >
                Actualiser les cours
              </Button>
            )}
            <Button iconStart={<PlusIcon />} onClick={() => openAdd()}>
              Ajouter un avoir
            </Button>
          </div>
        )}
      </div>

      {summary.isPending && (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      )}

      {summary.isError && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger vos cryptos.</AlertTitle>
          <AlertDescription>
            <Button size="sm" outline onClick={() => void summary.refetch()}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {data && list.length === 0 && (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Aucune crypto suivie</EmptyTitle>
                <EmptyDescription>
                  Ajoutez une plateforme ou un wallet et ce que vous y détenez :
                  sa valeur entre dans votre patrimoine.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button iconStart={<PlusIcon />} onClick={() => openAdd()}>
                  Ajouter un wallet
                </Button>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      )}

      {data && list.length > 0 && (
        <>
          <PriceAlerts
            refreshFailed={data.refreshFailed}
            totals={data.totals}
          />

          {holdingCount > 0 && (
            <div className="grid grid-cols-1 gap-2 @lg:grid-cols-2 @2xl:grid-cols-3">
              <StatCard
                className="@lg:col-span-2 @2xl:col-span-1"
                label="Valeur totale"
                value={data.totals.valueCents}
              />
              <StatCard
                label="Investi"
                value={data.totals.investedCents ?? 0}
                valueFormatter={
                  data.totals.investedCents === null ? dash : formatWholeEuros
                }
              />
              <StatCard
                label="Plus-value"
                value={data.totals.gainCents ?? 0}
                valueFormatter={
                  data.totals.gainCents === null ? dash : formatSignedWholeEuros
                }
              />
            </div>
          )}

          <p className="text-muted-foreground text-sm">
            {data.priceApiEnabled
              ? 'Cours en euros mis à jour automatiquement.'
              : 'Cours automatiques désactivés : cours saisis à la main.'}
            {latest !== null &&
              ` Dernier cours ${formatPriceAge(latest, now)}.`}
          </p>

          <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
            {list.map((account) => (
              <AccountCard
                key={account.accountId}
                account={account}
                valuedOn={valuedOn.get(account.accountId) ?? null}
                now={now}
                onAdd={() => openAdd(account.accountId)}
                onEdit={(holding) => setEditor({ open: true, holding })}
              />
            ))}
          </div>
        </>
      )}

      {data && (
        <HoldingEditor
          open={editor.open}
          onOpenChange={(open) => !open && setEditor({ open: false })}
          accountId={editor.open ? editor.accountId : undefined}
          accounts={list.map((row) => ({ id: row.accountId, name: row.name }))}
          holding={editor.open ? editor.holding : undefined}
          priceApiEnabled={data.priceApiEnabled}
        />
      )}
    </div>
  )
}
