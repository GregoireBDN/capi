import { Button, cn } from '@capi/ui'
import { Link } from '@tanstack/react-router'
import type {
  IntegrityCheck,
  IntegrityDto,
  IntegrityFindingDto,
} from '#/api/types.gen'
import { accountLinkSearch } from '#/components/accounts/account-origin'
import { formatQuantity } from '#/components/crypto/format'
import { formatCents } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { ROUTES } from '#/lib/routes'

/** The integrity query as the step needs it (#427). */
export interface IntegrityState {
  data: IntegrityDto | undefined
  isPending: boolean
  isError: boolean
  refetch: () => void
}

export const INTEGRITY_TITLE = 'Cohérence des chiffres'

const CHECK_NAMES: Record<IntegrityCheck, string> = {
  balances: 'soldes',
  crypto: 'crypto',
  owed: 'dépenses partagées',
  totals: 'totaux du mois',
}

/** Done once loaded with every check run and nothing found. */
export function integrityDone(data: IntegrityDto): boolean {
  return data.checks.every((check) => check.status === 'ok')
}

const quantity = (value: string | null) =>
  value === null ? '?' : formatQuantity(value)

/** French wording of a finding. */
export function findingText(finding: IntegrityFindingDto): string {
  switch (finding.code) {
    case 'balance_gap':
      return finding.fromDate === null
        ? 'Le solde recalculé ne suit pas celui de la banque'
        : `Le solde recalculé ne suit plus celui de la banque depuis le ${formatShortDay(finding.fromDate)}`
    case 'statement_gap':
      return 'Le solde du relevé diffère du solde recalculé'
    case 'manual_not_reconciled':
      return 'Saisie jamais rapprochée d’une opération de la banque'
    case 'holding_differs_from_read':
      return `${finding.asset ?? ''} : ${quantity(finding.quantity)} détenus, ${quantity(finding.readQuantity)} à la dernière lecture complète`
    case 'owed_negative':
      return 'Remboursé au-delà de la part'
    case 'repayment_over_transfer':
      return 'Remboursements liés au-delà du virement'
    case 'flow_mismatch':
      return 'Revenus − dépenses ne donnent pas l’épargne affichée'
    case 'internal_move_counted':
      return `Virement entre vos comptes compté comme ${(finding.amountCents ?? 0) < 0 ? 'dépense' : 'revenu'}`
  }
}

/**
 * « Cohérence des chiffres » (#427): what the stored data says against
 * itself, each finding with its account and day. Read only: a finding is
 * fixed where it belongs, never here, and it never blocks the close.
 */
export function IntegrityStep({ integrity }: { integrity: IntegrityState }) {
  if (integrity.isPending) {
    return <p className="text-muted-foreground">Vérification en cours…</p>
  }
  if (integrity.isError || !integrity.data) {
    return (
      <>
        <p className="text-muted-foreground">
          La vérification n’a pas pu se faire.
        </p>
        <Button size="sm" outline onClick={() => integrity.refetch()}>
          Réessayer
        </Button>
      </>
    )
  }
  const { checks, findings } = integrity.data
  const failed = checks.filter((check) => check.status === 'failed')
  return (
    <>
      {findings.length === 0 ? (
        <p className="text-muted-foreground">
          Soldes, crypto, dépenses partagées et totaux du mois concordent.
        </p>
      ) : (
        <ul className="space-y-1" aria-label="Incohérences">
          {findings.map((finding, index) => (
            <FindingRow key={index} finding={finding} />
          ))}
        </ul>
      )}
      {failed.length > 0 && (
        <p className="text-warning-foreground dark:text-warning">
          Non vérifié :{' '}
          {failed.map((check) => CHECK_NAMES[check.key]).join(', ')}.
        </p>
      )}
      {findings.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Rien n’est corrigé automatiquement : vérifiez chaque point là où il se
          trouve.
        </p>
      )}
    </>
  )
}

function FindingRow({ finding }: { finding: IntegrityFindingDto }) {
  const amount =
    finding.amountCents === null ? null : formatCents(finding.amountCents)
  return (
    <li
      className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5"
      data-code={finding.code}
    >
      <span className="min-w-[7rem] flex-1">
        {finding.accountId !== null && finding.accountName !== null ? (
          <Link
            to={ROUTES.account}
            params={{ accountId: finding.accountId }}
            search={accountLinkSearch('month-review')}
            className="font-medium break-words hover:underline"
          >
            {finding.accountName}
          </Link>
        ) : (
          <span className="font-medium">
            {finding.check === 'totals' ? 'Totaux du mois' : 'Sans compte'}
          </span>
        )}
        {finding.date !== null && (
          <>
            {' '}
            <span className="text-muted-foreground whitespace-nowrap">
              · {formatShortDay(finding.date)}
            </span>
          </>
        )}
        <span className="text-muted-foreground block text-xs">
          {findingText(finding)}
        </span>
      </span>
      {amount !== null && (
        <span
          className={cn(
            'ml-auto font-medium whitespace-nowrap tabular-nums',
            finding.check === 'owed' && 'text-chart-delta-bad',
          )}
        >
          {amount}
        </span>
      )}
    </li>
  )
}
