import {
  formatSignedEuros,
  formatSignedPercent,
  formatWholeEuros,
  StatCard,
} from '@finances/ui'
import type { AccountPerformanceDto } from '#/api/types.gen'
import { formatCalendarDate, formatCents } from '#/lib/money'

const dash = () => '—'

const signedWholeEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})
/** Half-width tiles use whole euros so two fit side by side on a phone. */
const formatSignedWholeEuros = (cents: number) =>
  signedWholeEuros.format(cents / 100)

/**
 * Value (vs the previous snapshot), net contributions, gain in euros and as
 * a simple return, and the change over one year, with a note saying what the
 * figures rest on when it is not obvious.
 */
export function PerformanceTiles({
  performance,
  withValue = true,
  withContributions = true,
}: {
  performance: AccountPerformanceDto
  /** The value tile (off where the page states it already, #269). */
  withValue?: boolean
  /**
   * Contribution tiles (Versements, Plus-value, Rendement): off for an
   * account that never has any (a wallet), where they would only say « — ».
   */
  withContributions?: boolean
}) {
  const {
    valueCents,
    valueDate,
    contributionsCents,
    contributionsDate,
    gainCents,
    returnRate,
    sincePrevious,
    sinceOneYear,
    snapshots,
  } = performance
  if (valueCents === null) return null

  const yearMarketGain =
    sinceOneYear && sinceOneYear.contributionsChangeCents !== null
      ? sinceOneYear.changeCents - sinceOneYear.contributionsChangeCents
      : null

  // Nothing left to show but dashes.
  if (!withValue && !withContributions && sinceOneYear === null) return null

  return (
    <section aria-label="Chiffres clés" className="space-y-2">
      <div
        className={
          withContributions
            ? 'grid grid-cols-1 gap-2 @lg:grid-cols-2 @2xl:grid-cols-4'
            : 'grid grid-cols-1 gap-2 @lg:grid-cols-2'
        }
      >
        {withValue && (
          <StatCard
            className={
              withContributions
                ? '@lg:col-span-2 @2xl:col-span-4'
                : '@lg:col-span-2'
            }
            label="Valeur"
            value={valueCents}
            previousValue={sincePrevious?.fromValueCents}
            deltaDisplay="value"
            comparisonLabel={
              sincePrevious
                ? `depuis le ${formatCalendarDate(sincePrevious.fromDate)}`
                : undefined
            }
            trend={
              snapshots.length > 1
                ? snapshots.map((s) => s.valueCents)
                : undefined
            }
            trendLabel="Valeur à chaque relevé"
          />
        )}
        {withContributions && (
          <>
            <StatCard
              label="Versements"
              value={contributionsCents ?? 0}
              valueFormatter={
                contributionsCents === null ? dash : formatWholeEuros
              }
            />
            <StatCard
              label="Plus-value"
              value={gainCents ?? 0}
              valueFormatter={
                gainCents === null ? dash : formatSignedWholeEuros
              }
            />
            <StatCard
              label="Rendement"
              value={returnRate ?? 0}
              valueFormatter={returnRate === null ? dash : formatSignedPercent}
            />
          </>
        )}
        <StatCard
          label="Sur 1 an"
          value={sinceOneYear?.changeCents ?? 0}
          valueFormatter={sinceOneYear === null ? dash : formatSignedWholeEuros}
        />
      </div>
      <ul className="text-muted-foreground space-y-1 px-1 text-xs">
        {withContributions && contributionsCents === null && (
          <li>
            Versements inconnus : renseignez-les sur une valeur pour calculer la
            plus-value.
          </li>
        )}
        {contributionsDate !== null && contributionsDate !== valueDate && (
          <li>
            Versements connus au {formatCalendarDate(contributionsDate)} : la
            dernière valeur n’en indique pas.
          </li>
        )}
        {returnRate !== null && (
          <li>
            Rendement simple : plus-value rapportée aux versements nets, sans
            tenir compte de leurs dates.
          </li>
        )}
        {sinceOneYear && (
          <li>
            Sur 1 an : depuis le {formatCalendarDate(sinceOneYear.fromDate)}
            {sinceOneYear.changeRate !== null &&
              ` (${formatSignedPercent(sinceOneYear.changeRate)})`}
            {withContributions &&
              yearMarketGain !== null &&
              `, dont ${formatCents(sinceOneYear.contributionsChangeCents!)} de versements et ${formatSignedEuros(yearMarketGain)} de plus-value`}
            .
          </li>
        )}
      </ul>
    </section>
  )
}
