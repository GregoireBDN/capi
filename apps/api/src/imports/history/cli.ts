import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import type { HistoryImportResult } from './history-import'

/**
 * Command-line plumbing of `pnpm --filter @finances/api import:history`:
 * argument parsing, path checks and the printed summary. The summary holds
 * counts, codes and slugs only; merchant keys, line numbers and conflict
 * details go to the optional JSON report, meant for the git-ignored `data/`
 * folder.
 */

export const USAGE = `Usage: pnpm --filter @finances/api import:history -- --transactions <file.csv> [options]

Imports the spreadsheet history export. Dry run unless --commit is given.

Options:
  --transactions <path>   CSV export of the Transactions tab (required)
  --balances <path>       CSV export of the Soldes tab (month-end balances)
  --accounts <path>       JSON account mapping, merged over the defaults
                          (CC = Compte courant, LA = Livret A, LJ = Livret Jeune)
  --categories <path>     JSON category overrides { "sheet_slug": "category_slug" | null }
  --commit                Write to the database (default: dry run, rolled back)
  --create-rules          Create the proposed categorization rules
  --include-conflicts     Also insert rows that probably duplicate an existing
                          transaction from another source (flagged for review)
  --report <path>         Write a detailed JSON report (inside the repo: only
                          under data/)
  --help                  Show this help`

export interface CliOptions {
  transactions: string
  balances: string | null
  accounts: string | null
  categories: string | null
  report: string | null
  commit: boolean
  createRules: boolean
  includeConflicts: boolean
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
  }
}

/**
 * Parses the arguments (without `node` and the script). A leading `--`, which
 * `pnpm run` may forward, is ignored. Relative paths are resolved against
 * `baseDir` (pnpm's `INIT_CWD`, the directory the command was typed in).
 *
 * @returns null when `--help` is given.
 * @throws {CliUsageError} on unknown or missing arguments.
 */
export function parseCliArgs(
  argv: readonly string[],
  baseDir: string,
): CliOptions | null {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv]
  let values: ReturnType<typeof parse>['values']
  try {
    values = parse(args).values
  } catch (error) {
    throw new CliUsageError(
      error instanceof Error ? error.message : String(error),
    )
  }
  if (values.help) return null
  if (!values.transactions) {
    throw new CliUsageError('--transactions <path> is required')
  }
  const path = (p: string | undefined) => (p ? resolve(baseDir, p) : null)
  return {
    transactions: resolve(baseDir, values.transactions),
    balances: path(values.balances),
    accounts: path(values.accounts),
    categories: path(values.categories),
    report: path(values.report),
    commit: values.commit ?? false,
    createRules: values['create-rules'] ?? false,
    includeConflicts: values['include-conflicts'] ?? false,
  }
}

function parse(args: string[]) {
  return parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      transactions: { type: 'string' },
      balances: { type: 'string' },
      accounts: { type: 'string' },
      categories: { type: 'string' },
      report: { type: 'string' },
      commit: { type: 'boolean' },
      'create-rules': { type: 'boolean' },
      'include-conflicts': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  })
}

/**
 * Error message safe to print: Drizzle query errors embed the query
 * parameters (labels, amounts), so only the database's own message is kept.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unexpected error'
  if (error.message.startsWith('Failed query:')) {
    const cause = error.cause
    const code =
      cause && typeof cause === 'object' && 'code' in cause
        ? ` (${String(cause.code)})`
        : ''
    return `Database error${code}: ${cause instanceof Error ? cause.message : 'query failed'}`
  }
  return error.message
}

/** Closest ancestor of `start` holding `pnpm-workspace.yaml`, if any. */
export function findRepoRoot(start: string): string | null {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Refuses a report path inside the repository unless it is under its
 * git-ignored `data/` folder: the report holds merchant names. Symlinks of
 * the existing part of the path are resolved first.
 *
 * @throws {CliUsageError} when the path is not allowed.
 */
export function assertReportPathAllowed(
  reportPath: string,
  repoRoot: string | null,
): void {
  if (!repoRoot) return
  const root = realpath(repoRoot)
  const target = realpath(reportPath)
  if (!isInside(root, target)) return
  if (isInside(join(root, 'data'), target) && target !== join(root, 'data')) {
    return
  }
  throw new CliUsageError(
    'Refusing to write the report inside the repository outside data/: it contains private data. Use a path under data/ (git-ignored).',
  )
}

/** `realpath` of the longest existing prefix, plus the rest as given. */
function realpath(path: string): string {
  const absolute = resolve(path)
  let existing = absolute
  const rest: string[] = []
  while (!existsSync(existing)) {
    const parent = dirname(existing)
    if (parent === existing) return absolute
    rest.unshift(existing.slice(parent.length).replace(/^[\\/]/, ''))
    existing = parent
  }
  return join(realpathSync(existing), ...rest)
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (rel.split(sep)[0] !== '..' && !isAbsolute(rel))
}

/** Printed summary: counts, account codes and category slugs only. */
export function formatSummary(
  result: HistoryImportResult,
  options: Pick<CliOptions, 'commit' | 'createRules' | 'includeConflicts'>,
): string {
  const lines: string[] = []
  lines.push(
    options.commit
      ? 'Spreadsheet history import: COMMITTED'
      : 'Spreadsheet history import: DRY RUN (nothing written, use --commit to write)',
  )
  lines.push('')
  lines.push(
    `Transactions file: ${result.rows} valid rows, ${result.parseIssues.length} skipped lines`,
  )
  for (const { code, rows } of result.unmappedAccountCodes) {
    lines.push(
      `  account code ${code}: ${rows} rows skipped (no account mapping)`,
    )
  }

  lines.push('')
  lines.push('Accounts:')
  if (result.accounts.length === 0) lines.push('  (none)')
  for (const a of result.accounts) {
    lines.push(
      `  ${a.code} → ${a.name}${a.created ? ' (created)' : ''}: ${a.rows} rows, ${a.new} new, ${a.duplicate} duplicate, ${a.conflict} conflict${a.conflict === 1 ? '' : 's'}, ${a.inserted} inserted${a.periodStart ? ` [${a.periodStart} … ${a.periodEnd}]` : ''}`,
    )
  }
  const conflicts = result.conflicts.length
  if (conflicts > 0) {
    lines.push(
      options.includeConflicts
        ? `  ${conflicts} conflicts inserted anyway and flagged for review (--include-conflicts)`
        : `  ${conflicts} conflicts NOT inserted (probable duplicates of existing transactions; see --report, or --include-conflicts)`,
    )
  }
  lines.push(`  ${result.needsReview} inserted rows flagged for review`)
  if (result.transfersLinked > 0) {
    lines.push(
      `  ${result.transfersLinked} transfers between cash accounts linked (both sides)`,
    )
  }

  lines.push('')
  lines.push('Category mapping (sheet slug → category, kind: rows):')
  for (const m of result.categoryMapping) {
    lines.push(
      `  ${m.sheetSlug ?? '(empty)'} → ${m.categorySlug ?? '(none)'}, ${m.kind}: ${m.count}`,
    )
  }
  const reasons = Object.entries(result.reviewReasons)
  if (reasons.length > 0) {
    lines.push('Review reasons (all rows):')
    for (const [reason, count] of reasons) lines.push(`  ${reason}: ${count}`)
  }
  if (result.unmappedCategories.length > 0) {
    lines.push(
      `Unmapped sheet categories: ${result.unmappedCategories.map((c) => `${c.sheetSlug} (${c.rows})`).join(', ')}`,
    )
  }
  if (result.unknownGroups.length > 0) {
    lines.push(
      `Unknown Groupe values: ${result.unknownGroups.length} distinct, ${result.unknownGroups.reduce((n, g) => n + g.rows, 0)} rows (see --report)`,
    )
  }

  lines.push('')
  if (result.snapshots) {
    const s = result.snapshots
    lines.push(
      `Balance snapshots: ${s.inserted} new, ${s.updated} updated, ${s.unchanged} unchanged; ${result.balanceParseIssues.length} skipped cells/lines`,
    )
    for (const a of s.perAccount) {
      lines.push(`  ${a.code} → ${a.name}: ${a.snapshots} months`)
    }
    if (s.unmappedColumns.length > 0) {
      lines.push(
        `  unmapped columns (skipped): ${s.unmappedColumns.join(', ')}`,
      )
    }
  } else {
    lines.push('Balance snapshots: no --balances file')
  }

  lines.push('')
  const r = result.rules
  lines.push(
    `Rules: ${r.proposed.length} proposed, ${r.created} created${options.createRules ? '' : ' (use --create-rules to create them)'}; ${r.skippedCovered} already covered, ${r.skippedTooBroad} too broad`,
  )
  return lines.join('\n')
}

/**
 * Detailed report for `--report`. Contains merchant keys and line numbers
 * (never raw labels or amounts), so it must stay in the git-ignored `data/`.
 */
export function buildReport(
  result: HistoryImportResult,
  options: Pick<CliOptions, 'commit' | 'createRules' | 'includeConflicts'>,
) {
  return {
    generatedAt: new Date().toISOString(),
    mode: options.commit ? 'commit' : 'dry-run',
    options,
    rows: result.rows,
    // A dry run rolled back the imports and the accounts it created.
    accounts: options.commit
      ? result.accounts
      : result.accounts.map((a) => ({
          ...a,
          accountId: a.created ? null : a.accountId,
          importId: null,
        })),
    unmappedAccountCodes: result.unmappedAccountCodes,
    needsReview: result.needsReview,
    reviewReasons: result.reviewReasons,
    categoryMapping: result.categoryMapping,
    unmappedCategories: result.unmappedCategories,
    unknownGroups: result.unknownGroups,
    conflicts: result.conflicts,
    snapshots: result.snapshots,
    rules: result.rules,
    parseIssues: result.parseIssues,
    balanceParseIssues: result.balanceParseIssues,
  }
}
