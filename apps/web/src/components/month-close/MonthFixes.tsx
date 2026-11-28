import { Sheet, SheetContent, useIsMobile } from '@capi/ui'
import {
  CheckIcon,
  FileUpIcon,
  RepeatIcon,
  ScaleIcon,
  TagIcon,
  TrendingUpIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { MonthCloseDto, MonthCloseStep } from '#/api/types.gen'
import {
  EditorHeader,
  editorSide,
  SheetScroll,
} from '#/components/sheets/form-sheet'
import {
  ImportsStep,
  InvestmentsStep,
  RecurringStep,
  ReviewQueueStep,
} from './FixDetails'
import type { FixProps } from './FixDetails'
import { INTEGRITY_TITLE, IntegrityStep, integrityDone } from './IntegrityStep'
import type { IntegrityState } from './IntegrityStep'
import { ROUTES } from '#/lib/routes'

type FixKey = Exclude<MonthCloseStep, 'budget' | 'savings' | 'close'>

interface Fix {
  key: FixKey | 'integrity'
  icon: LucideIcon
  /** Under the icon, one or two words. */
  short: string
  /** The sheet's title. */
  title: string
  /** On the icon; none when there is nothing to count. */
  count: number | null
  /** Nothing to read first: the icon goes straight to where it is fixed. */
  link?: 'review' | 'subscriptions'
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

/**
 * The steps left (#541), in the order of the routine: none for a step done
 * (budget and savings are read on the answer, never ticked), « Cohérence
 * des chiffres » once its checks have answered with a finding or failed.
 */
export function fixesLeft(
  review: MonthCloseDto,
  integrity: IntegrityState,
): Fix[] {
  const done = new Set(
    review.steps.filter((step) => step.done).map((step) => step.key),
  )
  const fixes: Fix[] = []
  if (!done.has('imports')) {
    const missing = sum(review.imports.accounts.map((a) => a.missingDays))
    fixes.push({
      key: 'imports',
      icon: FileUpIcon,
      short: 'Relevés',
      title: 'Relevés importés',
      count: missing > 0 ? missing : review.imports.gaps.length || null,
    })
  }
  if (!done.has('review_queue')) {
    fixes.push({
      key: 'review_queue',
      icon: TagIcon,
      short: 'À revoir',
      title: 'Opérations à revoir',
      count: review.reviewQueue.count,
      link: 'review',
    })
  }
  if (!done.has('recurring')) {
    const { suggestedCount, priceChanges, chargedAfterEnd } = review.recurring
    const seen = review.acknowledged.includes('recurring')
    fixes.push({
      key: 'recurring',
      icon: RepeatIcon,
      short: 'Abonnements',
      title: 'Abonnements et prélèvements',
      count:
        suggestedCount +
        (seen ? 0 : priceChanges.length + chargedAfterEnd.length),
      link:
        priceChanges.length + chargedAfterEnd.length === 0
          ? 'subscriptions'
          : undefined,
    })
  }
  if (!done.has('investments')) {
    fixes.push({
      key: 'investments',
      icon: TrendingUpIcon,
      short: 'Placements',
      title: 'Valeur des placements',
      count: review.investments.accounts.length,
    })
  }
  if (integrity.isError || (integrity.data && !integrityDone(integrity.data))) {
    fixes.push({
      key: 'integrity',
      icon: ScaleIcon,
      short: 'Chiffres',
      title: INTEGRITY_TITLE,
      count: integrity.data ? integrity.data.findings.length || null : null,
    })
  }
  return fixes
}

/**
 * « À régler »: one round icon per step left, its count on it; a tap opens
 * the step in a sheet. « Tout est en ordre » once none is left.
 */
export function MonthFixes({
  fixes,
  integrity,
  ...props
}: FixProps & { fixes: Fix[]; integrity: IntegrityState }) {
  const [open, setOpen] = useState<Fix['key'] | null>(null)
  const isMobile = useIsMobile()
  const current = fixes.find((fix) => fix.key === open)

  if (fixes.length === 0) {
    return (
      <section className="glass-card rounded-card flex items-center gap-3 p-4">
        <span className="bg-chart-delta-good grid size-10 shrink-0 place-items-center rounded-full text-white">
          <CheckIcon aria-hidden className="size-[0.95rem]" strokeWidth={3} />
        </span>
        <p className="text-sm font-semibold">Tout est en ordre</p>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="month-fixes-title"
      className="glass-card rounded-card space-y-3 p-4"
    >
      <h2 id="month-fixes-title" className="text-sm font-semibold">
        À régler
      </h2>
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-3">
        {fixes.map((fix) => (
          <li key={fix.key} className="w-[4.6rem]">
            {fix.link ? (
              <FixButton fix={fix} month={props.review.month} />
            ) : (
              <FixButton fix={fix} onClick={() => setOpen(fix.key)} />
            )}
          </li>
        ))}
      </ul>

      <Sheet
        open={current !== undefined}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        <SheetContent side={editorSide(isMobile)} className="gap-0">
          {current && (
            <>
              <EditorHeader title={current.title} />
              <SheetScroll className="space-y-3 px-4 pt-2 pb-6 text-sm">
                <FixBody fix={current.key} integrity={integrity} {...props} />
              </SheetScroll>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  )
}

const FIX_BUTTON =
  'focus-visible:ring-ring/50 flex w-full flex-col items-center gap-1 rounded-xl py-1 outline-none focus-visible:ring-[3px]'

function FixButton({
  fix,
  onClick,
  month,
}: {
  fix: Fix
  onClick?: () => void
  month?: string
}) {
  const label = `${fix.title}${fix.count ? ` : ${fix.count}` : ''}`
  const content = <FixIcon fix={fix} />
  if (fix.link === 'review' && month) {
    return (
      <Link
        to={ROUTES.transactions}
        search={{ review: true, month }}
        data-fix={fix.key}
        aria-label={label}
        className={FIX_BUTTON}
      >
        {content}
      </Link>
    )
  }
  if (fix.link === 'subscriptions') {
    return (
      <Link
        to={ROUTES.subscriptions}
        data-fix={fix.key}
        aria-label={label}
        className={FIX_BUTTON}
      >
        {content}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      data-fix={fix.key}
      aria-label={label}
      className={FIX_BUTTON}
    >
      {content}
    </button>
  )
}

function FixIcon({ fix }: { fix: Fix }) {
  const Icon = fix.icon
  return (
    <>
      <span className="relative">
        <span className="grid size-[52px] place-items-center rounded-full bg-[oklch(0.66_0.18_50)] text-white shadow-[0_6px_14px_-8px_rgb(0_0_0/50%)]">
          <Icon aria-hidden className="size-[1rem]" />
        </span>
        {fix.count !== null && fix.count > 0 && (
          <span
            aria-hidden
            className="bg-foreground text-background absolute -top-1 -right-1 grid size-[24px] place-items-center rounded-full text-[12px] font-bold tabular-nums"
          >
            {fix.count > 99 ? '99+' : fix.count}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className="text-muted-foreground text-xs whitespace-nowrap"
      >
        {fix.short}
      </span>
    </>
  )
}

function FixBody({
  fix,
  integrity,
  ...props
}: FixProps & { fix: Fix['key']; integrity: IntegrityState }): ReactNode {
  switch (fix) {
    case 'imports':
      return <ImportsStep review={props.review} />
    case 'review_queue':
      return <ReviewQueueStep review={props.review} />
    case 'recurring':
      return <RecurringStep {...props} />
    case 'investments':
      return <InvestmentsStep review={props.review} />
    case 'integrity':
      return <IntegrityStep integrity={integrity} />
  }
}
