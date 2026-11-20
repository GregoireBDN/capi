import { Card, CardContent, ItemList, ItemListRow } from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { HandCoinsIcon } from 'lucide-react'
import type { DashboardAccountDto, NetWorthDto } from '#/api/types.gen'
import { AccountList } from '#/components/accounts/AccountList'
import { formatCents, formatWholeEuros } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { owedSummaryQuery } from '#/components/owed/queries'
import { ROUTES } from '#/lib/routes'
import { DashboardCardHeader } from './DashboardCardHeader'
import { FigureTile } from './FigureTile'
import { formatSignedWhole } from './MonthReview'

const GROUPS = [
  {
    group: 'cash',
    title: 'Liquidités',
    total: (netWorth: NetWorthDto) => netWorth.cashCents,
  },
  {
    group: 'investments',
    title: 'Investissements',
    total: (netWorth: NetWorthDto) => netWorth.investmentsCents,
  },
] as const

/**
 * « +1 120 € depuis le 31 oct. »: today's net worth against the last month
 * end, so it reads apart from the review's month-end figure. Null when that
 * end is unknown.
 */
export function sinceMonthEnd(netWorth: NetWorthDto): string | null {
  if (netWorth.previousMonthEndCents === null) return null
  const change = netWorth.totalCents - netWorth.previousMonthEndCents
  return `${formatSignedWhole(change)} depuis le ${formatShortDay(netWorth.previousMonthEnd)}`
}

/**
 * Accounts and their balances, cash (checking, savings) apart from
 * investments, each group with its subtotal. Cash accounts open their
 * transactions; investment accounts, valued by snapshots, open their detail
 * page (value history, gain), where a value is updated; a value older than
 * its update rhythm is flagged « à mettre à jour».
 */
export function AccountsList({
  accounts,
  netWorth,
}: {
  accounts: DashboardAccountDto[]
  netWorth: NetWorthDto
}) {
  return (
    <Card className="min-w-0">
      <DashboardCardHeader
        title="Comptes"
        link={{ label: 'Évolution', to: ROUTES.netWorth }}
      />
      <CardContent className="space-y-4">
        {/* Today's net worth, once, and how it moved since the last month
            end (the month-end figure of the review, #321), then its two
            parts; the groups below don't repeat their totals. */}
        <div className="@container grid gap-2">
          <FigureTile
            label="Patrimoine à ce jour"
            value={formatCents(netWorth.totalCents)}
            notes={[sinceMonthEnd(netWorth)]}
            notesOnPhone
          />
          <div className="grid gap-2 @[36rem]:grid-cols-2">
            {GROUPS.map(({ group, title, total }) => (
              <FigureTile
                key={group}
                label={title}
                value={formatCents(total(netWorth))}
              />
            ))}
          </div>
        </div>
        <OwedRow />
        <AccountList
          from="dashboard"
          primaryAction="account"
          groups={GROUPS.map(({ group, title }) => ({
            id: group,
            title,
            accounts: accounts
              .filter((account) => account.group === group)
              .map((account) => ({
                ...account,
                valueCents: account.balanceCents,
                valueDate: account.balanceDate,
                link:
                  group === 'cash'
                    ? ('transactions' as const)
                    : ('account' as const),
              })),
          }))}
        />
      </CardContent>
    </Card>
  )
}

/**
 * « On me doit 342 € · je dois 114 € › » (#359): what is owed either way,
 * beside the net worth and never in it, opening « Entre proches »; hidden
 * when both are 0.
 */
function OwedRow() {
  const summary = useQuery(owedSummaryQuery)
  const owedToMe = summary.data?.owedToMe.totalCents ?? 0
  const iOwe = summary.data?.iOwe.totalCents ?? 0
  if (owedToMe === 0 && iOwe === 0) return null
  const parts = [
    owedToMe > 0 ? `On me doit ${formatWholeEuros(owedToMe)}` : null,
    iOwe > 0 ? `je dois ${formatWholeEuros(iOwe)}` : null,
  ].filter((part): part is string => part !== null)
  const title = parts.join(' · ')
  return (
    <ItemList>
      <ul>
        <ItemListRow
          asChild
          icon={<HandCoinsIcon />}
          iconClassName="bg-warning/15 text-warning-foreground dark:text-warning"
          // Both totals, whole: they wrap rather than being cut.
          title={
            <span className="block whitespace-normal">
              {title.charAt(0).toUpperCase() + title.slice(1)}
            </span>
          }
          subtitle="Hors patrimoine"
        >
          <Link
            to={ROUTES.owed}
            search={owedToMe === 0 ? { side: 'owe' } : {}}
          />
        </ItemListRow>
      </ul>
    </ItemList>
  )
}
