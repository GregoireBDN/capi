/**
 * Bank CSV imports from Claude (#103), through the same preview → commit flow
 * as the import page: `preview_bank_import` uploads the file to
 * `POST /api/imports/preview` (parse, dedupe, continuity check, proposed
 * categories; a pending import, no transaction written), `commit_bank_import`
 * commits that preview only with `confirm: true`, `list_imports` tells what
 * was imported up to when. Both writes need a `write` token; discarding or
 * undoing an import stays in the app. Never log the file, its path, labels or
 * amounts: errors carry only the tool name and the HTTP status (`server.ts`).
 */
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join } from 'node:path'
import { z } from 'zod'
import { ApiError, type ApiClient } from '../api/client.js'
import type {
  AccountDto,
  CategoryDto,
  CommitImportDto,
  ContinuityGapDto,
  ImportDetailDto,
  ImportPreviewRowDto,
  ImportSummaryDto,
  TransactionDto,
  TransactionListDto,
} from '../api/types.js'
import { euros, frenchDate, parisToday, signedEuros, table } from '../format.js'
import {
  listAccounts,
  listCategories,
  pickAccount,
  UUID_PATTERN,
} from './lookup.js'
import { defineTool, ToolInputError } from './tool.js'
import { confirmSchema, transactionRef } from './write.js'

/** Same limit as the API (`IMPORT_FILE_MAX_BYTES`). */
export const IMPORT_FILE_MAX_BYTES = 5 * 1024 * 1024
const FILE_NAME_MAX = 255
const DEFAULT_FILE_NAME = 'releve-cic.csv'
/** New rows listed in a preview; the counts always cover all of them. */
const NEW_ROWS_SHOWN = 50
const CONFLICTS_SHOWN = 20
const ISSUES_SHOWN = 10
const GAPS_SHOWN = 10
/** Review-queue rows listed after a commit (pages of 100). */
const REVIEW_ROWS_SHOWN = 100
const REVIEW_PAGES_MAX = 10
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
const CASH_ACCOUNT_TYPES: AccountDto['type'][] = ['checking', 'savings']

const NOTHING_WRITTEN =
  "Rien n'est écrit avant commit_bank_import avec confirm: true."

/** Paris calendar day of an API timestamp, as `dd/mm/yyyy`. */
function parisDay(timestamp: string): string {
  return frenchDate(parisToday(new Date(timestamp)))
}

function period(start: string | null, end: string | null): string {
  if (!start || !end) return 'période inconnue'
  return start === end
    ? `le ${frenchDate(start)}`
    : `du ${frenchDate(start)} au ${frenchDate(end)}`
}

function pickCashAccount(accounts: AccountDto[], input: string): AccountDto {
  const account = pickAccount(accounts, input)
  if (!CASH_ACCOUNT_TYPES.includes(account.type) || account.archivedAt) {
    const open = accounts
      .filter((a) => CASH_ACCOUNT_TYPES.includes(a.type) && !a.archivedAt)
      .map((a) => a.name)
      .join(', ')
    throw new ToolInputError(
      `« ${account.name} » ne reçoit pas de relevé bancaire : seuls les comptes courants et d'épargne ouverts s'importent (${open || 'aucun'}).`,
    )
  }
  return account
}

/** `~/x.csv` → absolute path in the owner's home. */
function expandHome(path: string): string {
  if (path === '~') return homedir()
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
}

/**
 * Reads the export from the owner's machine (the server runs locally over
 * stdio): an absolute path to a `.csv` file of at most 5 MB, sent as is
 * (Windows-1252 for a CIC export).
 */
async function readExport(
  rawPath: string,
): Promise<{ bytes: Buffer; fileName: string }> {
  const path = expandHome(rawPath.trim())
  if (!isAbsolute(path)) {
    throw new ToolInputError(
      `Chemin « ${rawPath} » non absolu : donnez le chemin complet du fichier (ex. /Users/…/Téléchargements/releve.csv ou ~/Downloads/releve.csv).`,
    )
  }
  if (extname(path).toLowerCase() !== '.csv') {
    throw new ToolInputError(
      `« ${basename(path)} » n'est pas un fichier .csv : seul l'export CSV du CIC s'importe.`,
    )
  }
  let size: number
  try {
    const info = await stat(path)
    if (!info.isFile()) {
      throw new ToolInputError(`« ${rawPath} » n'est pas un fichier.`)
    }
    size = info.size
  } catch (error) {
    if (error instanceof ToolInputError) throw error
    throw fileError(error, rawPath)
  }
  if (size === 0)
    throw new ToolInputError(`Le fichier « ${rawPath} » est vide.`)
  if (size > IMPORT_FILE_MAX_BYTES) {
    throw new ToolInputError(
      `Le fichier « ${rawPath} » dépasse 5 Mo : un export CIC fait quelques centaines de Ko. Vérifiez le fichier.`,
    )
  }
  try {
    return { bytes: await readFile(path), fileName: basename(path) }
  } catch (error) {
    throw fileError(error, rawPath)
  }
}

function fileError(error: unknown, rawPath: string): ToolInputError {
  const code = (error as { code?: unknown } | null)?.code
  switch (code) {
    case 'ENOENT':
    case 'ENOTDIR':
      return new ToolInputError(`Fichier introuvable : « ${rawPath} ».`)
    case 'EACCES':
    case 'EPERM':
      return new ToolInputError(
        `Lecture refusée pour « ${rawPath} » : le serveur MCP n'a pas accès à ce fichier.`,
      )
    default:
      return new ToolInputError(`Impossible de lire « ${rawPath} ».`)
  }
}

/**
 * CSV text passed by Claude: sent as UTF-8 with a BOM, which the API's CIC
 * parser reads as UTF-8 (it assumes Windows-1252 otherwise). The dedupe hash
 * is computed on the parsed rows, so the bytes' encoding doesn't matter.
 */
function encodeContent(content: string): Buffer {
  const text = content.replace(/^﻿/, '')
  if (text.trim() === '') throw new ToolInputError('Le contenu CSV est vide.')
  const bytes = Buffer.concat([UTF8_BOM, Buffer.from(text, 'utf8')])
  if (bytes.length > IMPORT_FILE_MAX_BYTES) {
    throw new ToolInputError('Le contenu dépasse 5 Mo.')
  }
  return bytes
}

function cleanFileName(name: string | undefined, fallback: string): string {
  const base = name?.split(/[\\/]/).pop()?.trim()
  return (base || fallback).slice(0, FILE_NAME_MAX)
}

function categoryLabel(
  row: Pick<ImportPreviewRowDto, 'categoryId' | 'needsReview'>,
  categories: Map<string, CategoryDto>,
): string {
  const name = row.categoryId ? categories.get(row.categoryId)?.name : undefined
  if (name) return row.needsReview ? `${name} (à revoir)` : name
  return 'à revoir (sans catégorie)'
}

function gapLine(gap: ContinuityGapDto): string {
  const where = gap.fromDate
    ? `opérations manquantes entre le ${frenchDate(gap.fromDate)} et le ${frenchDate(gap.toDate)}`
    : `au ${frenchDate(gap.toDate)}`
  return `- ligne ${gap.lineNumber} : ${where} (solde attendu ${euros(gap.expectedCents)}, solde du fichier ${euros(gap.actualCents)})`
}

/** Preview text: counts, continuity, rows to write, conflicts, unreadable lines. */
function describePreview(
  detail: ImportDetailDto,
  categories: Map<string, CategoryDto>,
): string[] {
  const { counts, preview } = detail
  const lines = [
    `Compte : ${detail.accountName} · fichier : ${detail.fileName}`,
    `Identifiant de l'aperçu (previewId) : ${detail.id}`,
    `Période du fichier : ${period(detail.periodStart, detail.periodEnd)}`,
    `Lignes lues : ${counts.rows} · nouvelles : ${counts.new} · déjà importées : ${counts.duplicates} · conflits : ${counts.conflicts} · lignes illisibles : ${counts.issues}`,
  ]
  if (detail.alreadyImported) {
    lines.push(
      `Ce même fichier a déjà été importé le ${parisDay(detail.alreadyImported.committedAt)} sur ce compte.`,
    )
  }
  if (!preview) return lines

  const fresh = preview.rows.filter((r) => r.status === 'new')
  const conflicts = preview.rows.filter((r) => r.status === 'conflict')
  if (fresh.length === 0 && conflicts.length === 0) {
    lines.push(
      "Rien de nouveau : toutes les lignes sont déjà enregistrées. Valider cet aperçu n'ajouterait aucune opération.",
    )
  } else if (fresh.length > 0) {
    const inCents = fresh
      .filter((r) => r.amountCents > 0)
      .reduce((sum, r) => sum + r.amountCents, 0)
    const outCents = fresh
      .filter((r) => r.amountCents < 0)
      .reduce((sum, r) => sum + r.amountCents, 0)
    const review = fresh.filter((r) => r.needsReview).length
    const matched = fresh.filter((r) => r.manualMatch).length
    lines.push(
      `Nouvelles opérations : ${fresh.length} (entrées ${signedEuros(inCents)}, sorties ${euros(outCents)}) ; ${review} iront dans la file de revue${matched > 0 ? ` ; ${matched} remplacent une opération saisie à la main (catégorie et note gardées)` : ''}.`,
    )
  }

  const { continuity } = preview
  if (!continuity.checked) {
    lines.push('Continuité du solde : non vérifiée (aucun solde comparable).')
  } else if (continuity.ok) {
    lines.push('Continuité du solde : OK, aucun trou.')
  } else {
    lines.push(
      'Continuité du solde : PROBLÈME, des opérations semblent manquer.',
    )
    if (continuity.openingMismatch) {
      const gap = continuity.openingMismatch
      lines.push(
        `- début du fichier : le premier solde ne suit pas le solde déjà enregistré (attendu ${euros(gap.expectedCents)}, fichier ${euros(gap.actualCents)}) : un relevé intermédiaire manque peut-être.`,
      )
    }
    for (const gap of continuity.gaps.slice(0, GAPS_SHOWN)) {
      lines.push(gapLine(gap))
    }
    if (continuity.gaps.length > GAPS_SHOWN) {
      lines.push(`- … et ${continuity.gaps.length - GAPS_SHOWN} autres trous.`)
    }
  }

  if (fresh.length > 0) {
    lines.push(
      '',
      fresh.length > NEW_ROWS_SHOWN
        ? `Nouvelles opérations (${NEW_ROWS_SHOWN} premières sur ${fresh.length}) :`
        : 'Nouvelles opérations :',
      table(
        ['Date', 'Montant', 'Libellé', 'Catégorie proposée'],
        fresh
          .slice(0, NEW_ROWS_SHOWN)
          .map((r) => [
            frenchDate(r.bookingDate),
            signedEuros(r.amountCents),
            r.rawLabel,
            r.manualMatch
              ? `remplace la saisie manuelle « ${r.manualMatch.rawLabel} »`
              : categoryLabel(r, categories),
          ]),
      ),
    )
  }

  if (conflicts.length > 0) {
    lines.push(
      '',
      'Conflits (doublons probables d’une opération venue d’une autre source) : laissés de côté, sauf avec includeConflicts: true au moment de valider.',
    )
    for (const r of conflicts.slice(0, CONFLICTS_SHOWN)) {
      const existing = r.existing
        ? ` — ressemble à : ${frenchDate(r.existing.bookingDate)} · ${signedEuros(r.existing.amountCents)} · ${r.existing.rawLabel}`
        : ''
      const reason = r.conflictReason ? ` (${r.conflictReason})` : ''
      lines.push(
        `- ligne ${r.lineNumber} : ${frenchDate(r.bookingDate)} · ${signedEuros(r.amountCents)} · ${r.rawLabel}${existing}${reason}`,
      )
    }
    if (conflicts.length > CONFLICTS_SHOWN) {
      lines.push(
        `- … et ${conflicts.length - CONFLICTS_SHOWN} autres conflits.`,
      )
    }
  }

  if (preview.issues.length > 0) {
    lines.push('', 'Lignes illisibles (ignorées) :')
    for (const issue of preview.issues.slice(0, ISSUES_SHOWN)) {
      lines.push(`- ligne ${issue.lineNumber} : ${issue.message}`)
    }
    if (preview.issues.length > ISSUES_SHOWN) {
      lines.push(`- … et ${preview.issues.length - ISSUES_SHOWN} autres.`)
    }
  }

  if (preview.unmatchedManual.length > 0) {
    lines.push(
      '',
      `${preview.unmatchedManual.length} opération(s) saisie(s) à la main sur la période ne correspondent à aucune ligne du fichier : elles restent et seront marquées à revoir.`,
    )
  }
  return lines
}

export const previewBankImportTool = defineTool({
  name: 'preview_bank_import',
  title: 'Aperçu d’un import de relevé',
  description: `Preview a CIC bank CSV export for a checking or savings account, exactly like the app's import page: rows already imported are recognized (re-importing a file or an overlapping period adds nothing), probable duplicates from another source are shown as conflicts, the running balance is checked for missing rows and categories are proposed by the rules. Give either filePath (the file on the owner's machine, e.g. ~/Downloads/export.csv) or content (the CSV text). Returns a previewId with counts, the continuity check and the rows that would be added. ${NOTHING_WRITTEN} Show the preview to the owner first. Needs a write token. The preview expires after 24 hours.`,
  write: { idempotent: true },
  inputSchema: {
    account: z
      .string()
      .max(100)
      .describe(
        'Checking or savings account name (see accounts_overview), e.g. "Compte courant".',
      ),
    filePath: z
      .string()
      .max(4096)
      .optional()
      .describe(
        'Absolute path of the .csv export on the owner’s machine (~ allowed), at most 5 MB. Sent as is (CIC exports are Windows-1252).',
      ),
    content: z
      .string()
      .max(IMPORT_FILE_MAX_BYTES)
      .optional()
      .describe(
        'The CSV text itself, when there is no file path (header line Date;Date de valeur;Débit;Crédit;Libellé;Solde included).',
      ),
    fileName: z
      .string()
      .max(FILE_NAME_MAX)
      .optional()
      .describe(
        'Name shown in the import history. Default: the file name, or releve-cic.csv for content.',
      ),
  },
  async run({ api }, args) {
    if ((args.filePath === undefined) === (args.content === undefined)) {
      throw new ToolInputError(
        'Donnez soit filePath (chemin du fichier), soit content (texte du CSV), pas les deux.',
      )
    }
    const accounts = await listAccounts(api)
    const account = pickCashAccount(accounts, args.account)
    const upload =
      args.filePath !== undefined
        ? await readExport(args.filePath)
        : { bytes: encodeContent(args.content ?? ''), fileName: '' }
    const fileName = cleanFileName(
      args.fileName,
      upload.fileName || DEFAULT_FILE_NAME,
    )

    const form = new FormData()
    form.append('accountId', account.id)
    form.append(
      'file',
      new Blob([new Uint8Array(upload.bytes)], { type: 'text/csv' }),
      fileName,
    )
    const [detail, categories] = await Promise.all([
      api.upload<ImportDetailDto>('/api/imports/preview', form),
      listCategories(api),
    ])
    const byId = new Map(categories.map((c) => [c.id, c]))
    return [
      `APERÇU D'IMPORT — rien n'a encore été importé. ${NOTHING_WRITTEN}`,
      ...describePreview(detail, byId),
      '',
      `Montrez cet aperçu au propriétaire. S'il est d'accord, appelez commit_bank_import avec previewId "${detail.id}" et confirm: true${detail.counts.conflicts > 0 ? ' (ajoutez includeConflicts: true seulement s’il veut aussi importer les conflits)' : ''}. Pour abandonner, ne faites rien : l'aperçu expire au bout de 24 heures.`,
    ].join('\n')
  },
})

/** The import's rows still in the review queue (paged through the list API). */
async function reviewRows(
  api: ApiClient,
  detail: ImportDetailDto,
): Promise<{ rows: TransactionDto[]; complete: boolean }> {
  if (!detail.periodStart || !detail.periodEnd) {
    return { rows: [], complete: true }
  }
  const rows: TransactionDto[] = []
  for (let page = 1; page <= REVIEW_PAGES_MAX; page++) {
    const list = await api.get<TransactionListDto>('/api/transactions', {
      accountId: detail.accountId,
      from: detail.periodStart,
      to: detail.periodEnd,
      needsReview: true,
      sort: 'date_asc',
      limit: 100,
      page,
    })
    rows.push(...list.items.filter((t) => t.importId === detail.id))
    if (page * list.limit >= list.total || list.items.length === 0) {
      return { rows, complete: true }
    }
  }
  return { rows, complete: false }
}

async function describeCommitted(
  api: ApiClient,
  detail: ImportDetailDto,
  heading: string,
): Promise<string> {
  const { counts } = detail
  const { rows, complete } = await reviewRows(api, detail)
  const lines = [
    heading,
    `Compte : ${detail.accountName} · fichier : ${detail.fileName} · ${period(detail.periodStart, detail.periodEnd)}`,
    `Opérations ajoutées : ${counts.inserted} · déjà présentes : ${counts.duplicates} · conflits laissés de côté : ${counts.skipped}.`,
  ]
  if (rows.length === 0) {
    lines.push(
      counts.inserted > 0
        ? 'File de revue : aucune opération de cet import à revoir, toutes ont été classées par les règles.'
        : 'File de revue : rien de nouveau.',
    )
  } else {
    lines.push(
      `File de revue : ${rows.length}${complete ? '' : '+'} opération(s) de cet import à revoir (sans catégorie ou à vérifier) :`,
      ...rows.slice(0, REVIEW_ROWS_SHOWN).map((t) => {
        const category = t.category ? t.category.name : 'sans catégorie'
        return `- ${transactionRef(t)} · ${category}`
      }),
    )
    if (rows.length > REVIEW_ROWS_SHOWN) {
      lines.push(
        `- … et ${rows.length - REVIEW_ROWS_SHOWN} autres (review_queue).`,
      )
    }
    lines.push(
      'Pour les classer : categorize_transactions avec ces ids (aperçu d’abord), et create_rule pour un commerçant qui revient.',
    )
  }
  lines.push(
    "Pour annuler cet import : dans l'application, page Import (aucun outil ne supprime).",
  )
  return lines.join('\n')
}

async function loadImport(
  api: ApiClient,
  previewId: string,
): Promise<ImportDetailDto> {
  try {
    return await api.get<ImportDetailDto>(`/api/imports/${previewId}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ToolInputError(
        `Aperçu ${previewId} introuvable : il a expiré (24 heures), été abandonné dans l'application ou l'import a été annulé. Refaites un aperçu avec preview_bank_import.`,
      )
    }
    throw error
  }
}

export const commitBankImportTool = defineTool({
  name: 'commit_bank_import',
  title: 'Valider un import de relevé',
  description:
    'Commit a preview made by preview_bank_import: writes its new rows (atomically) after the owner agreed. Without confirm: shows again what would be written. With confirm: true: imports the new rows, leaves out the conflicts unless includeConflicts is true, and returns how many were added and the rows that went to the review queue, with their ids for categorize_transactions. Rows imported by another import since the preview count as already there; committing an already committed preview changes nothing. Needs a write token; undoing an import is done in the app.',
  write: { idempotent: true },
  inputSchema: {
    previewId: z
      .string()
      .regex(UUID_PATTERN)
      .describe('The previewId returned by preview_bank_import.'),
    includeConflicts: z
      .boolean()
      .optional()
      .describe(
        'true imports the conflicting rows too, as separate transactions (only when the owner says they are not duplicates). Default: conflicts are left out.',
      ),
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    const before = await loadImport(api, args.previewId)
    if (before.status === 'committed') {
      return describeCommitted(
        api,
        before,
        `Cet import a déjà été validé le ${before.committedAt ? parisDay(before.committedAt) : 'n/c'} : rien de plus n'a été écrit.`,
      )
    }
    const conflictRows = (before.preview?.rows ?? []).filter(
      (r) => r.status === 'conflict',
    )
    if (!args.confirm) {
      const categories = await listCategories(api)
      return [
        `APERÇU — rien n'a encore été importé. ${NOTHING_WRITTEN}`,
        ...describePreview(before, new Map(categories.map((c) => [c.id, c]))),
        '',
        conflictRows.length > 0
          ? `Avec confirm: true : ${before.counts.new} opération(s) ajoutée(s), ${args.includeConflicts ? `plus les ${conflictRows.length} conflit(s)` : `${conflictRows.length} conflit(s) laissé(s) de côté`}.`
          : `Avec confirm: true : ${before.counts.new} opération(s) ajoutée(s).`,
        "Montrez-le au propriétaire et, s'il est d'accord, rappelez commit_bank_import avec les mêmes arguments et confirm: true.",
      ].join('\n')
    }

    const body: CommitImportDto = args.includeConflicts
      ? {
          conflictResolutions: conflictRows.map((r) => ({
            rowIndex: r.index,
            action: 'import' as const,
          })),
        }
      : {}
    let committed: ImportDetailDto
    try {
      committed = await api.send<ImportDetailDto>(
        'POST',
        `/api/imports/${args.previewId}/commit`,
        body,
      )
    } catch (error) {
      // Committed meanwhile (another call, the app): report it, change nothing.
      if (error instanceof ApiError && error.status === 409) {
        const now = await loadImport(api, args.previewId)
        if (now.status === 'committed') {
          return describeCommitted(
            api,
            now,
            "Cet import venait d'être validé : rien de plus n'a été écrit.",
          )
        }
      }
      throw error
    }
    return describeCommitted(api, committed, 'Import validé.')
  },
})

export const listImportsTool = defineTool({
  name: 'list_imports',
  title: 'Imports de relevés',
  description:
    'When each checking or savings account was last imported and up to which day its statements go, plus previews waiting for commit_bank_import. Helps find what is missing before importing. Read only.',
  inputSchema: {
    account: z
      .string()
      .max(100)
      .optional()
      .describe('Account name. Default: every checking and savings account.'),
  },
  async run({ api }, args) {
    const [accounts, imports] = await Promise.all([
      listAccounts(api),
      api.get<ImportSummaryDto[]>('/api/imports'),
    ])
    const selected = args.account
      ? [pickAccount(accounts, args.account)]
      : accounts.filter(
          (a) => CASH_ACCOUNT_TYPES.includes(a.type) && !a.archivedAt,
        )
    const rows: string[][] = []
    const pending: string[] = []
    for (const account of selected) {
      const own = imports.filter((i) => i.accountId === account.id)
      const committed = own
        .filter((i) => i.status === 'committed')
        .sort((a, b) =>
          (b.committedAt ?? '').localeCompare(a.committedAt ?? ''),
        )
      const last = committed[0]
      const until = committed
        .map((i) => i.periodEnd)
        .filter((d): d is string => d !== null)
        .sort()
        .at(-1)
      rows.push(
        last
          ? [
              account.name,
              last.committedAt ? parisDay(last.committedAt) : 'n/c',
              `${period(last.periodStart, last.periodEnd)} (${last.fileName}, +${last.counts.inserted})`,
              until ? frenchDate(until) : 'n/c',
              String(committed.length),
            ]
          : [account.name, 'jamais', '—', '—', '0'],
      )
      for (const p of own.filter((i) => i.status === 'pending')) {
        pending.push(
          `- ${account.name} : ${p.fileName}, ${period(p.periodStart, p.periodEnd)}, ${p.counts.new} nouvelle(s), aperçu du ${parisDay(p.createdAt)} (previewId ${p.id})`,
        )
      }
    }
    if (rows.length === 0) {
      return 'Aucun compte courant ou d’épargne ouvert.'
    }
    const lines = [
      table(
        [
          'Compte',
          'Dernier import',
          'Période du dernier import',
          'Relevés jusqu’au',
          'Imports',
        ],
        rows,
      ),
    ]
    if (pending.length > 0) {
      lines.push(
        '',
        'Aperçus en attente (rien d’écrit ; à valider avec commit_bank_import, ils expirent au bout de 24 heures) :',
        ...pending,
      )
    }
    return lines.join('\n')
  },
})
