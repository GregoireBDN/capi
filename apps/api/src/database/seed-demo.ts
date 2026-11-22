import '#/load-env'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '#/config/env'
import { assertDemoTarget, DemoTargetError } from './demo/guard'
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  generateDemoData,
  hasExistingData,
  wipeAllData,
} from './demo/demo-data'
import * as schema from './schema'

const USAGE = `Seeds a throwaway database with a test account and synthetic data.

  pnpm db:demo [--reset]

  --reset   empty every table of the database first (all its data is lost)

Refuses the "finances" database, and NODE_ENV=production except on the
staging database named by DEMO_STAGING_DATABASE (#421). Run the migrations
first (pnpm db:migrate with the same DATABASE_URL).`

/**
 * Demo seed for local manual testing (#219):
 *
 *     createdb finances_demo
 *     DATABASE_URL=postgres://user:password@localhost:5432/finances_demo pnpm db:migrate
 *     DATABASE_URL=postgres://user:password@localhost:5432/finances_demo pnpm db:demo --reset
 *
 * `node dist/database/seed-demo.js` where `tsx` is missing. Prints counts
 * and the test credentials only.
 */
async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE)
    return
  }
  const unknown = args.filter((arg) => arg !== '--reset')
  if (unknown.length > 0) {
    console.error(`Unknown option: ${unknown.join(' ')}\n\n${USAGE}`)
    process.exitCode = 2
    return
  }
  const reset = args.includes('--reset')
  const databaseName = assertDemoTarget(
    env.DATABASE_URL,
    process.env.NODE_ENV,
    process.env.DEMO_STAGING_DATABASE || undefined,
  )

  const client = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} })
  try {
    const db = drizzle(client, { schema })
    const result = await db.transaction(async (tx) => {
      if (reset) {
        await wipeAllData(tx)
      } else if (await hasExistingData(tx)) {
        return null
      }
      return generateDemoData(tx)
    })
    if (!result) {
      console.error(
        `"${databaseName}" already has data. Re-run with --reset to wipe it and seed the demo data.`,
      )
      process.exitCode = 1
      return
    }
    const c = result.counts
    console.log(
      `Demo data seeded into "${databaseName}" (bank data until ${result.dataUntil}):`,
    )
    console.log(
      `  ${c.accounts} accounts, ${c.transactions} transactions (${c.manualTransactions} manual, ${c.reviewQueue} to review, ${c.splits} split, ${c.linkedTransferPairs} transfers linked), ${c.imports} imports`,
    )
    console.log(
      `  ${c.snapshots} value snapshots, ${c.cryptoHoldings} crypto holdings, ${c.positionStatements} PEA statements, ${c.rules} rules, ${c.budgets} budget lines, ${c.savingsGoals} savings goals, ${c.recurringItems} recurring items`,
    )
    console.log(
      `\nSign in with:\n  email:    ${DEMO_EMAIL}\n  password: ${DEMO_PASSWORD}`,
    )
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  if (err instanceof DemoTargetError) {
    console.error(err.message)
    process.exit(1)
  }
  console.error(err)
  process.exit(1)
})
