/**
 * Closing months from Claude (#342): « clôture tous les anciens mois ». The
 * API closes a month only once it is over (before the current Europe/Paris
 * month) and freezes its report; reopening stays in the app.
 */
import { z } from 'zod'
import type {
  MonthCloseDto,
  MonthCloseListDto,
  MonthCloseStep,
} from '../api/types.js'
import { ApiError } from '../api/client.js'
import { addMonths, frenchDate, frenchMonth, parisToday } from '../format.js'
import { MONTH_PATTERN } from './lookup.js'
import { STEP_LABELS } from './month-close.js'
import { defineTool, ToolInputError } from './tool.js'
import { confirmSchema, PREVIEW_FOOTER, PREVIEW_HEADER } from './write.js'

/** Months closed by one call at most (each preview reads the month's review). */
export const MAX_MONTHS_PER_CALL = 24

const REOPEN_HINT =
  "Pour rouvrir un mois : dans l'application, Revue du mois › Rouvrir (aucun outil MCP ne rouvre un mois)."

/** `from` … `to` included, as `YYYY-MM` (empty when `from` is after `to`). */
function monthsBetween(from: string, to: string): string[] {
  const months: string[] = []
  for (let month = from; month <= to; month = addMonths(month, 1)) {
    months.push(month)
  }
  return months
}

/** What is still open in the month's review, one short line per step. */
function openSteps(close: MonthCloseDto): string[] {
  const done = new Map(close.steps.map((s) => [s.key, s.done]))
  const lines: string[] = []
  const add = (key: MonthCloseStep, detail: string) => {
    if (!done.get(key)) lines.push(`  ✗ ${STEP_LABELS[key]} : ${detail}`)
  }
  const late = close.imports.accounts.filter((a) => !a.upToDate)
  const imports = [
    ...late.map(
      (a) =>
        `${a.name} ${a.lastDate ? `(données jusqu'au ${frenchDate(a.lastDate)})` : '(aucune donnée)'}`,
    ),
    ...(close.imports.gaps.length > 0
      ? [`${close.imports.gaps.length} trou(s) dans le solde`]
      : []),
  ]
  add('imports', imports.join(', ') || 'à vérifier')
  add(
    'review_queue',
    `${close.reviewQueue.count} opération(s) du mois à revoir`,
  )
  add(
    'recurring',
    close.recurring.suggestedCount > 0
      ? `${close.recurring.suggestedCount} abonnement(s) détecté(s) à confirmer`
      : "pas cochée dans l'application",
  )
  add('budget', "pas cochée dans l'application")
  add('savings', "pas cochée dans l'application")
  add(
    'investments',
    close.investments.accounts.length > 0
      ? `sans valeur à la fin du mois : ${close.investments.accounts.map((a) => a.name).join(', ')}`
      : 'à vérifier',
  )
  return lines
}

export const closeMonthsTool = defineTool({
  name: 'close_months',
  title: 'Clôturer des mois',
  description:
    'Close months of the guided month-end review ("Revue du mois"): freezes each month’s report (totals per category, income, expenses, savings, net worth) as the data stands now. Only months before the current one (Europe/Paris) can be closed. `month` closes one month; `allBefore: true` closes every past month left open since the first month ever closed, up to the previous month (with `from` when no month was ever closed). Steps still open do not prevent a close: the preview lists them. Without confirm: preview per month (already closed / to close, what is still open). With confirm: true closes the months still open, oldest first; already closed months are skipped. Reopening is done in the app.',
  write: { idempotent: true },
  inputSchema: {
    month: z
      .string()
      .regex(MONTH_PATTERN)
      .optional()
      .describe('One month to close, YYYY-MM.'),
    allBefore: z
      .boolean()
      .optional()
      .describe(
        'true: every past month left open since the first month ever closed, up to the previous calendar month.',
      ),
    from: z
      .string()
      .regex(MONTH_PATTERN)
      .optional()
      .describe(
        'With allBefore: first month to close, YYYY-MM. Required when no month was ever closed (the history imported before the app is not reviewed).',
      ),
    confirm: confirmSchema,
  },
  async run({ api, now }, args) {
    if ((args.month !== undefined) === (args.allBefore === true)) {
      throw new ToolInputError(
        "Indiquez soit month (un mois, AAAA-MM), soit allBefore: true (tous les mois passés encore ouverts). Rien n'a été modifié.",
      )
    }
    if (args.from !== undefined && args.allBefore !== true) {
      throw new ToolInputError(
        "from ne s'utilise qu'avec allBefore: true. Rien n'a été modifié.",
      )
    }
    const current = parisToday(now()).slice(0, 7)
    const previous = addMonths(current, -1)
    const requested = args.month ?? args.from
    if (requested !== undefined && requested >= current) {
      throw new ToolInputError(
        `${frenchMonth(requested)} n'est pas terminé : seuls les mois avant ${frenchMonth(current)} peuvent être clôturés. Rien n'a été modifié.`,
      )
    }

    const list = await api.get<MonthCloseListDto>('/api/month-close')
    const closedAt = new Map(list.closed.map((c) => [c.month, c.closedAt]))
    let range: string[]
    if (args.month !== undefined) {
      range = [args.month]
    } else {
      const first = list.closed.map((c) => c.month).find((m) => m < current)
      const start = args.from ?? first
      if (start === undefined) {
        throw new ToolInputError(
          "Aucun mois n'a encore été clôturé : indiquez le premier mois à clôturer avec from (AAAA-MM), par exemple le premier mois revu dans l'application. L'historique importé avant l'application n'a pas besoin d'être clôturé. Rien n'a été modifié.",
        )
      }
      range = monthsBetween(start, previous)
    }

    const alreadyClosed = range.filter((m) => closedAt.has(m))
    const toClose = range.filter((m) => !closedAt.has(m))
    const batch = toClose.slice(0, MAX_MONTHS_PER_CALL)
    const later = toClose.slice(batch.length)
    const laterLine =
      later.length > 0
        ? [
            `${later.length} mois de plus restent ouverts (de ${frenchMonth(later[0] ?? '')} à ${frenchMonth(later[later.length - 1] ?? '')}) : au plus ${MAX_MONTHS_PER_CALL} par appel, rappelez l'outil ensuite.`,
          ]
        : []

    if (batch.length === 0) {
      const only = args.month
      return [
        only
          ? `${frenchMonth(only)} est déjà clôturé (le ${frenchDate(closedAt.get(only))}) : rien à faire.`
          : `Rien à clôturer : tous les mois de ${frenchMonth(range[0] ?? previous)} à ${frenchMonth(previous)} sont déjà clôturés.`,
      ].join('\n')
    }

    const alreadyLine =
      alreadyClosed.length > 0
        ? [
            `Déjà clôturés, rien à faire : ${alreadyClosed.map(frenchMonth).join(', ')}.`,
          ]
        : []

    if (args.confirm !== true) {
      const lines = [
        PREVIEW_HEADER,
        `Mois qui seraient clôturés (du plus ancien au plus récent) :`,
      ]
      for (const month of batch) {
        const close = await api.get<MonthCloseDto>(`/api/month-close/${month}`)
        if (close.status === 'closed') {
          lines.push(`- ${frenchMonth(month)} : déjà clôturé, rien à faire.`)
          continue
        }
        const open = openSteps(close)
        const steps = close.steps.filter((s) => s.key !== 'close')
        lines.push(
          `- ${frenchMonth(month)} : à clôturer · étapes faites ${steps.filter((s) => s.done).length}/${steps.length}${open.length === 0 ? ', tout est fait' : ''}`,
          ...open,
        )
      }
      lines.push(
        ...alreadyLine,
        ...laterLine,
        '',
        'La clôture fige le rapport de chaque mois tel que les données sont maintenant ; les modifications faites ensuite apparaîtront comme des écarts. Les étapes encore ouvertes ne bloquent pas la clôture.',
        '',
        PREVIEW_FOOTER,
      )
      return lines.join('\n')
    }

    const closedNow: string[] = []
    const skipped: string[] = []
    for (const month of batch) {
      try {
        await api.send<MonthCloseDto>(
          'POST',
          `/api/month-close/${month}/close`,
          {},
        )
        closedNow.push(month)
      } catch (error) {
        // Closed meanwhile (in the app): nothing more to do for it.
        if (error instanceof ApiError && error.status === 409) {
          skipped.push(month)
          continue
        }
        if (!(error instanceof ApiError) || closedNow.length === 0) throw error
        const notClosed = batch.filter(
          (m) => !closedNow.includes(m) && !skipped.includes(m),
        )
        return [
          `Erreur après ${closedNow.length} mois clôturé(s) : ${error.message}`,
          `Clôturés : ${closedNow.map(frenchMonth).join(', ')}.`,
          `Pas clôturés : ${notClosed.map(frenchMonth).join(', ')}. Rappelez l'outil avec les mêmes arguments : les mois déjà clôturés sont sautés.`,
          REOPEN_HINT,
        ].join('\n')
      }
    }
    const done = [...alreadyClosed, ...skipped].sort()
    return [
      closedNow.length > 0
        ? `${closedNow.length} mois clôturé(s) : ${closedNow.map(frenchMonth).join(', ')}.`
        : 'Aucun mois clôturé : ils étaient déjà clôturés.',
      ...(done.length > 0
        ? [`Déjà clôturés, rien à faire : ${done.map(frenchMonth).join(', ')}.`]
        : []),
      ...laterLine,
      REOPEN_HINT,
    ].join('\n')
  },
})
