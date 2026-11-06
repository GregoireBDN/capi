import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  StatCard,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeftIcon,
  ArrowLeftRightIcon,
  ClipboardPasteIcon,
  ClockAlertIcon,
  PlusIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { AccountDto, SnapshotDto } from '#/api/types.gen'
import { HoldingsPanel } from '#/components/crypto/HoldingsPanel'
import { ACCOUNT_TYPE_LABELS } from '#/components/dashboard/labels'
import { formatCalendarDate } from '#/lib/money'
import { ApiRequestError } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { todayInParis } from './dates'
import { isInvestmentType, valueAgeText } from './labels'
import { PasteHistorySheet } from './PasteHistorySheet'
import { PerformanceTiles } from './PerformanceTiles'
import { accountQuery, performanceQuery } from './queries'
import { SnapshotEditor } from './SnapshotEditor'
import { SnapshotList } from './SnapshotList'
import { ValueChart } from './ValueChart'

type EditorState = { open: false } | { open: true; snapshot?: SnapshotDto }

function PageSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-60 w-full rounded-xl" />
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to={ROUTES.accounts}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
    >
      <ArrowLeftIcon aria-hidden className="size-4" />
      Comptes
    </Link>
  )
}

function AccountHeader({ account }: { account: AccountDto }) {
  const kind = [ACCOUNT_TYPE_LABELS[account.type], account.institution]
    .filter(Boolean)
    .join(' · ')
  return (
    <header className="space-y-1">
      <BackLink />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight break-words">
          {account.name}
        </h1>
        {account.archivedAt && (
          <Badge variant="secondary" outline>
            Archivé
          </Badge>
        )}
      </div>
      <p className="text-muted-foreground text-sm">{kind}</p>
    </header>
  )
}

/**
 * One account: its value and performance from its dated snapshots (statement
 * values of investment accounts), the history chart and the snapshots
 * themselves, added one by one or pasted from a statement history. Checking
 * and savings accounts show their current balance and their statement
 * balances, and link to their transactions. Crypto accounts also list their
 * holdings, valued every day at the last known prices.
 */
export function AccountDetailPage({ accountId }: { accountId: string }) {
  const account = useQuery(accountQuery(accountId))
  const performance = useQuery(performanceQuery(accountId))
  const [editor, setEditor] = useState<EditorState>({ open: false })
  const [pasteOpen, setPasteOpen] = useState(false)
  const today = todayInParis()

  if (account.isPending || performance.isPending) {
    return (
      <div className="space-y-6">
        <BackLink />
        <PageSkeleton />
      </div>
    )
  }

  const error = account.error ?? performance.error
  if (error || !account.data || !performance.data) {
    // 400: not an account id at all.
    const notFound =
      error instanceof ApiRequestError &&
      (error.status === 404 || error.status === 400)
    return (
      <div className="space-y-6">
        <BackLink />
        {notFound ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Compte introuvable</EmptyTitle>
              <EmptyDescription>
                Ce compte n’existe pas ou plus.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Alert variant="destructive">
            <AlertTitle>Impossible de charger le compte.</AlertTitle>
            <AlertDescription>
              <Button
                size="sm"
                outline
                onClick={() => {
                  void account.refetch()
                  void performance.refetch()
                }}
              >
                Réessayer
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    )
  }

  const data = performance.data
  const current = account.data
  const investment = isInvestmentType(current.type)
  // Crypto accounts are valued from their holdings (one snapshot per day).
  const crypto = current.type === 'crypto'
  const writable = current.archivedAt === null
  const openAdd = () => setEditor({ open: true })

  const actions = writable && (
    <div className="grid grid-cols-2 gap-2 @2xl:flex">
      <Button iconStart={<PlusIcon />} onClick={openAdd}>
        Ajouter
      </Button>
      <Button
        outline
        variant="secondary"
        iconStart={<ClipboardPasteIcon />}
        onClick={() => setPasteOpen(true)}
      >
        Coller
      </Button>
    </div>
  )

  return (
    <div className="@container space-y-6">
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-end @2xl:justify-between">
        <AccountHeader account={current} />
        {actions}
      </div>

      {investment && data.stale && data.valueDate && (
        <Alert variant="warning">
          <ClockAlertIcon aria-hidden />
          <AlertTitle>
            {valueAgeText(data.valueDate, data.daysSinceLatest ?? 0)}
          </AlertTitle>
          <AlertDescription>
            Ajoutez la valeur de votre dernier relevé pour garder votre
            patrimoine à jour.
          </AlertDescription>
        </Alert>
      )}

      {crypto && <HoldingsPanel accountId={current.id} writable={writable} />}

      {investment ? (
        data.valueCents === null ? (
          crypto ? null : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>Aucune valeur pour ce compte</EmptyTitle>
                <EmptyDescription>
                  Saisissez la valeur indiquée sur un relevé, ou collez
                  l’historique de vos relevés.
                </EmptyDescription>
              </EmptyHeader>
              {writable && (
                <EmptyContent>
                  <Button iconStart={<PlusIcon />} onClick={openAdd}>
                    Ajouter une valeur
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          )
        ) : (
          <>
            {!data.stale && data.valueDate && data.daysSinceLatest !== null && (
              <p className="text-muted-foreground -mt-3 text-sm">
                {valueAgeText(data.valueDate, data.daysSinceLatest)}
              </p>
            )}
            <PerformanceTiles performance={data} />
          </>
        )
      ) : (
        <section aria-label="Solde" className="space-y-2">
          <StatCard
            label="Solde"
            value={current.balanceCents ?? 0}
            valueFormatter={
              current.balanceCents === null ? () => '—' : undefined
            }
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-muted-foreground text-xs">
              {current.balanceDate === null
                ? 'Solde inconnu'
                : `Au ${formatCalendarDate(current.balanceDate)}, d’après les opérations importées et les soldes de relevés.`}
            </p>
            <Button asChild size="sm" outline variant="secondary">
              <Link to={ROUTES.transactions} search={{ account: current.id }}>
                <ArrowLeftRightIcon aria-hidden />
                Voir les opérations
              </Link>
            </Button>
          </div>
        </section>
      )}

      {data.snapshots.length > 0 && (
        <ValueChart snapshots={data.snapshots} withContributions={investment} />
      )}

      <SnapshotList
        snapshots={data.snapshots}
        withContributions={investment}
        onEdit={
          writable
            ? (snapshot) => setEditor({ open: true, snapshot })
            : undefined
        }
      />

      {writable && (
        <>
          <SnapshotEditor
            open={editor.open}
            onOpenChange={(open) => !open && setEditor({ open: false })}
            accountId={current.id}
            today={today}
            withContributions={investment}
            snapshot={editor.open ? editor.snapshot : undefined}
            defaultContributionsCents={data.contributionsCents}
          />
          <PasteHistorySheet
            open={pasteOpen}
            onOpenChange={setPasteOpen}
            accountId={current.id}
            today={today}
          />
        </>
      )}
    </div>
  )
}
