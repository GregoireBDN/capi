import {
  Button,
  Card,
  CardContent,
  cn,
  formatSignedPercent,
  formatWholeEuros,
} from '@finances/ui'
import { PencilIcon } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import type { AccountDto, AccountPerformanceDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { investedSourceText, takesInvestedBase } from './invested'

const signedWholeEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})
const formatSignedWholeEuros = (cents: number) =>
  signedWholeEuros.format(cents / 100)

/** « +2 000,00 € », « −150,00 € ». */
function signedCents(cents: number): string {
  return `${cents > 0 ? '+' : ''}${formatCents(cents)}`
}

function tone(cents: number) {
  return cn(
    cents > 0 && 'text-chart-delta-good',
    cents < 0 && 'text-chart-delta-bad',
  )
}

/** A figure with its rate under it: Résultat, Sur 1 an. */
function Tile({
  label,
  cents,
  rate,
  className,
}: {
  label: string
  cents: number
  rate: number | null
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-muted/50 @container min-w-0 rounded-lg px-3 py-2',
        className,
      )}
    >
      <p className="text-muted-foreground truncate text-xs">{label}</p>
      <p
        className={cn(
          'text-[clamp(0.8rem,14cqi,1.15rem)] font-semibold whitespace-nowrap tabular-nums',
          tone(cents),
        )}
      >
        {formatSignedWholeEuros(cents)}
      </p>
      {rate !== null && (
        <p
          className={cn('text-xs whitespace-nowrap tabular-nums', tone(cents))}
        >
          {formatSignedPercent(rate)}
        </p>
      )}
    </div>
  )
}

/**
 * « Investi 13 800 € », then the value as one bar: what was put in, and the
 * result (green) or what was lost (red) (#360, the owner's « Barre »).
 */
function InvestedBar({
  valueCents,
  investedCents,
}: {
  valueCents: number
  investedCents: number
}) {
  const gain = valueCents - investedCents
  const total = Math.max(valueCents, investedCents)
  const base = Math.min(valueCents, investedCents)
  const share = (cents: number) =>
    total > 0 ? `${(cents / total) * 100}%` : '0%'
  return (
    <div className="bg-muted/50 space-y-2 rounded-lg px-3 py-2.5">
      <p className="flex items-baseline gap-3">
        <span className="text-muted-foreground text-sm">Investi</span>
        <span className="ml-auto text-base font-semibold whitespace-nowrap tabular-nums">
          {formatWholeEuros(investedCents)}
        </span>
      </p>
      <div
        role="img"
        aria-label={
          gain >= 0
            ? `Valeur : ${formatCents(investedCents)} investis et ${formatCents(gain)} de résultat`
            : `Valeur : ${formatCents(investedCents)} investis, dont ${formatCents(-gain)} perdus`
        }
        className="bg-background flex h-2.5 overflow-hidden rounded-full"
      >
        <span
          className="bg-muted-foreground/40 h-full"
          style={{ width: share(base) }}
        />
        {gain !== 0 && (
          <span
            className={cn(
              'border-background h-full border-l-2',
              gain > 0 ? 'bg-chart-delta-good' : 'bg-chart-delta-bad/60',
            )}
            style={{ width: share(Math.abs(gain)) }}
          />
        )}
      </div>
    </div>
  )
}

/**
 * The summary of every investment account (#360): the value once, its date
 * and its change since the previous value; then « Investi » and the value
 * split into invested and result, the result and the change over one year
 * as two tiles, and one line saying where the invested amount comes from,
 * with « Modifier » where the owner types it. An unknown invested amount is
 * one line and « Renseigner le montant investi », never a « — ».
 */
export function InvestmentSummary({
  account,
  performance,
  writable,
  valueCents = performance.valueCents,
  label = 'Valeur',
  caption,
  status,
  onEditInvested,
}: {
  account: Pick<AccountDto, 'type' | 'cryptoSource' | 'archivedAt'>
  performance: AccountPerformanceDto
  writable: boolean
  /** The value shown (a wallet's live holdings), the latest one by default. */
  valueCents?: number | null
  /** What the value is (« Valeur du wallet »). */
  label?: string
  /** Under the value's label: its date and age. */
  caption?: ReactNode
  /** Under the change: how fresh the figures are (a wallet's chains). */
  status?: ReactNode
  /** Opens the invested amount's editor (accounts that take one). */
  onEditInvested?: () => void
}) {
  const id = useId()
  const {
    contributionsCents,
    gainCents,
    returnRate,
    sincePrevious,
    sinceOneYear,
    linkedAfterValueCents,
  } = performance
  const editable =
    writable && takesInvestedBase(account) && onEditInvested !== undefined
  const realised = performance.realised
  const crypto = account.type === 'crypto'
  const exchange = crypto && account.cryptoSource === 'exchange'
  const known = contributionsCents !== null && gainCents !== null
  const source = investedSourceText(account, performance)
  const year = (performance.valueDate ?? '').slice(0, 4)

  return (
    <Card role="region" aria-labelledby={id} className="min-w-0">
      <CardContent className="@container space-y-4 pt-5">
        <div className="space-y-1">
          <h2 id={id} className="text-muted-foreground text-sm">
            {label}
          </h2>
          <p className="text-[clamp(1.5rem,12cqi,2.25rem)] leading-tight font-semibold whitespace-nowrap tabular-nums">
            {valueCents === null ? '—' : formatCents(valueCents)}
          </p>
          {caption && (
            <p className="text-muted-foreground text-sm">{caption}</p>
          )}
          {sincePrevious && (
            <p className="text-sm tabular-nums">
              <span className={tone(sincePrevious.changeCents)}>
                {sincePrevious.changeCents > 0 ? '+' : ''}
                {formatCents(sincePrevious.changeCents)}
              </span>{' '}
              <span className="text-muted-foreground">
                depuis le {formatShortDay(sincePrevious.fromDate, year)}
              </span>
            </p>
          )}
          {status}
        </div>

        <div className="space-y-2">
          {known ? (
            <InvestedBar
              // Coins of unknown cost are out of the bar and the result (#373).
              valueCents={contributionsCents + gainCents}
              investedCents={contributionsCents}
            />
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                {crypto
                  ? exchange
                    ? 'Vos exports n’indiquent pas le prix d’achat de vos actifs : précisez d’où viennent vos cryptos pour voir le résultat.'
                    : 'Le prix de revient de vos cryptos n’est pas encore connu : précisez d’où elles viennent pour voir le résultat.'
                  : 'Montant investi pas encore renseigné : le gain ou la perte s’affichera dès qu’il le sera.'}
              </p>
              {editable && (
                <Button
                  className="w-full"
                  outline
                  variant="secondary"
                  iconStart={<PencilIcon />}
                  onClick={onEditInvested}
                >
                  Renseigner le montant investi
                </Button>
              )}
            </div>
          )}
          {(known || sinceOneYear) && (
            <div className="grid grid-cols-2 gap-2">
              {known && (
                <Tile
                  label="Résultat"
                  cents={gainCents}
                  rate={returnRate}
                  className={sinceOneYear ? undefined : 'col-span-2'}
                />
              )}
              {sinceOneYear && (
                <Tile
                  label="Sur 1 an"
                  cents={sinceOneYear.changeCents}
                  rate={sinceOneYear.changeRate}
                  className={known ? undefined : 'col-span-2'}
                />
              )}
            </div>
          )}
        </div>

        {/* Sales into euros (#373): realised, apart from the result. */}
        {realised && realised.count > 0 && (
          <div className="flex min-h-11 flex-wrap items-baseline gap-x-3 border-t pt-3 text-sm">
            <span className="text-muted-foreground min-w-[9rem] flex-1">
              Plus-value réalisée
            </span>
            <span className="ml-auto text-right tabular-nums">
              <span className={tone(realised.yearCents)}>
                {signedCents(realised.yearCents)}
              </span>{' '}
              <span className="text-muted-foreground text-xs">
                cette année · {signedCents(realised.totalCents)} en tout
                {realised.unknownCount > 0
                  ? ` · ${realised.unknownCount} vente${realised.unknownCount > 1 ? 's' : ''} au coût inconnu`
                  : ''}
              </span>
            </span>
          </div>
        )}

        {known && (source || editable) && (
          <div className="flex flex-wrap items-center gap-x-2">
            {source && (
              <p className="text-muted-foreground min-w-[9rem] flex-1 text-xs">
                {source}
              </p>
            )}
            {editable && (
              <Button
                size="sm"
                variant="secondary"
                ghost
                iconStart={<PencilIcon />}
                className="ml-auto shrink-0"
                aria-label="Modifier le montant investi"
                onClick={onEditInvested}
              >
                Modifier
              </Button>
            )}
          </div>
        )}
        {known && linkedAfterValueCents !== 0 && (
          <p className="text-muted-foreground -mt-2 text-xs">
            {formatCents(Math.abs(linkedAfterValueCents))}{' '}
            {linkedAfterValueCents > 0 ? 'versés' : 'retirés'} depuis la
            dernière valeur : ils compteront avec la prochaine.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
