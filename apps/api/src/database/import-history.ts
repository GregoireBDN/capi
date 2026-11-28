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
import { usersTable } from '#/user/user.schema'
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
    // The history's owner (#559): every row it writes is theirs, for the
    // whole session (one connection).
    const owner = await historyOwner(db, options.user)
    await client`select set_config('app.user_id', ${owner}, false)`
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

async function historyOwner(
  db: ReturnType<typeof drizzle<typeof schema>>,
  email: string | null,
): Promise<string> {
  const users = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
  if (email) {
    const user = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase(),
    )
    if (!user) throw new CliUsageError('No user with this --user email')
    return user.id
  }
  if (users.length !== 1) {
    throw new CliUsageError(
      `--user <email> is required: the instance has ${users.length} users`,
    )
  }
  return users[0].id
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
