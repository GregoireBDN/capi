import '#/load-env'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '#/config/env'
import {
  assertReportPathAllowed,
  buildReport,
  CliUsageError,
  describeError,
  findRepoRoot,
  formatSummary,
  parseCliArgs,
  USAGE,
} from '#/imports/history/cli'
import {
  decodeUtf8,
  parseHistoryBalancesCsv,
  parseHistoryTransactionsCsv,
} from '#/imports/history/history-csv.parser'
import { runHistoryImport } from '#/imports/history/history-import'
import { RecurringService } from '#/recurring/recurring.service'
import {
  parseAccountMapping,
  parseCategoryOverrides,
} from '#/imports/history/mapping'
import * as schema from './schema'

/**
 * One-shot import of the spreadsheet history (#13):
 *
 *     pnpm --filter @capi/api import:history -- \
 *       --transactions ../../data/transactions.csv --balances ../../data/soldes.csv
 *
 * Dry run unless `--commit` is given. Prints counts only; see `--help`.
 */
async function main() {
  const baseDir = process.env.INIT_CWD ?? process.cwd()
  const options = parseCliArgs(process.argv.slice(2), baseDir)
  if (!options) {
    console.log(USAGE)
    return
  }
  if (options.report) {
    assertReportPathAllowed(options.report, findRepoRoot(process.cwd()))
  }

  const transactionsBytes = readInput(options.transactions, '--transactions')
  const transactions = parseHistoryTransactionsCsv(
    decodeUtf8(transactionsBytes),
  )
  const balances = options.balances
    ? parseHistoryBalancesCsv(
        decodeUtf8(readInput(options.balances, '--balances')),
      )
    : null
  const accountSpecs = options.accounts
    ? parseAccountMapping(
        readInput(options.accounts, '--accounts').toString('utf8'),
      )
    : undefined
  const categoryMappings = options.categories
    ? parseCategoryOverrides(
        readInput(options.categories, '--categories').toString('utf8'),
      )
    : undefined

  const client = postgres(env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL, {
    max: 1,
    onnotice: () => {},
  })
  try {
    const db = drizzle(client, { schema })
    const result = await runHistoryImport(
      db,
      {
        transactions,
        transactionsFile: {
          name: basename(options.transactions),
          sha256: createHash('sha256').update(transactionsBytes).digest('hex'),
        },
        balances,
        accountSpecs,
        categoryMappings,
        includeConflicts: options.includeConflicts,
        createRules: options.createRules,
      },
      { commit: options.commit },
    )

    console.log(formatSummary(result, options))
    if (options.commit) {
      // The history may hold years of rent, subscriptions and salaries: find
      // the recurring series now, as a bank import does, so Abonnements isn't
      // empty until "Analyser mes opérations" is pressed (#214).
      const recurring = await new RecurringService({ db } as never).detect()
      console.log(
        `Recurring detection: ${recurring.createdCount} new suggestion(s)`,
      )
    }
    if (options.report) {
      mkdirSync(dirname(options.report), { recursive: true })
      writeFileSync(
        options.report,
        `${JSON.stringify(buildReport(result, options), null, 2)}\n`,
        { mode: 0o600 },
      )
      console.log(`\nDetailed report written to ${options.report}`)
    }
  } finally {
    await client.end()
  }
}

function readInput(path: string, flag: string): Buffer {
  try {
    return readFileSync(path)
  } catch {
    throw new CliUsageError(`Cannot read the ${flag} file`)
  }
}

main().catch((error: unknown) => {
  console.error(`Error: ${describeError(error)}`)
  if (error instanceof CliUsageError) console.error(`\n${USAGE}`)
  process.exit(1)
})
