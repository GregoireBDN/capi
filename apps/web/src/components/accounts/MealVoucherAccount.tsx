import { useRegisterPageAction } from '#/components/app-shell/page-actions'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  StatCard,
} from '@capi/ui'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeftRightIcon,
  MinusIcon,
  PencilLineIcon,
  PlusIcon,
  ReceiptIcon,
  UtensilsIcon,
  WalletCardsIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { AccountDto, TransactionDto } from '#/api/types.gen'
import { CategoryAvatar } from '#/components/categories/category-icons'
import { ManualTransactionSheet } from '#/components/expenses/ManualTransactionSheet'
import { Amount } from '#/components/transactions/Amount'
import { displayLabel } from '#/components/transactions/labels'
import { transactionListQuery } from '#/components/transactions/queries'
import { ALL_MONTHS } from '#/components/transactions/search'
import { formatCalendarDate } from '#/lib/money'
import { categoriesQuery } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'

/** Income category of the card's monthly credit (seeded, #298). */
const CREDIT_CATEGORY_SLUG = 'meal_vouchers'
/** Rows of « Dernières opérations ». */
const LATEST_COUNT = 5

type Entry = { open: false } | { open: true; kind: 'expense' | 'income' }

/**
 * A meal-voucher card (« Titres-restaurant », #298): everything on it is
 * entered by hand, so the page leads with its two entries (a payment, the
 * monthly credit), then its balance, from those transactions, and the
 * latest of them.
 */
export function MealVoucherAccount({
  account,
  writable,
  onCorrectBalance,
}: {
  account: AccountDto
  writable: boolean
  /** Opens the balance editor (a balance at a date, e.g. the card's app). */
  onCorrectBalance: () => void
}) {
  const [entry, setEntry] = useState<Entry>({ open: false })
  const categories = useQuery(categoriesQuery)
  const creditCategory = categories.data?.find(
    (category) =>
      category.slug === CREDIT_CATEGORY_SLUG &&
      category.kind === 'income' &&
      !category.archivedAt,
  )
  const latest = useInfiniteQuery(
    transactionListQuery({ accountId: account.id }, 'date_desc'),
  )
  const rows = latest.data?.pages[0]?.items.slice(0, LATEST_COUNT) ?? []
  // In the page's « ⋮ » inside the shell (#386), the payment first.
  const paymentInMenu = useRegisterPageAction(
    writable
      ? {
          label: 'Ajouter un paiement',
          icon: <UtensilsIcon />,
          primary: true,
          onSelect: () => setEntry({ open: true, kind: 'expense' }),
        }
      : null,
  )
  useRegisterPageAction(
    writable
      ? {
          label: 'Ajouter un crédit',
          icon: <WalletCardsIcon />,
          onSelect: () => setEntry({ open: true, kind: 'income' }),
        }
      : null,
  )

  return (
    <>
      {writable && !paymentInMenu && (
        <div className="grid gap-2 @lg:grid-cols-2">
          <Button
            iconStart={<MinusIcon />}
            onClick={() => setEntry({ open: true, kind: 'expense' })}
          >
            Ajouter un paiement
          </Button>
          <Button
            outline
            variant="secondary"
            iconStart={<PlusIcon />}
            onClick={() => setEntry({ open: true, kind: 'income' })}
          >
            Ajouter un crédit
          </Button>
        </div>
      )}

      <section aria-label="Solde" className="space-y-2">
        <StatCard
          label="Solde"
          value={account.balanceCents ?? 0}
          valueFormatter={account.balanceCents === null ? () => '—' : undefined}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-muted-foreground text-xs">
            {account.balanceDate === null
              ? 'Aucune opération pour l’instant.'
              : `Au ${formatCalendarDate(account.balanceDate)}, d’après les crédits et paiements saisis.`}
          </p>
          {writable && (
            <Button
              size="sm"
              ghost
              variant="secondary"
              iconStart={<PencilLineIcon />}
              onClick={onCorrectBalance}
            >
              Corriger le solde
            </Button>
          )}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Dernières opérations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {latest.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              variant="inline"
              icon={<ReceiptIcon />}
              title="Aucune opération"
              description="Ajoutez le crédit du mois, puis vos paiements avec la carte."
            />
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <LatestRow key={row.id} row={row} />
              ))}
            </ul>
          )}
          {rows.length > 0 && (
            <Button
              asChild
              outline
              variant="secondary"
              className="w-full"
              iconStart={<ArrowLeftRightIcon />}
            >
              <Link
                to={ROUTES.transactions}
                search={{ account: account.id, month: ALL_MONTHS }}
              >
                Voir toutes les opérations
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <ManualTransactionSheet
        open={entry.open}
        onOpenChange={(open) => !open && setEntry({ open: false })}
        initialKind={entry.open ? entry.kind : 'expense'}
        initialAccountId={account.id}
        initialCategoryId={
          entry.open && entry.kind === 'income' ? creditCategory?.id : undefined
        }
      />
    </>
  )
}

function LatestRow({ row }: { row: TransactionDto }) {
  return (
    <li className="flex min-h-11 items-center gap-3 py-2 text-sm">
      <CategoryAvatar category={row.category} />
      <span className="block min-w-0 flex-1">
        <span className="block truncate font-medium">{displayLabel(row)}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {[formatCalendarDate(row.bookingDate), row.category?.name]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <Amount cents={row.amountCents} transfer={row.kind === 'transfer'} />
    </li>
  )
}
