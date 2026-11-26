import { AnswerFigure, cn, formatWholeEuros, Skeleton } from '@capi/ui'
import { WalletIcon } from 'lucide-react'
import type { SpendingByCategoryDto, SpendingKind } from '#/api/types.gen'
import { Delta } from './Delta'
import { INCREASE_IS_GOOD, KIND_COLOR, KIND_LABEL, KINDS } from './kinds'
import { comparedName } from './labels'

/** The month's figures of each part, once loaded. */
export type MonthParts = Partial<Record<SpendingKind, SpendingByCategoryDto>>

/** Tab and panel ids, for `aria-controls` / `aria-labelledby`. */
export const tabId = (kind: SpendingKind) => `mouvements-tab-${kind}`
export const PANEL_ID = 'mouvements-panel'

/** A part's total with its one-offs, whatever the filter: the money that moved. */
function moved(data: SpendingByCategoryDto): number {
  return data.includeOneOffs
    ? data.totalCents
    : data.totalCents + data.oneOffCents
}

/**
 * What stayed on the accounts in scope: income − expenses − set aside,
 * one-offs included (it is the balance's change, as Épargne's « Compte
 * courant » line). Null until the three parts are loaded.
 */
export function keptCents(parts: MonthParts): number | null {
  const { income, expense, savings } = parts
  if (!income || !expense || !savings) return null
  return moved(income) - moved(expense) - savings.totalCents
}

function Tile({
  kind,
  data,
  selected,
  onSelect,
}: {
  kind: SpendingKind
  data: SpendingByCategoryDto | undefined
  selected: boolean
  onSelect: () => void
}) {
  const delta = data ? data.totalCents - data.previousTotalCents : 0
  return (
    <button
      type="button"
      role="tab"
      id={tabId(kind)}
      aria-selected={selected}
      aria-controls={PANEL_ID}
      // Roving focus: the arrows move between the tiles (`onKeyDown` below).
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      data-slot="month-flow-tile"
      // The part's colour as a strip along the top: the label keeps the
      // tile's whole width at 320px.
      style={{ boxShadow: `inset 0 3px 0 ${KIND_COLOR[kind]}` }}
      className={cn(
        '@container min-w-0 rounded-xl border px-2 pt-2.5 pb-2 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:px-3 md:pt-3.5 md:pb-3',
        selected
          ? 'border-primary bg-primary/5 ring-primary ring-1'
          : 'bg-card hover:bg-muted/60',
      )}
    >
      <span className="text-muted-foreground block truncate text-[clamp(0.5rem,13cqi,0.875rem)]">
        {KIND_LABEL[kind]}
      </span>
      {data ? (
        <>
          {/* Sized on the tile (container units): never broken. */}
          <span className="mt-1 block text-[clamp(0.75rem,18cqi,1.5rem)] leading-tight font-semibold whitespace-nowrap tabular-nums">
            {formatWholeEuros(data.totalCents)}
          </span>
          <span className="mt-0.5 block text-[clamp(0.5rem,12cqi,0.875rem)]">
            {data.period.status === 'empty' ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <Delta
                cents={delta}
                increaseIsGood={INCREASE_IS_GOOD[kind]}
                whole
                iconClassName="size-[1em]"
                className="gap-[0.2em]"
              />
            )}
            <span className="sr-only">
              {' '}
              par rapport {data.period.status === 'partial' ? 'au' : 'à'}{' '}
              {comparedName(data)}
            </span>
          </span>
        </>
      ) : (
        <Skeleton className="mt-1 h-9 w-full" />
      )}
    </button>
  )
}

/**
 * The page's answer (#434, the owner's « A. Le chiffre réponse »): what
 * stayed on the accounts (or was taken from them) as the big figure, and
 * where the income went under it (#410): income on one bar, expenses then
 * set aside on the one under it. The tiles below give the amounts, in the
 * bars' colours.
 */
function KeptAnswer({ parts }: { parts: MonthParts }) {
  const kept = keptCents(parts)
  if (kept === null || !parts.income || !parts.expense || !parts.savings) {
    return <Skeleton className="h-36 w-full rounded-xl" />
  }
  const { income, expense, savings } = parts
  if (expense.period.status === 'empty') return null
  const inCents = Math.max(0, moved(income))
  const outParts = [
    { kind: 'expense' as const, cents: Math.max(0, moved(expense)) },
    { kind: 'savings' as const, cents: Math.max(0, savings.totalCents) },
  ]
  const scale = Math.max(1, inCents, outParts[0].cents + outParts[1].cents)
  const partial = expense.period.status === 'partial'
  return (
    <AnswerFigure
      data-slot="month-flow-answer"
      icon={<WalletIcon />}
      label={
        kept >= 0
          ? partial
            ? 'Gardé à ce jour'
            : 'Gardé ce mois'
          : `Pris sur le compte courant${partial ? ' à ce jour' : ''}`
      }
      tone={kept >= 0 ? 'good' : 'bad'}
      value={
        <span data-slot="month-flow-kept">
          {kept > 0 ? '+' : kept < 0 ? '−' : ''}
          {formatWholeEuros(Math.abs(kept))}
        </span>
      }
    >
      <div
        role="img"
        aria-label={`Reçu ${formatWholeEuros(inCents)} ; dépensé ${formatWholeEuros(outParts[0].cents)}, mis de côté ${formatWholeEuros(outParts[1].cents)}`}
        className="space-y-1"
        data-slot="month-flow-bar"
      >
        <div className="bg-muted h-2 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full"
            style={{
              width: `${(inCents / scale) * 100}%`,
              background: KIND_COLOR.income,
            }}
          />
        </div>
        <div className="bg-muted flex h-2 gap-0.5 overflow-hidden rounded-full">
          {outParts
            .filter((part) => part.cents > 0)
            .map((part) => (
              <div
                key={part.kind}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${(part.cents / scale) * 100}%`,
                  background: KIND_COLOR[part.kind],
                }}
              />
            ))}
        </div>
      </div>
      {income.expectedCents > 0 && (
        <p className="text-muted-foreground text-xs">
          {formatWholeEuros(income.expectedCents)} de revenus attendus d’ici la
          fin du mois.
        </p>
      )}
    </AnswerFigure>
  )
}

/**
 * The month at the top of Mouvements: what was kept, the page's answer
 * (#434), then Revenus, Dépenses and Épargne as three tiles (their total
 * and change) that are also the page's tabs.
 */
export function MonthFlow({
  parts,
  selected,
  onSelect,
}: {
  parts: MonthParts
  selected: SpendingKind
  onSelect: (kind: SpendingKind) => void
}) {
  const move = (from: SpendingKind, step: number) => {
    const index = (KINDS.indexOf(from) + step + KINDS.length) % KINDS.length
    const next = KINDS[index]
    onSelect(next)
    document.getElementById(tabId(next))?.focus()
  }
  return (
    <div className="space-y-3" data-slot="month-flow">
      <KeptAnswer parts={parts} />
      <div
        role="tablist"
        aria-label="Mouvements du mois"
        className="grid grid-cols-3 gap-1.5 md:gap-2"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') move(selected, 1)
          else if (event.key === 'ArrowLeft') move(selected, -1)
          else return
          event.preventDefault()
        }}
      >
        {KINDS.map((kind) => (
          <Tile
            key={kind}
            kind={kind}
            data={parts[kind]}
            selected={kind === selected}
            onSelect={() => onSelect(kind)}
          />
        ))}
      </div>
    </div>
  )
}
