import { z } from 'zod'
import type {
  IntegrityCheck,
  IntegrityDto,
  IntegrityFindingDto,
} from '../api/types.js'
import {
  addMonths,
  frenchDate,
  ofMonth,
  parisToday,
  signedEuros,
} from '../format.js'
import { MONTH_PATTERN } from './lookup.js'
import { defineTool } from './tool.js'

const CHECK_LABELS: Record<IntegrityCheck, string> = {
  balances: 'Soldes bancaires',
  crypto: 'Quantités crypto',
  owed: 'Dépenses partagées',
  totals: 'Totaux du mois',
}

/** One line per finding, in French, with its account and day. */
export function findingLine(f: IntegrityFindingDto): string {
  const where = [
    f.accountName ?? (f.check === 'totals' ? 'Totaux du mois' : 'sans compte'),
    f.date ? `le ${frenchDate(f.date)}` : null,
  ]
    .filter(Boolean)
    .join(', ')
  const amount =
    f.amountCents === null ? '' : ` (${signedEuros(f.amountCents)})`
  switch (f.code) {
    case 'balance_gap':
      return `${where} : le solde recalculé ne suit plus celui de la banque${f.fromDate ? ` depuis le ${frenchDate(f.fromDate)}` : ''}${amount}.`
    case 'statement_gap':
      return `${where} : le solde du relevé diffère du solde recalculé${amount}.`
    case 'manual_not_reconciled':
      return `${where} : saisie manuelle jamais rapprochée d'une opération de la banque${amount}.`
    case 'holding_differs_from_read':
      return `${where} : ${f.asset} ${f.quantity} détenus, ${f.readQuantity} à la dernière lecture complète.`
    case 'owed_negative':
      return `${where} : remboursé au-delà de la part${amount}.`
    case 'repayment_over_transfer':
      return `${where} : remboursements liés au-delà du virement${amount}.`
    case 'flow_mismatch':
      return `${where} : revenus − dépenses ne donnent pas l'épargne affichée${amount}.`
    case 'internal_move_counted':
      return `${where} : virement entre comptes du propriétaire compté comme ${(f.amountCents ?? 0) < 0 ? 'dépense' : 'revenu'}${amount}.`
  }
}

export const integrityChecksTool = defineTool({
  name: 'integrity_checks',
  title: 'Cohérence des chiffres',
  description:
    'Consistency checks computed from the stored data, the « Cohérence des chiffres » step of « Bilan du mois » (default: the previous calendar month): bank balances recomputed from the transactions vs the bank’s running balance and statements, hand-entered transactions never matched by an import, income − expenses vs saved, moves between own accounts counted as income or expense; and, as things stand now, crypto quantities vs the last complete chain read, money owed below zero, repayments past their transfer. Each finding names its account and day. Read only: nothing is fixed automatically.',
  inputSchema: {
    month: z
      .string()
      .regex(MONTH_PATTERN)
      .optional()
      .describe('Month YYYY-MM. Default: the previous calendar month.'),
  },
  async run({ api, now }, args) {
    const month = args.month ?? addMonths(parisToday(now()).slice(0, 7), -1)
    const data = await api.get<IntegrityDto>('/api/integrity', { month })
    const lines = [`Cohérence des chiffres ${ofMonth(data.month)} :`]
    for (const check of data.checks) {
      const mark =
        check.status === 'ok' ? '✓' : check.status === 'failed' ? '?' : '✗'
      const scope = check.scope === 'current' ? ' (état actuel)' : ''
      const status =
        check.status === 'failed'
          ? 'non vérifié'
          : check.count === 0
            ? 'rien à signaler'
            : `${check.count} point(s)`
      lines.push(`${mark} ${CHECK_LABELS[check.key]}${scope} : ${status}`)
      for (const f of data.findings.filter((f) => f.check === check.key)) {
        lines.push(`  - ${findingLine(f)}`)
      }
    }
    if (data.findings.length > 0) {
      lines.push(
        "Rien n'est corrigé automatiquement : chaque point se vérifie dans l'application.",
      )
    }
    return lines.join('\n')
  },
})
