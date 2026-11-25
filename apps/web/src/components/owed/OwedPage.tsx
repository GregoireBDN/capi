import {
  Card,
  CardContent,
  EmptyState,
  ItemList,
  ItemListGroup,
  ItemListRow,
  SegmentedControl,
  SegmentedControlItem,
  Skeleton,
  cn,
} from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ReceiptTextIcon, UsersRoundIcon } from 'lucide-react'
import { useState } from 'react'
import type {
  ExpectedRepaymentDto,
  OwedContactRowDto,
  OwedListDto,
} from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { DashboardCardHeader } from '#/components/dashboard/DashboardCardHeader'
import { FigureTile } from '#/components/dashboard/FigureTile'
import { formatMonth } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import { ROUTES } from '#/lib/routes'
import { ContactAvatar } from './ContactAvatar'
import { ageText, OLD_AFTER_DAYS } from './format'
import type { OwedSide } from './format'
import { PaidForMeSheet } from './PaidForMeSheet'
import { owedErrorMessage, owedSummaryQuery } from './queries'

/**
 * « Dépenses partagées » (#359): what people owe the owner and what he owes
 * them, two lists never netted (owner's « B. Deux listes »), each per
 * person (« A. Par personne »: owed now and the oldest open item's age, in
 * the warning colour after 30 days), the people all settled below, then
 * this month's repayments expected from shared recurring items. Outside
 * the net worth.
 */
export function OwedPage({
  side,
  onSideChange,
}: {
  side: OwedSide
  onSideChange: (side: OwedSide) => void
}) {
  const summary = useQuery(owedSummaryQuery)
  const [adding, setAdding] = useState(false)
  const list: OwedListDto | undefined =
    side === 'owed' ? summary.data?.owedToMe : summary.data?.iOwe

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Dépenses partagées"
        description="Ce qu’on vous doit et ce que vous devez, hors patrimoine."
        actions={[
          {
            label: 'Quelqu’un a payé pour moi',
            icon: <ReceiptTextIcon />,
            onSelect: () => setAdding(true),
            primary: true,
          },
        ]}
      />
      <SegmentedControl
        fullWidth
        aria-label="Sens"
        value={side}
        onValueChange={onSideChange}
      >
        <SegmentedControlItem value="owed">On me doit</SegmentedControlItem>
        <SegmentedControlItem value="owe">Je dois</SegmentedControlItem>
      </SegmentedControl>

      {summary.isPending ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : summary.isError ? (
        <p className="text-destructive text-sm">
          {owedErrorMessage(summary.error)}
        </p>
      ) : list && list.contacts.length + list.settled.length > 0 ? (
        <Card size="sm">
          <CardContent className="@container space-y-3">
            <FigureTile
              label={side === 'owed' ? 'On me doit' : 'Je dois'}
              value={formatCents(list.totalCents)}
              tone={
                side === 'owed' && list.totalCents > 0 ? 'warning' : undefined
              }
              notes={[
                `${plural(list.contacts.length, 'personne')} · hors patrimoine`,
              ]}
              notesOnPhone
            />
            <ItemList>
              {list.contacts.length > 0 && (
                <ItemListGroup title="Par personne">
                  {list.contacts.map((row) => (
                    <PersonRow key={row.contactId} row={row} side={side} />
                  ))}
                </ItemListGroup>
              )}
              {list.settled.length > 0 && (
                <ItemListGroup title="Tout réglé">
                  {list.settled.map((row) => (
                    <PersonRow key={row.contactId} row={row} side={side} />
                  ))}
                </ItemListGroup>
              )}
            </ItemList>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={<UsersRoundIcon />}
          title={
            side === 'owed'
              ? 'Personne ne vous doit rien'
              : 'Vous ne devez rien à personne'
          }
          description={
            side === 'owed'
              ? 'Ouvrez une dépense avancée pour quelqu’un (restaurant, loyer…) et touchez « J’ai payé pour quelqu’un ».'
              : 'Quand quelqu’un paie pour vous, notez votre part avec « Quelqu’un a payé pour moi ».'
          }
          actions={
            side === 'owe' ? (
              <button
                type="button"
                className="text-primary min-h-11 text-sm font-medium"
                onClick={() => setAdding(true)}
              >
                Quelqu’un a payé pour moi
              </button>
            ) : undefined
          }
        />
      )}

      {side === 'owed' && summary.data && summary.data.expected.length > 0 && (
        <ExpectedCard
          month={summary.data.month}
          expected={summary.data.expected}
        />
      )}

      <PaidForMeSheet open={adding} onOpenChange={setAdding} />
    </div>
  )
}

function PersonRow({ row, side }: { row: OwedContactRowDto; side: OwedSide }) {
  const old = (row.oldestOpenDays ?? 0) > OLD_AFTER_DAYS
  const age = ageText(row.oldestOpenDays)
  const settled = row.owedCents === 0
  return (
    <ItemListRow
      asChild
      compactWhenNarrow
      icon={<ContactAvatar name={row.name} />}
      iconClassName="bg-transparent"
      title={row.name}
      subtitle={
        settled
          ? 'Tout réglé'
          : `${plural(row.openCount, 'dépense')}${age ? ` · ${age}` : ''}`
      }
      value={
        settled ? (
          <span className="text-muted-foreground">{formatCents(0)}</span>
        ) : (
          formatCents(row.owedCents)
        )
      }
      compactDetail={
        age && (
          <span
            className={cn(
              old
                ? 'text-warning-foreground dark:text-warning'
                : 'text-muted-foreground',
            )}
          >
            {age}
          </span>
        )
      }
    >
      <Link
        to={ROUTES.owedContact}
        params={{ contactId: row.contactId }}
        search={side === 'owe' ? { side } : {}}
      />
    </ItemListRow>
  )
}

/** This month's repayments expected from shared recurring items. */
export function ExpectedCard({
  month,
  expected,
}: {
  month: string
  expected: ExpectedRepaymentDto[]
}) {
  const total = expected.reduce((sum, item) => sum + item.expectedCents, 0)
  const received = expected.reduce((sum, item) => sum + item.receivedCents, 0)
  const byContact = new Map<string, ExpectedRepaymentDto[]>()
  for (const item of expected) {
    byContact.set(item.contactName, [
      ...(byContact.get(item.contactName) ?? []),
      item,
    ])
  }
  return (
    <Card size="sm">
      <DashboardCardHeader
        title={`Attendu en ${formatMonth(month).split(' ')[0].toLowerCase()}`}
        status="Des dépenses partagées chaque mois"
      />
      <CardContent className="space-y-3">
        {[...byContact].map(([name, items]) => (
          <div key={name} className="flex items-center gap-3 text-sm">
            <ContactAvatar name={name} size="sm" />
            <span className="min-w-0 flex-1 break-normal">
              {name} :{' '}
              {items
                .map(
                  (item) => `${item.name} ${formatCents(item.expectedCents)}`,
                )
                .join(', ')}
            </span>
            <span className="font-medium whitespace-nowrap tabular-nums">
              {formatCents(items.reduce((s, i) => s + i.expectedCents, 0))}
            </span>
          </div>
        ))}
        <div className="space-y-1">
          <div
            className="bg-muted h-2 overflow-hidden rounded-full"
            role="img"
            aria-label={`${formatCents(received)} reçus sur ${formatCents(total)}`}
          >
            <div
              className="bg-chart-delta-good h-full rounded-full"
              style={{
                width: `${total > 0 ? Math.min(100, (received / total) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatCents(received)} reçus sur {formatCents(total)} attendus
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
