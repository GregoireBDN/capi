import type { AccessTokenScope } from '#/api/types.gen'

/**
 * Plain French for « Claude et accès » (#329): what an access may do, when it
 * ends, when it was last used, and its calls as sentences rather than routes.
 */

export const SCOPE_LABELS: Record<AccessTokenScope, string> = {
  read: 'Lire seulement',
  write: 'Lire et classer',
}

export const SCOPE_DESCRIPTIONS: Record<AccessTokenScope, string> = {
  read: 'Répondre à vos questions sur vos comptes, opérations, budgets et prévisions.',
  write:
    'Aussi classer des opérations, ajouter des notes et des règles, fixer des budgets, importer un relevé CIC. Toujours après votre accord, jamais de suppression.',
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Paris',
})
const dayTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
})

export const formatDay = (iso: string) => dayFormat.format(new Date(iso))
export const formatDayTime = (iso: string) =>
  dayTimeFormat.format(new Date(iso))

/** `à l’instant`, `il y a 3 min`, `il y a 2 h`, `il y a 4 j`, then the day. */
export function formatAge(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a\u00a0${minutes}\u00a0min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a\u00a0${hours}\u00a0h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a\u00a0${days}\u00a0j`
  return `le ${formatDay(iso)}`
}

/** « utilisé il y a 2 h » / « jamais utilisé ». */
export function lastUseLabel(lastUsedAt: string | null, now: Date): string {
  return lastUsedAt ? `utilisé ${formatAge(lastUsedAt, now)}` : 'jamais utilisé'
}

/** « jusqu’au 17 févr. 2027 », « expiré le … », « sans limite ». */
export function endLabel(expiresAt: string | null, expired: boolean): string {
  if (!expiresAt) return 'sans limite'
  return expired
    ? `expiré le ${formatDay(expiresAt)}`
    : `jusqu’au ${formatDay(expiresAt)}`
}

/* ---------------------------------------------------------------------------
 * Calls in plain words
 * ------------------------------------------------------------------------- */

type Sentence = string | ((count: number) => string)

const plural = (count: number, one: string, many: string) =>
  count > 1 ? `${count} ${many}` : one

/**
 * What a call did, by method and route pattern (as audited: `/api/...`,
 * ids as `:id`). Reads are « a lu … », writes say what changed. Every route
 * open to tokens is here (`app.routes.spec.ts`); an unknown one falls back
 * to « a lu des données » / « a fait une modification ».
 */
const SENTENCES: Partial<Record<string, Sentence>> = {
  'GET /api/categories': 'a lu les catégories',
  'GET /api/categories/:id/usage': 'a lu une catégorie',
  'GET /api/categorization-rules': 'a lu les règles',
  'GET /api/categorization-rules/insights': 'a lu les règles',
  'GET /api/accounts': 'a lu les comptes',
  'GET /api/accounts/:id': 'a lu un compte',
  'GET /api/accounts/:id/balance-history': 'a lu le solde d’un compte',
  'GET /api/accounts/:id/month-flows': 'a lu le mois d’un compte',
  'GET /api/accounts/:id/deletion-preview': 'a lu un compte',
  'GET /api/accounts/:id/snapshots': 'a lu les valeurs d’un placement',
  'GET /api/accounts/:id/performance': 'a lu les gains d’un placement',
  'GET /api/accounts/:id/holdings': 'a lu des avoirs crypto',
  'GET /api/accounts/:id/wallet-keys': 'a lu un wallet',
  'GET /api/accounts/:id/wallet-tokens': 'a lu un wallet',
  'GET /api/imports': 'a lu les imports',
  'GET /api/imports/:id': 'a lu un import',
  'GET /api/recurring': 'a lu les abonnements',
  'GET /api/recurring/summary': 'a lu les abonnements',
  'GET /api/transactions': 'a lu les opérations',
  'GET /api/transactions/summary': 'a lu les totaux des opérations',
  'GET /api/transactions/review-count': 'a compté les opérations à revoir',
  'GET /api/transactions/manual/suggestions': 'a lu les libellés habituels',
  'GET /api/budgets': 'a lu le budget',
  'GET /api/budgets/envelopes': 'a lu les enveloppes du mois',
  'GET /api/budgets/history': 'a lu l’historique du budget',
  'GET /api/dashboard/overview': 'a lu le tableau de bord',
  'GET /api/dashboard/history': 'a lu l’évolution du patrimoine',
  'GET /api/dashboard/review': 'a lu la revue du mois',
  'GET /api/spending/by-category': 'a lu les dépenses',
  'GET /api/spending/trend': 'a lu l’évolution des dépenses',
  'GET /api/investments/summary': 'a lu les investissements',
  'GET /api/investments/flows': 'a lu les versements',
  'GET /api/investments/movements': 'a lu les versements',
  'GET /api/crypto/settings': 'a lu les cryptos',
  'GET /api/crypto/summary': 'a lu les cryptos',
  'GET /api/crypto/portfolio': 'a lu les cryptos',
  'GET /api/crypto/assets': 'a cherché une crypto',
  'GET /api/crypto-imports/:id': 'a lu un import crypto',
  'GET /api/forecast': 'a lu la prévision de fin de mois',
  'GET /api/savings/overview': 'a lu l’épargne',
  'GET /api/savings/goals': 'a lu les objectifs d’épargne',
  'GET /api/month-close/:month': 'a lu la clôture du mois',
  'GET /api/coverage': 'a vérifié jusqu’où vont les relevés',

  'PATCH /api/transactions/:id': (n) =>
    `a modifié ${plural(n, 'une opération', 'opérations')}`,
  'POST /api/transactions/bulk-update': (n) =>
    n > 1 ? `a classé des opérations (${n} fois)` : 'a classé des opérations',
  'POST /api/transactions/manual': (n) =>
    `a ajouté ${plural(n, 'une opération', 'opérations')}`,
  'PATCH /api/transactions/manual/:id': (n) =>
    `a modifié ${plural(n, 'une opération saisie', 'opérations saisies')}`,
  'POST /api/categorization-rules': (n) =>
    `a créé ${plural(n, 'une règle', 'règles')}`,
  'PATCH /api/categorization-rules/:id': (n) =>
    `a modifié ${plural(n, 'une règle', 'règles')}`,
  'POST /api/categorization-rules/apply': 'a appliqué les règles',
  'POST /api/categorization-rules/matches': 'a essayé une règle',
  'POST /api/categorization-rules/preview': 'a essayé une règle',
  'POST /api/categorization-rules/suggest': 'a cherché des règles à créer',
  'PUT /api/budgets/:categoryId': (n) =>
    `a fixé ${plural(n, 'un objectif de budget', 'objectifs de budget')}`,
  'POST /api/budgets/suggest': 'a calculé des suggestions de budget',
  'POST /api/imports/preview': 'a préparé l’import d’un relevé',
  'POST /api/imports/:id/commit': 'a importé un relevé',
  'POST /api/recurring/detect': 'a cherché les abonnements',
  'POST /api/recurring/confirm': 'a confirmé un abonnement',
  'PATCH /api/recurring/:id': 'a modifié un abonnement',
  'POST /api/savings/goals': 'a créé un objectif d’épargne',
  'PATCH /api/savings/goals/:id': 'a modifié un objectif d’épargne',
  'PUT /api/savings/target': 'a fixé l’objectif d’épargne',
  'POST /api/accounts/:id/snapshots/bulk': 'a enregistré des valeurs',
  'PUT /api/accounts/:id/snapshots/:date': 'a enregistré une valeur',
  'POST /api/accounts/:id/holdings': 'a ajouté un avoir crypto',
  'PUT /api/accounts/:id/holdings/:holdingId': 'a mis à jour un avoir crypto',
}

/** What a call did; `count` identical calls in a row are told as one. */
export function describeCall(method: string, route: string, count = 1): string {
  const sentence = SENTENCES[`${method.toUpperCase()} ${route}`]
  if (typeof sentence === 'function') return sentence(count)
  const text =
    sentence ??
    (method.toUpperCase() === 'GET'
      ? 'a lu des données'
      : 'a voulu faire une modification')
  return count > 1 ? `${text} (${count} fois)` : text
}

/**
 * A refused call, told as an attempt: « a ajouté une opération » becomes
 * « a voulu ajouter une opération ».
 */
export function attempted(label: string): string {
  const match = /^a (\S+)(.*)$/.exec(label)
  if (!match) return label
  const [, participle, rest] = match
  if (participle === 'voulu') return label
  const infinitive =
    participle === 'lu'
      ? 'lire'
      : participle === 'mis'
        ? 'mettre'
        : participle.endsWith('é')
          ? `${participle.slice(0, -1)}er`
          : participle
  return `a voulu ${infinitive}${rest}`
}

export interface AuditCall {
  id: string
  method: string
  route: string
  statusCode: number
  createdAt: string
}

export interface CallLine {
  /** Id of the latest call of the group. */
  id: string
  label: string
  /** Refused by the API (403, 401) or failed. */
  refused: boolean
  /** The latest call of the group. */
  createdAt: string
  count: number
}

/** Calls this close together, same route and outcome, make one line. */
const GROUP_WINDOW_MS = 10 * 60_000

/**
 * The calls as lines, newest first: identical calls in a row (same method,
 * route and outcome, a few minutes apart) make one line with their count,
 * so « a modifié 3 opérations » rather than three lines.
 */
export function callLines(calls: readonly AuditCall[]): CallLine[] {
  const groups: { first: AuditCall; last: AuditCall; count: number }[] = []
  for (const call of calls) {
    const group = groups.at(-1)
    if (
      group &&
      group.first.method === call.method &&
      group.first.route === call.route &&
      group.first.statusCode < 400 === call.statusCode < 400 &&
      Date.parse(group.last.createdAt) - Date.parse(call.createdAt) <=
        GROUP_WINDOW_MS
    ) {
      group.last = call
      group.count += 1
    } else {
      groups.push({ first: call, last: call, count: 1 })
    }
  }
  return groups.map(({ first, count }) => {
    const refused = first.statusCode >= 400
    const label = describeCall(first.method, first.route, count)
    return {
      id: first.id,
      label: refused ? attempted(label) : label,
      refused,
      createdAt: first.createdAt,
      count,
    }
  })
}
