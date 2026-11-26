import { Card, cn } from '@capi/ui'
import { Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileUpIcon,
  HandshakeIcon,
  InboxIcon,
  LineChartIcon,
  NotebookPenIcon,
  RefreshCwIcon,
  RepeatIcon,
  TargetIcon,
} from 'lucide-react'
import { cloneElement, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
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
        icon: <FileUpIcon />,
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
        icon: <NotebookPenIcon />,
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
        icon: <HandshakeIcon />,
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

/** Tasks shown before « n autres »: the next one large, two rows under it. */
export const TODOS_SHOWN = 3

/** The large task's tint and badge, after its tone. */
const HERO = {
  warning: {
    tint: 'from-warning/25 to-warning/5',
    badge: 'bg-warning text-warning-foreground',
  },
  primary: {
    tint: 'from-primary/15 to-primary/5',
    badge: 'bg-primary text-primary-foreground',
  },
  info: {
    tint: 'from-info/20 to-info/5',
    badge: 'bg-info text-white',
  },
} as const

/**
 * « À faire » (#405; #495, the owner's « B. La prochaine » with « B2.
 * Lignes »): the most pressing task large, a tap opening the page where it
 * is done; under it the next two as thin rows, then « n autres » unfolding
 * the rest. Hidden when all is done.
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
  const [first, ...rest] = todos.map((todo) => view(todo, today))
  // « 1 autre » would take as much room as the row itself.
  const capped = rest.length > TODOS_SHOWN && !expanded
  const rows = capped ? rest.slice(0, TODOS_SHOWN - 1) : rest
  const hidden = rest.length - rows.length
  const hero = HERO[first.tone]
  return (
    <Card
      role="region"
      aria-label="À faire"
      className="min-w-0 gap-0 overflow-hidden p-0"
    >
      {cloneElement(
        first.link as ReactElement<{
          children?: ReactNode
          className?: string
        }>,
        {
          className: cn(
            'focus-visible:ring-ring flex min-h-[4.4rem] items-center gap-3 bg-gradient-to-br px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset',
            hero.tint,
          ),
        },
        <>
          <span
            aria-hidden
            className={cn(
              'grid size-[44px] shrink-0 place-items-center rounded-2xl [&_svg]:size-[22px]',
              hero.badge,
            )}
          >
            {first.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{first.title}</span>
            {first.subtitle && (
              <span className="text-muted-foreground block text-xs">
                {first.subtitle}
              </span>
            )}
          </span>
          <span
            aria-hidden
            className="bg-foreground text-background grid size-[40px] shrink-0 place-items-center rounded-full [&_svg]:size-5"
          >
            <ArrowRightIcon />
          </span>
        </>,
      )}
      {rest.length > 0 && (
        <div className="px-2 pt-1 pb-1.5">
          <ul>
            {rows.map((row) => (
              <li key={row.key}>
                {cloneElement(
                  row.link as ReactElement<{
                    children?: ReactNode
                    className?: string
                  }>,
                  {
                    className:
                      'hover:bg-muted/60 focus-visible:ring-ring flex min-h-[44px] items-center gap-3 rounded-lg px-2 outline-none focus-visible:ring-2',
                  },
                  <>
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-[28px] shrink-0 place-items-center rounded-full [&_svg]:size-[15px]',
                        TONES[row.tone],
                      )}
                    >
                      {row.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {row.title}
                    </span>
                    <ChevronRightIcon
                      aria-hidden
                      className="text-muted-foreground size-4 shrink-0"
                    />
                  </>,
                )}
              </li>
            ))}
          </ul>
          {capped && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-[36px] w-full items-center justify-center gap-1 rounded-md text-xs font-medium outline-none focus-visible:ring-2"
            >
              {hidden} autres
              <ChevronDownIcon aria-hidden className="size-4" />
            </button>
          )}
        </div>
      )}
    </Card>
  )
}
