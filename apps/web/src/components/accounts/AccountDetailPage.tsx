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
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ClipboardPasteIcon,
  ClockAlertIcon,
  FileUpIcon,
  PencilIcon,
  PencilLineIcon,
  PlusIcon,
  RefreshCwIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { AccountDto, SnapshotDto } from '#/api/types.gen'
import { PageBack } from '#/components/app-shell/PageBack'
import type { PageBackLink } from '#/components/app-shell/PageBack'
import { PageHeader } from '#/components/app-shell/PageHeader'
import type { PageAction } from '#/components/app-shell/page-actions'
import { CryptoSourceCard } from '#/components/crypto/CryptoSourceCard'
import { HoldingsPanel } from '#/components/crypto/HoldingsPanel'
import {
  CryptoHistory,
  useWalletRefresh,
  WalletAccount,
} from '#/components/crypto/WalletAccount'
import { ManualTransactionSheet } from '#/components/expenses/ManualTransactionSheet'
import { formatCalendarDate } from '#/lib/money'
import { ApiRequestError } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { accountBackLink } from './account-origin'
import type { AccountSearch } from './account-origin'
import { AccountEditor } from './AccountEditor'
import { CashAccount } from './CashAccount'
import { todayInParis } from './dates'
import { InvestedSheet } from './InvestedSheet'
import { InvestmentSummary } from './InvestmentSummary'
import { historyPoints } from './history'
import { formatAge, isInvestmentType, valueAgeText } from './labels'
import { LinkedTransfers } from './LinkedTransfers'
import { MealVoucherAccount } from './MealVoucherAccount'
import { MovementsCard } from './Movements'
import { PasteHistorySheet } from './PasteHistorySheet'
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

function AccountHeader({
  account,
  back,
  actions = [],
}: {
  account: AccountDto
  /** The page it was opened from (#324), « Comptes » by default. */
  back: PageBackLink
  /** Page actions before « Modifier » (import, add, update the value…). */
  actions?: PageAction[]
}) {
  const [editing, setEditing] = useState(false)
  return (
    <>
      <PageHeader
        back={back}
        title={account.name}
        titleAddon={
          account.archivedAt && (
            <Badge variant="secondary" outline>
              Archivé
            </Badge>
          )
        }
        description={account.institution ?? undefined}
        actions={[
          ...actions,
          {
            label: account.archivedAt ? 'Réactiver…' : 'Modifier',
            icon: <PencilIcon />,
            onSelect: () => setEditing(true),
          },
        ]}
      />
      <AccountEditor
        open={editing}
        onOpenChange={setEditing}
        account={account}
      />
    </>
  )
}

/**
 * One account, under one header (name, institution, archived badge) whose
 * page actions are the account's main ones. Investment accounts: their value
 * and performance from their dated snapshots (statement values), the history
 * chart and the snapshots themselves, added one by one or pasted from a
 * statement history; crypto accounts also list their holdings, valued every
 * day at the last known prices. Checking and savings accounts: their balance
 * and its freshness, its evolution, their latest transactions, imports and
 * recurring debits (`CashAccount`, #293).
 */
export function AccountDetailPage({
  accountId,
  origin = {},
}: {
  accountId: string
  /** Where it was opened from (`?from=`, `?month=`), for its back link. */
  origin?: AccountSearch
}) {
  const back = accountBackLink(origin)
  const account = useQuery(accountQuery(accountId))
  const performance = useQuery(performanceQuery(accountId))
  const [editor, setEditor] = useState<EditorState>({ open: false })
  const [pasteOpen, setPasteOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [investedOpen, setInvestedOpen] = useState(false)
  const navigate = useNavigate()
  const today = todayInParis()
  const walletRefresh = useWalletRefresh(accountId)

  if (account.isPending || performance.isPending) {
    return (
      <div>
        <PageBack {...back} />
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
      <div>
        <PageBack {...back} />
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
  // A wallet: one value, one refresh, its keys and tokens (#269).
  const wallet = crypto && current.cryptoSource === 'wallet'
  // A meal-voucher card: entered by hand, its entries first (#298).
  const mealVoucher = current.type === 'meal_voucher'
  const openAdd = () => setEditor({ open: true })
  // The chart's contributions: from the linked transfers when they make them.
  const chartSnapshots = data.snapshots.map((snapshot, i) => ({
    ...snapshot,
    contributionsCents:
      data.contributionsHistory[i]?.contributionsCents ??
      snapshot.contributionsCents,
  }))
  const openImport = () =>
    void navigate({ to: ROUTES.import, search: { account: current.id } })
  const paste = (label: string): PageAction => ({
    label,
    icon: <ClipboardPasteIcon />,
    onSelect: () => setPasteOpen(true),
  })
  const headerActions: PageAction[] = !writable
    ? []
    : wallet
      ? [
          {
            label: 'Actualiser',
            icon: <RefreshCwIcon />,
            primary: true,
            loading: walletRefresh.isPending,
            disabled: walletRefresh.disabled,
            onSelect: walletRefresh.refresh,
          },
        ]
      : mealVoucher
        ? // A meal-voucher card has its own entries (#298).
          []
        : crypto
          ? // Holdings are added in their own panel; the values are
            // computed from them every day, never typed (#366).
            []
          : investment
            ? [
                // PEA, life insurance, employee savings: the value is typed by
                // hand from each statement, so updating it is the main action.
                {
                  label: 'Mettre à jour la valeur',
                  icon: <PencilLineIcon />,
                  primary: true,
                  onSelect: openAdd,
                },
                paste('Coller un historique'),
              ]
            : [
                {
                  label: 'Importer un relevé',
                  icon: <FileUpIcon />,
                  primary: true,
                  onSelect: openImport,
                },
                {
                  label: 'Ajouter une opération',
                  icon: <PlusIcon />,
                  onSelect: () => setAddOpen(true),
                },
              ]

  // A wallet (#294): its value, holdings by asset, evolution, then its keys
  // and tokens; its values come from the chain, so none is added by hand.
  if (wallet) {
    return (
      <div className="@container space-y-6">
        <AccountHeader account={current} back={back} actions={headerActions} />
        <WalletAccount
          account={current}
          performance={data}
          writable={writable}
          today={today}
          refreshing={walletRefresh.isPending}
          onTokensChanged={walletRefresh.refresh}
          onEditInvested={() => setInvestedOpen(true)}
        />
        {writable && (
          <InvestedSheet
            open={investedOpen}
            onOpenChange={setInvestedOpen}
            account={current}
            performance={data}
          />
        )}
      </div>
    )
  }

  return (
    <div className="@container space-y-6">
      <AccountHeader account={current} back={back} actions={headerActions} />

      {investment && data.stale && data.valueDate && (
        <Alert variant="warning">
          <ClockAlertIcon aria-hidden />
          <AlertTitle>
            {valueAgeText(data.valueDate, data.daysSinceLatest ?? 0)}
          </AlertTitle>
          <AlertDescription>
            {crypto
              ? 'Mettez à jour vos avoirs ou les cours pour garder votre patrimoine à jour.'
              : 'Ajoutez la valeur de votre dernier relevé pour garder votre patrimoine à jour.'}
          </AlertDescription>
        </Alert>
      )}

      {/* The same summary on every investment account (#360), then what
          it holds, its evolution and its values. */}
      {investment && data.valueCents !== null && (
        <InvestmentSummary
          account={current}
          performance={data}
          writable={writable}
          caption={
            !crypto && data.valueDate
              ? data.stale || data.daysSinceLatest === null
                ? `Au ${formatCalendarDate(data.valueDate)}`
                : `Au ${formatCalendarDate(data.valueDate)}, ${formatAge(data.daysSinceLatest)}`
              : undefined
          }
          onEditInvested={() => setInvestedOpen(true)}
        />
      )}

      {crypto && (
        <HoldingsPanel
          accountId={current.id}
          writable={writable}
          source={current.cryptoSource ?? 'manual'}
        />
      )}

      {crypto && <CryptoSourceCard account={current} writable={writable} />}

      {mealVoucher ? (
        <MealVoucherAccount
          account={current}
          writable={writable}
          onCorrectBalance={openAdd}
        />
      ) : investment ? (
        data.valueCents === null &&
        !crypto && (
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
        <CashAccount
          account={current}
          writable={writable}
          today={today}
          snapshots={data.snapshots}
          onImport={openImport}
          onAddTransaction={() => setAddOpen(true)}
          onAddStatement={openAdd}
          onPasteStatements={() => setPasteOpen(true)}
          onEditStatement={(snapshot) => setEditor({ open: true, snapshot })}
        />
      )}

      {investment && !crypto && (
        <LinkedTransfers accountId={current.id} performance={data} />
      )}
      {/* Bank → exchange → Ledger, with the cost the coins left with. */}
      {crypto && <MovementsCard accountId={current.id} />}

      {/* A crypto account's values: one per day and today's, read only. */}
      {crypto && historyPoints(data).length > 0 && (
        <CryptoHistory performance={data} today={today} label="Valeur" />
      )}

      {investment && !crypto && data.snapshots.length > 0 && (
        <ValueChart
          snapshots={chartSnapshots}
          withContributions
          onAdd={writable ? openAdd : undefined}
        />
      )}

      {investment && !crypto && (
        <SnapshotList
          snapshots={data.snapshots}
          withContributions
          invested={
            new Map(
              data.contributionsHistory.map((p) => [
                p.date,
                p.contributionsCents,
              ]),
            )
          }
          onEdit={
            writable
              ? (snapshot) => setEditor({ open: true, snapshot })
              : undefined
          }
        />
      )}

      {writable && (
        <>
          {/* A crypto account's values are never typed (#366). */}
          {!crypto && (
            <SnapshotEditor
              open={editor.open}
              onOpenChange={(open) => !open && setEditor({ open: false })}
              accountId={current.id}
              today={today}
              withContributions={investment}
              snapshot={editor.open ? editor.snapshot : undefined}
              // A new value carries the invested amount only while it is
              // typed on the values: a base counts from its own day (#360).
              defaultContributionsCents={
                data.investedBase || data.contributionsSource === 'links'
                  ? null
                  : data.contributionsCents
              }
            />
          )}
          {investment && (
            <InvestedSheet
              open={investedOpen}
              onOpenChange={setInvestedOpen}
              account={current}
              performance={data}
            />
          )}
          {!crypto && (
            <PasteHistorySheet
              open={pasteOpen}
              onOpenChange={setPasteOpen}
              accountId={current.id}
              today={today}
            />
          )}
          {!investment && (
            <ManualTransactionSheet
              open={addOpen}
              onOpenChange={setAddOpen}
              initialAccountId={current.id}
            />
          )}
        </>
      )}
    </div>
  )
}
