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
  BanknoteIcon,
  ClipboardPasteIcon,
  ClockAlertIcon,
  CoinsIcon,
  FileUpIcon,
  ListPlusIcon,
  PencilIcon,
  PencilLineIcon,
  PlusIcon,
  ReceiptIcon,
  RefreshCwIcon,
  ArrowDownUpIcon,
} from 'lucide-react'
import { useState } from 'react'
import type {
  DividendDto,
  AccountDto,
  AccountPerformanceDto,
  PositionLineDto,
  SnapshotDto,
  TransactionKind,
} from '#/api/types.gen'
import { PageBack } from '#/components/app-shell/PageBack'
import type { PageBackLink } from '#/components/app-shell/PageBack'
import { PageHeader } from '#/components/app-shell/PageHeader'
import type { PageAction } from '#/components/app-shell/page-actions'
import { cryptoSourceDetail } from '#/components/crypto/CryptoSourceCard'
import { ExchangeImportSheet } from '#/components/crypto/ExchangeImportSheet'
import { HoldingsPanel } from '#/components/crypto/HoldingsPanel'
import { PendingCard } from '#/components/crypto/PendingCard'
import {
  CryptoHistory,
  useWalletRefresh,
  WalletAccount,
} from '#/components/crypto/WalletAccount'
import { ManualTransactionSheet } from '#/components/expenses/ManualTransactionSheet'
import { formatShortDay } from '#/lib/period'
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
import { accountKindLabel, isInvestmentType, valueAgeText } from './labels'
import { useLinkedTransfersDetail } from './LinkedTransfers'
import { MealVoucherAccount } from './MealVoucherAccount'
import { useMovementsDetail } from './Movements'
import { PasteHistorySheet } from './PasteHistorySheet'
import { accountQuery, performanceQuery } from './queries'
import { SnapshotEditor } from './SnapshotEditor'
import {
  DividendSheet,
  SecuritiesFacts,
  useDividendsDetail,
} from '#/components/positions/Dividends'
import { LineEditor } from '#/components/positions/LineEditor'
import {
  LinesCard,
  useStatementsDetail,
} from '#/components/positions/LinesCard'
import { PeaFacts } from '#/components/positions/PeaFacts'
import {
  CashSheet,
  PriceSheet,
} from '#/components/positions/PriceAndCashSheets'
import { positionsQuery } from '#/components/positions/queries'
import { ValueChart } from './ValueChart'
import { valueHistoryDetail } from './ValueHistory'
import { AccountDetails } from './AccountDetails'
import type { AccountDetail } from './AccountDetails'

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
        crumb={accountKindLabel(account)}
        compactTitle
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
 * and performance from their dated snapshots (statement values) and the
 * history chart; crypto accounts also list their holdings, valued every day
 * at the last known prices. Checking and savings accounts: their balance and
 * its freshness, its evolution, their latest transactions, imports and
 * recurring debits (`CashAccount`, #293). The typed values themselves (an
 * investment's statement values, a bank account's statement balances, a
 * meal-voucher card's corrections) are in « Historique des valeurs », a
 * screen of its own opened from the page's actions (#420).
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
  // An exchange's export, from the page's menu (#447).
  const [exportOpen, setExportOpen] = useState(false)
  // The kind is chosen before adding (#398).
  const [addKind, setAddKind] = useState<TransactionKind | null>(null)
  const [investedOpen, setInvestedOpen] = useState(false)
  // The lines of a PEA or a compte-titres (#413, #414): the line, price and
  // cash editors.
  const [lineEditor, setLineEditor] = useState<{
    open: boolean
    line?: PositionLineDto
  }>({ open: false })
  const [priceLine, setPriceLine] = useState<PositionLineDto | null>(null)
  const [cashOpen, setCashOpen] = useState(false)
  // A compte-titres' dividends (#414).
  const [dividendEditor, setDividendEditor] = useState<{
    open: boolean
    dividend?: DividendDto
  }>({ open: false })
  const pea = account.data?.type === 'brokerage'
  const securities = account.data?.type === 'securities'
  const withPositions = pea || securities
  const positions = useQuery({
    ...positionsQuery(accountId),
    enabled: withPositions,
  })
  const navigate = useNavigate()
  const today = todayInParis()
  const walletRefresh = useWalletRefresh(accountId)

  if (account.isPending || performance.isPending) {
    return (
      <div>
        <PageBack {...back} current="…" />
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
        <PageBack
          {...back}
          current={notFound ? 'Compte introuvable' : 'Compte'}
        />
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
  const withLines =
    (positions.data?.lines.length ?? 0) > 0 ||
    (positions.data?.cashCents ?? 0) > 0
  const addLineAction = (primary: boolean): PageAction => ({
    label: 'Ajouter une ligne',
    icon: <ListPlusIcon />,
    primary,
    onSelect: () => setLineEditor({ open: true }),
  })
  const paste = (label: string): PageAction => ({
    label,
    icon: <ClipboardPasteIcon />,
    onSelect: () => setPasteOpen(true),
  })
  // Its typed values, a row of « Plus d’informations » (#420, #447); a
  // crypto account's are computed every day, never typed (#366).
  const valueHistory = crypto
    ? null
    : valueHistoryDetail({
        kind: investment || mealVoucher ? 'values' : 'statements',
        snapshots: data.snapshots,
        withContributions: investment,
        invested: investment
          ? new Map(
              data.contributionsHistory.map((p) => [
                p.date,
                p.contributionsCents,
              ]),
            )
          : undefined,
        onEdit: writable
          ? (snapshot) => setEditor({ open: true, snapshot })
          : undefined,
        onAdd: writable ? openAdd : undefined,
        onPaste:
          writable && !mealVoucher ? () => setPasteOpen(true) : undefined,
      })
  const exchange = crypto && current.cryptoSource === 'exchange'
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
            // computed from them every day, never typed (#366). An
            // exchange's export, its main action, from the menu (#447).
            exchange
            ? [
                {
                  label: 'Importer un export',
                  icon: <FileUpIcon />,
                  primary: true,
                  onSelect: () => setExportOpen(true),
                },
              ]
            : []
          : investment
            ? [
                // A PEA or a compte-titres with lines (#413, #414): its value
                // follows them, so adding a line comes first.
                ...(withPositions && withLines ? [addLineAction(true)] : []),
                // PEA, compte-titres, life insurance, employee savings: the
                // value is typed by hand from each statement, so updating it
                // is the main action.
                {
                  label: 'Mettre à jour la valeur',
                  icon: <PencilLineIcon />,
                  primary: !(withPositions && withLines),
                  onSelect: openAdd,
                },
                ...(withPositions && !withLines ? [addLineAction(false)] : []),
                ...(securities
                  ? [
                      {
                        label: 'Ajouter un dividende',
                        icon: <CoinsIcon />,
                        onSelect: () => setDividendEditor({ open: true }),
                      },
                    ]
                  : []),
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
                  label: 'Ajouter une dépense',
                  icon: <ReceiptIcon />,
                  onSelect: () => setAddKind('expense'),
                },
                {
                  label: 'Ajouter un revenu',
                  icon: <BanknoteIcon />,
                  onSelect: () => setAddKind('income'),
                },
                {
                  label: 'Ajouter un virement',
                  icon: <ArrowDownUpIcon />,
                  onSelect: () => setAddKind('transfer'),
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
        />
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
          // The day in the title, nothing under it (#413, the owner: less
          // text); an old value has its own warning above.
          asOf={
            !crypto && data.valueDate
              ? `au ${formatShortDay(data.valueDate, today.slice(0, 4))}`
              : undefined
          }
          onEditInvested={crypto ? undefined : () => setInvestedOpen(true)}
          footer={
            pea ? (
              <PeaFacts
                account={current}
                investedCents={data.contributionsCents}
                today={today}
                writable={writable}
              />
            ) : (
              securities && <SecuritiesFacts accountId={current.id} />
            )
          }
        />
      )}

      {/* The lines of a PEA (#413, the owner's « A. Comme le Crypto ») or a
          compte-titres (#414), alike. */}
      {withPositions && (
        <LinesCard
          accountId={current.id}
          accountType={pea ? 'brokerage' : 'securities'}
          writable={writable}
          onAddLine={() => setLineEditor({ open: true })}
          onEditLine={(line) => setLineEditor({ open: true, line })}
          onEditPrice={setPriceLine}
          onEditCash={() => setCashOpen(true)}
        />
      )}

      {/* Coins from or to somewhere the app can't see (#373). */}
      {crypto && <PendingCard accountId={current.id} writable={writable} />}

      {crypto && (
        <HoldingsPanel
          accountId={current.id}
          writable={writable}
          source={current.cryptoSource ?? 'manual'}
        />
      )}

      {mealVoucher ? (
        <>
          <MealVoucherAccount
            account={current}
            writable={writable}
            onCorrectBalance={openAdd}
          />
          <AccountDetails items={[valueHistory]} />
        </>
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
          onImport={openImport}
          onAddTransaction={() => setAddKind('expense')}
          details={[valueHistory]}
        />
      )}

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

      {/* Read now and then, one tap away (#447). */}
      {investment && !crypto && (
        <InvestmentDetails
          account={current}
          performance={data}
          writable={writable}
          valueHistory={valueHistory}
          onAddDividend={() => setDividendEditor({ open: true })}
          onEditDividend={(dividend) =>
            setDividendEditor({ open: true, dividend })
          }
        />
      )}
      {crypto && <CryptoDetails account={current} writable={writable} />}

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
          {exchange && (
            <ExchangeImportSheet
              open={exportOpen}
              onOpenChange={setExportOpen}
              accountId={current.id}
            />
          )}
          {securities && (
            <DividendSheet
              open={dividendEditor.open}
              onOpenChange={(open) =>
                !open && setDividendEditor({ open: false })
              }
              accountId={current.id}
              dividend={
                dividendEditor.open ? dividendEditor.dividend : undefined
              }
              today={today}
            />
          )}
          {withPositions && (
            <>
              <LineEditor
                open={lineEditor.open}
                onOpenChange={(open) => !open && setLineEditor({ open: false })}
                accountId={current.id}
                line={lineEditor.open ? lineEditor.line : undefined}
              />
              <PriceSheet
                open={priceLine !== null}
                onOpenChange={(open) => !open && setPriceLine(null)}
                line={priceLine}
                today={today}
              />
              <CashSheet
                open={cashOpen}
                onOpenChange={setCashOpen}
                accountId={current.id}
                cashCents={positions.data?.cashCents ?? 0}
              />
            </>
          )}
          {/* A crypto account's cost follows its coins (#373). */}
          {investment && !crypto && (
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
              open={addKind !== null}
              onOpenChange={(open) => {
                if (!open) setAddKind(null)
              }}
              initialKind={addKind ?? 'expense'}
              initialAccountId={current.id}
            />
          )}
        </>
      )}
    </div>
  )
}

/**
 * « Plus d’informations » of a PEA, a compte-titres, a life insurance or
 * employee savings (#447): the linked transfers, the statements of the lines
 * (#413), a compte-titres' dividends (#414), the typed values.
 */
function InvestmentDetails({
  account,
  performance,
  writable,
  valueHistory,
  onAddDividend,
  onEditDividend,
}: {
  account: AccountDto
  performance: AccountPerformanceDto
  writable: boolean
  valueHistory: AccountDetail | null
  onAddDividend: () => void
  onEditDividend: (dividend: DividendDto) => void
}) {
  const transfers = useLinkedTransfersDetail({
    accountId: account.id,
    performance,
  })
  const statements = useStatementsDetail({
    accountId: account.id,
    writable,
    enabled: account.type === 'brokerage' || account.type === 'securities',
  })
  const dividends = useDividendsDetail({
    accountId: account.id,
    enabled: account.type === 'securities',
    onAdd: writable ? onAddDividend : undefined,
    onEdit: writable ? onEditDividend : undefined,
  })
  return (
    <AccountDetails items={[transfers, statements, dividends, valueHistory]} />
  )
}

/**
 * « Plus d’informations » of an exchange or a manual crypto account (#447):
 * its movements, then where its holdings come from.
 */
function CryptoDetails({
  account,
  writable,
}: {
  account: AccountDto
  writable: boolean
}) {
  const movements = useMovementsDetail(account.id)
  return (
    <AccountDetails
      items={[movements, cryptoSourceDetail(account, writable)]}
    />
  )
}
