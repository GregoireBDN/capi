import { formatSignedPercent } from '@finances/ui'
import type { PortfolioAccountDto } from '#/api/types.gen'
import { formatPriceAge } from './format'

/*
 * What the Crypto page (#295) says about its figures and accounts: pure
 * functions, tested on their own.
 */

/** « +2,4 % » from the API's signed decimal percent (display only). */
export function changePercentText(percent: string): string {
  return formatSignedPercent(Number(percent) / 100)
}

/** Tone of a signed figure: the chart delta colours, none at zero. */
export function deltaTone(value: number): string | undefined {
  if (value > 0) return 'text-chart-delta-good'
  if (value < 0) return 'text-chart-delta-bad'
  return undefined
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'short',
})

/** « il y a 3 h » within a week, « le 12 oct. » before. */
export function ageText(iso: string, now: Date): string {
  const days = (now.getTime() - Date.parse(iso)) / 86_400_000
  return days < 7
    ? formatPriceAge(iso, now)
    : `le ${dayFormat.format(new Date(iso)).replace(/^1 /, '1er ')}`
}

/** An exchange whose last export is older than this asks for a new one. */
export const EXPORT_STALE_DAYS = 31

export interface AccountFreshness {
  /** Second line of the row: the kind and how fresh it is. */
  text: string
  /**
   * The same on a narrow row, where the badge says the kind: how fresh it
   * is only (« il y a 3 h », « le 10 nov. »), one short line on a phone.
   */
  short: string
  /** What happened on that day, drawn as a small icon before `short`. */
  event: 'export' | 'read' | 'edit'
  /** Under the value, in the warning tone: what to do (null when fine). */
  warning: string | null
}

/**
 * « Où sont mes cryptos » : how each account is fed and how fresh it is
 * (an exchange's last export, a wallet's last read, a manual line's last
 * edit), and what wants doing.
 */
export function accountFreshness(
  account: PortfolioAccountDto,
  now: Date,
): AccountFreshness {
  const at = account.updatedAt
  if (account.source === 'exchange') {
    if (at === null) {
      return {
        text: 'Plateforme · aucun export',
        short: 'aucun export',
        event: 'export',
        warning: 'à importer',
      }
    }
    const old = now.getTime() - Date.parse(at) > EXPORT_STALE_DAYS * 86_400_000
    return {
      text: `Plateforme · export importé ${ageText(at, now)}`,
      short: ageText(at, now),
      event: 'export',
      warning: old ? 'à mettre à jour' : null,
    }
  }
  if (account.source === 'wallet') {
    const sync = account.sync
    if (sync && !sync.enabled) {
      return {
        text: at
          ? `Wallet · lu ${ageText(at, now)}, synchro désactivée`
          : 'Wallet · synchro désactivée',
        short: 'sans synchro',
        event: 'read',
        warning: null,
      }
    }
    // A sync running in the background (#381): said in place.
    if (sync?.syncing)
      return {
        text: 'Wallet · lecture en cours…',
        short: 'lecture…',
        event: 'read',
        warning: null,
      }
    if (at === null) {
      return {
        text: 'Wallet · jamais lu',
        short: 'jamais lu',
        event: 'read',
        warning: 'à lire',
      }
    }
    return {
      text: `Wallet · lu ${ageText(at, now)}`,
      short: ageText(at, now),
      event: 'read',
      warning: sync?.failedAt ? 'lecture en échec' : null,
    }
  }
  return {
    text: at
      ? `Saisie manuelle · modifiée ${ageText(at, now)}`
      : 'Saisie manuelle · vide',
    short: at ? ageText(at, now) : 'vide',
    event: 'edit',
    warning: null,
  }
}
