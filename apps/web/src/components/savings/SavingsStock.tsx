import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  formatSignedPercent,
} from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AccountType, SavingsStockDto } from '#/api/types.gen'
import { ACCOUNT_TYPE_LABELS } from '#/components/dashboard/labels'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'

interface StockRow {
  id: string
  name: string
  type: AccountType
  institution: string | null
  valueCents: number | null
  valueDate: string | null
  gainCents?: number | null
  returnRate?: number | null
  stale?: boolean
}

const ROW_CLASS = cn(
  'flex items-center gap-3 py-2.5 text-sm',
  'hover:bg-muted/50 focus-visible:ring-ring -mx-2 rounded-md px-2 outline-none focus-visible:ring-2',
)

function signed(cents: number) {
  return `${cents > 0 ? '+' : ''}${formatCents(cents)}`
}

function Row({ row }: { row: StockRow }) {
  const kind = [ACCOUNT_TYPE_LABELS[row.type], row.institution]
    .filter(Boolean)
    .join(' · ')
  const detail =
    row.gainCents != null
      ? `${signed(row.gainCents)}${row.returnRate != null ? ` (${formatSignedPercent(row.returnRate)})` : ''}`
      : row.valueDate === null
        ? 'Valeur inconnue'
        : `au ${formatCalendarDate(row.valueDate)}`
  return (
    <li>
      <Link
        to={ROUTES.account}
        params={{ accountId: row.id }}
        title="Voir le détail du compte"
        className={ROW_CLASS}
      >
        {/* The amounts go under the name when both don't fit side by side. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="min-w-[7rem] flex-1">
            <p className="font-medium break-words">{row.name}</p>
            <p className="text-muted-foreground truncate text-xs">
              {kind}
              {row.stale && ' · à mettre à jour'}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="font-medium whitespace-nowrap tabular-nums">
              {row.valueCents === null ? '—' : formatCents(row.valueCents)}
            </p>
            <p className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
              {detail}
            </p>
          </div>
        </div>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </Link>
    </li>
  )
}

function Group({
  id,
  title,
  total,
  children,
}: {
  id: string
  title: string
  total: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b pb-1.5">
        <h3
          id={id}
          className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
        >
          {title}
        </h3>
        <p className="shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums">
          {total}
        </p>
      </div>
      <ul className="divide-y">{children}</ul>
    </section>
  )
}

/**
 * What has been put aside: savings accounts (balance) and investment
 * accounts (value, gain over contributions), each opening its account page.
 */
export function SavingsStock({ stock }: { stock: SavingsStockDto }) {
  const { cash, investments } = stock
  if (cash.accounts.length === 0 && investments.accounts.length === 0) {
    return null
  }
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Épargne et placements</CardTitle>
        <CardDescription>
          {formatCents(stock.totalCents)} au total
          {stock.gainCents !== null &&
            `, dont ${signed(stock.gainCents)} de plus-value latente`}
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {cash.accounts.length > 0 && (
          <Group
            id="savings-stock-cash"
            title="Épargne disponible"
            total={formatCents(cash.totalCents)}
          >
            {cash.accounts.map((account) => (
              <Row
                key={account.id}
                row={{
                  ...account,
                  valueCents: account.balanceCents,
                  valueDate: account.balanceDate,
                }}
              />
            ))}
          </Group>
        )}
        {investments.accounts.length > 0 && (
          <Group
            id="savings-stock-investments"
            title="Placements"
            total={formatCents(investments.totals.valueCents)}
          >
            {investments.accounts.map((account) => (
              <Row key={account.id} row={account} />
            ))}
          </Group>
        )}
      </CardContent>
    </Card>
  )
}
