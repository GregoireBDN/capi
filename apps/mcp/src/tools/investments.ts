/**
 * Investment accounts (#104): what Claude needs before importing statement
 * values found in the owner's documents (Google Drive folder, read by Claude,
 * never by the app).
 */
import type {
  AccountDto,
  AccountType,
  InvestmentAccountSummaryDto,
  InvestmentsSummaryDto,
} from '../api/types.js'
import type { ApiClient } from '../api/client.js'
import { euros, frenchDate, percent, signedEuros } from '../format.js'
import { frenchQuantity } from '../quantity.js'
import { ACCOUNT_TYPE_LABELS } from './labels.js'
import { listAccounts, normalize, pickAccount } from './lookup.js'
import { defineTool, ToolInputError } from './tool.js'

/** Account types valued by dated snapshots rather than transactions. */
export const INVESTMENT_TYPES = [
  'brokerage',
  'life_insurance',
  'employee_savings',
  'crypto',
] as const satisfies readonly AccountType[]

export function isInvestment(account: Pick<AccountDto, 'type'>): boolean {
  return (INVESTMENT_TYPES as readonly AccountType[]).includes(account.type)
}

const CRYPTO_SOURCE_LABELS = {
  manual: 'saisie manuelle',
  exchange: 'plateforme',
  wallet: 'portefeuille synchronisé',
} as const

/**
 * The open investment account named `input`. An archived or non-investment
 * account stops the tool before anything is written.
 */
export async function resolveInvestmentAccount(
  api: ApiClient,
  input: string,
): Promise<AccountDto> {
  const accounts = (await listAccounts(api)).filter(isInvestment)
  if (accounts.length === 0) {
    throw new ToolInputError(
      "Aucun compte de placement : créez-le d'abord dans l'application (voir create_investment_account).",
    )
  }
  const account = pickAccount(accounts, input)
  if (account.archivedAt) {
    throw new ToolInputError(
      `Le compte ${account.name} est archivé : restaurez-le dans l'application pour le mettre à jour. Rien n'a été modifié.`,
    )
  }
  return account
}

function sourceLabel(account: AccountDto | undefined): string | null {
  if (!account || account.type !== 'crypto' || !account.cryptoSource) {
    return null
  }
  const label = CRYPTO_SOURCE_LABELS[account.cryptoSource]
  return account.cryptoProvider ? `${label} ${account.cryptoProvider}` : label
}

function accountLine(
  row: InvestmentAccountSummaryDto,
  account: AccountDto | undefined,
): string {
  const details = [
    ACCOUNT_TYPE_LABELS[row.type],
    row.institution,
    sourceLabel(account),
  ]
    .filter(Boolean)
    .join(', ')
  if (row.valueCents === null || row.valueDate === null) {
    return `- ${row.name} (${details}) : aucune valeur enregistrée — tous les relevés sont à importer`
  }
  const crypto = row.type === 'crypto'
  // Coins of unknown cost (#373): named, out of the investi and the result.
  const unknownCosts =
    row.unknownCost.length > 0
      ? `, hors ${row.unknownCost
          .map((coin) => `${frenchQuantity(coin.quantity)} ${coin.symbol}`)
          .join(', ')} sans coût connu (à préciser dans l'application)`
      : !crypto && row.unknownCostCount > 0
        ? `, dont ${row.unknownCostCount} virement(s) de montant inconnu`
        : ''
  const realised =
    row.realised && row.realised.count > 0
      ? `, plus-value réalisée ${signedEuros(row.realised.yearCents)} cette année (${signedEuros(row.realised.totalCents)} en tout${
          row.realised.unknownCount > 0
            ? `, ${row.realised.unknownCount} vente(s) au coût inconnu`
            : ''
        })`
      : ''
  const gain =
    row.gainCents === null
      ? ''
      : `, résultat ${signedEuros(row.gainCents)}${
          row.returnRate === null ? '' : ` (${percent(row.returnRate)})`
        }`
  const contributions =
    row.contributionsCents === null
      ? crypto
        ? `, montant investi inconnu${unknownCosts}`
        : ', montant investi inconnu (set_invested_amount)'
      : `, investi ${euros(row.contributionsCents)}${gain}${unknownCosts}`
  const age =
    row.daysSinceLatest === null ? '' : ` (il y a ${row.daysSinceLatest} j)`
  const stale = row.stale
    ? ` — PAS À JOUR (relevé attendu tous les ${row.staleAfterDays} j)`
    : ''
  return `- ${row.name} (${details}) : dernière valeur ${euros(row.valueCents)} au ${frenchDate(row.valueDate)}${age}${contributions}${realised}${stale}`
}

export const listInvestmentAccountsTool = defineTool({
  name: 'list_investment_accounts',
  title: 'Comptes de placement',
  description:
    "Open investment accounts (PEA / brokerage, life insurance, employee savings, crypto) with their institution, crypto source, last value and its date, what was invested with the latent result and rate (crypto: the cost of the coins held, carried across transfers between the owner's accounts; coins of unknown cost named apart; the realised gain of sales), and whether they are stale. Call it before importing statement values: only documents dated after the last snapshot need importing, and it gives the account names add_investment_snapshots and sync_crypto_holdings accept.",
  inputSchema: {},
  async run({ api }) {
    const [summary, accounts] = await Promise.all([
      api.get<InvestmentsSummaryDto>('/api/investments/summary'),
      listAccounts(api),
    ])
    if (summary.accounts.length === 0) {
      return "Aucun compte de placement ouvert. Pour en ajouter un, voir create_investment_account (la création se fait dans l'application)."
    }
    const byId = new Map(accounts.map((a) => [a.id, a]))
    const stale = summary.accounts.filter(
      (a) => a.stale || a.valueCents === null,
    )
    const lines = [
      `Placements : ${euros(summary.totals.valueCents)} au total (dernières valeurs connues).`,
      '',
      ...summary.accounts.map((row) => accountLine(row, byId.get(row.id))),
    ]
    lines.push(
      '',
      stale.length > 0
        ? `À mettre à jour : ${stale.map((a) => a.name).join(', ')}.`
        : 'Tous les comptes ont une valeur récente.',
    )
    const archived = accounts.filter((a) => isInvestment(a) && a.archivedAt)
    if (archived.length > 0) {
      lines.push(
        `Archivés (non modifiables) : ${archived.map((a) => a.name).join(', ')}.`,
      )
    }
    return lines.join('\n')
  },
})

const TYPE_HINTS: Record<(typeof INVESTMENT_TYPES)[number], string> = {
  brokerage: 'PEA / compte-titres',
  life_insurance: 'Assurance vie',
  employee_savings: 'Épargne salariale',
  crypto: 'Crypto, source « Saisie manuelle »',
}

export const INVESTMENT_TYPE_DESCRIPTION =
  'brokerage = PEA or securities account, life_insurance = assurance vie, employee_savings = PEE / PERCO / épargne salariale, crypto = crypto exchange or wallet.'

/** Normalized names of every account (archived ones included), for duplicates. */
export function findSameName(
  accounts: AccountDto[],
  name: string,
): AccountDto | undefined {
  const wanted = normalize(name)
  return accounts.find((a) => normalize(a.name) === wanted)
}

export function typeHint(type: (typeof INVESTMENT_TYPES)[number]): string {
  return TYPE_HINTS[type]
}
