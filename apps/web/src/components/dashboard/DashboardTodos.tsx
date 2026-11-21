import { Card, ItemList, ItemListRow } from '@finances/ui'
import { Link } from '@tanstack/react-router'
import {
  ChevronDownIcon,
  HandCoinsIcon,
  InboxIcon,
  LineChartIcon,
  ListChecksIcon,
  RefreshCwIcon,
  RepeatIcon,
  TargetIcon,
  UploadIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { REVIEW_SEARCH } from '#/components/transactions/search'
import { formatWholeEuros } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { plural } from '#/lib/plural'
import { ROUTES } from '#/lib/routes'
import type { Todo } from './glance'

const monthName = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  timeZone: 'UTC',
})

/** `2026-10` → « octobre ». */
export function formatMonthName(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return monthName.format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

/** The icon badges' tones: what blocks the figures in amber, the rest calm. */
const TONES = {
  warning: 'bg-warning/20 text-warning-foreground dark:text-warning',
  primary: 'bg-primary/10 text-primary',
  info: 'bg-info/15 text-info-foreground dark:text-info',
} as const

interface TodoView {
  key: string
  icon: ReactNode
  tone: keyof typeof TONES
  title: string
  subtitle?: string
  link: ReactNode
}

function view(todo: Todo, today: string): TodoView {
  const year = today.slice(0, 4)
  switch (todo.kind) {
    case 'import':
      return {
        key: 'import',
        icon: <UploadIcon />,
        tone: 'warning',
        title: 'Importer un relevé',
        subtitle:
          todo.dataUntil === null
            ? 'Aucune donnée bancaire encore'
            : `Dernier relevé au ${formatShortDay(todo.dataUntil, year)}`,
        link: <Link to={ROUTES.import} />,
      }
    case 'close':
      return {
        key: 'close',
        icon: <ListChecksIcon />,
        tone: 'warning',
        title: `Clôturer ${formatMonthName(todo.month)}`,
        subtitle:
          todo.missing > 0
            ? `${plural(todo.missing, 'compte')} à mettre à jour avant`
            : 'Bilan et clôture du mois',
        link: <Link to={ROUTES.monthReview} search={{ month: todo.month }} />,
      }
    case 'budget':
      return {
        key: 'budget',
        icon: <TargetIcon />,
        tone: 'primary',
        title: `Préparer le budget de ${formatMonthName(todo.month)}`,
        link: <Link to={ROUTES.budget} />,
      }
    case 'review':
      return {
        key: 'review',
        icon: <InboxIcon />,
        tone: 'primary',
        title: `${plural(todo.count, 'opération')} à revoir`,
        subtitle: 'Catégorie à vérifier',
        link: <Link to={ROUTES.transactions} search={REVIEW_SEARCH} />,
      }
    case 'repayment':
      return {
        key: 'repayment',
        icon: <HandCoinsIcon />,
        tone: 'info',
        title:
          todo.count > 1
            ? `${plural(todo.count, 'remboursement')} à lier`
            : `${todo.contactName} t’a versé ${formatWholeEuros(todo.amountCents)}`,
        subtitle:
          todo.count > 1
            ? `Dont ${todo.contactName}, ${formatWholeEuros(todo.amountCents)}`
            : 'Un remboursement ? À lier',
        // « À revoir » opens on the repayment suggestions.
        link: <Link to={ROUTES.transactions} search={REVIEW_SEARCH} />,
      }
    case 'renewal':
      return {
        key: `renewal-${todo.id}`,
        icon: <RefreshCwIcon />,
        tone: 'info',
        title: todo.name,
        subtitle: `Se renouvelle le ${formatShortDay(todo.renewalDate, year)}`,
        link: <Link to={ROUTES.subscriptions} />,
      }
    case 'subscriptions':
      return {
        key: 'subscriptions',
        icon: <RepeatIcon />,
        tone: 'info',
        title:
          todo.count > 1
            ? `${todo.count} abonnements détectés`
            : 'Un abonnement détecté',
        subtitle: 'À confirmer ou écarter',
        link: <Link to={ROUTES.subscriptions} />,
      }
    case 'values':
      return {
        key: 'values',
        icon: <LineChartIcon />,
        tone: 'info',
        title:
          todo.count > 1
            ? `${todo.count} placements à mettre à jour`
            : 'Un placement à mettre à jour',
        subtitle: 'Valeur ancienne',
        link: <Link to={ROUTES.accounts} />,
      }
  }
}

/** Rows shown before « n autres », so the month's figures stay on screen. */
export const TODOS_SHOWN = 3

/**
 * « À faire » (#405): what is waiting for the owner, most pressing first,
 * one row each opening the page where it is done; past `TODOS_SHOWN`, the
 * rest behind « n autres à faire ». Hidden when all is done.
 */
export function DashboardTodos({
  todos,
  today,
}: {
  todos: Todo[]
  today: string
}) {
  const [expanded, setExpanded] = useState(false)
  if (todos.length === 0) return null
  // « 1 autre » would take as much room as the row itself.
  const capped = todos.length > TODOS_SHOWN + 1 && !expanded
  const shown = capped ? todos.slice(0, TODOS_SHOWN) : todos
  const hidden = todos.length - shown.length
  return (
    <Card
      role="region"
      aria-labelledby="dashboard-todos-title"
      className="ring-warning/60 min-w-0 gap-0 px-2 pt-1 pb-2"
    >
      <div className="flex min-h-8 items-center justify-between gap-2 px-2">
        <h2
          id="dashboard-todos-title"
          className="text-muted-foreground text-xs font-medium"
        >
          À faire
        </h2>
        {capped && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring relative flex min-h-8 items-center gap-1 rounded-md px-1 text-xs font-medium outline-none focus-visible:ring-2"
          >
            {hidden} autres
            <ChevronDownIcon aria-hidden className="size-4" />
          </button>
        )}
      </div>
      <ItemList>
        <ul>
          {shown.map((todo) => {
            const row = view(todo, today)
            return (
              <ItemListRow
                key={row.key}
                asChild
                className="min-h-8 py-1"
                icon={row.icon}
                iconClassName={TONES[row.tone]}
                title={row.title}
                subtitle={row.subtitle}
              >
                {row.link}
              </ItemListRow>
            )
          })}
        </ul>
      </ItemList>
    </Card>
  )
}
