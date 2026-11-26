import { asc, inArray, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { AccountsService } from '#/accounts/accounts.service'
import type * as schema from '#/database/schema'
import {
  BANK_ACCOUNT_TYPES,
  envelopeMovementsTable,
  envelopesTable,
  savingsGoalAccountsTable,
  savingsGoalsTable,
} from '#/database/schema'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export interface GoalConversion {
  goalId: string
  /** The envelope keeps the goal's id. */
  envelopeId: string
  /** What was set aside, all accounts. */
  placedCents: number
  /**
   * What a manual goal said it held and no bank account had « libre » for:
   * reported, never invented.
   */
  unplacedCents: number
}

/**
 * Converts the savings goals into envelopes (ADR 0008 §13), run by #430 when
 * the Épargne page stops editing goals. Each goal becomes an envelope with
 * the same id, name, colour, target, due date and archive state, in one
 * database transaction (`tx`). Goals are taken by due date (none last),
 * so a shared account serves the nearest goal first, and never more than an
 * account has « libre »:
 *
 * - an `accounts` goal takes, on each linked account in order, what the
 *   account still has « libre », up to what the goal still misses of its
 *   target;
 * - a `manual` goal places its typed amount on the bank account (checking,
 *   savings, open) with the most « libre »; what no account can hold is
 *   returned as `unplacedCents`.
 *
 * Goals already converted (an envelope with their id) are skipped, so it
 * can run again. The goals themselves are left for #430 to drop.
 */
export async function convertSavingsGoals(
  tx: Tx,
  accounts: AccountsService,
  today: string,
): Promise<GoalConversion[]> {
  const g = savingsGoalsTable
  const goals = await tx
    .select()
    .from(g)
    .where(
      sql`not exists (select 1 from ${envelopesTable} e where e.id = ${g.id})`,
    )
    .orderBy(sql`${g.targetDate} asc nulls last`, asc(g.createdAt), asc(g.id))
  if (goals.length === 0) return []

  const [links, list, allocated] = await Promise.all([
    tx
      .select({
        goalId: savingsGoalAccountsTable.goalId,
        accountId: savingsGoalAccountsTable.accountId,
      })
      .from(savingsGoalAccountsTable)
      .where(
        inArray(
          savingsGoalAccountsTable.goalId,
          goals.map((goal) => goal.id),
        ),
      ),
    accounts.list({ includeArchived: true }, tx),
    tx
      .select({
        accountId: envelopeMovementsTable.accountId,
        cents:
          sql<number>`sum(${envelopeMovementsTable.amountCents})::bigint`.mapWith(
            Number,
          ),
      })
      .from(envelopeMovementsTable)
      .groupBy(envelopeMovementsTable.accountId),
  ])
  const order = new Map(list.map((account, index) => [account.id, index]))
  const free = new Map(
    list.map((account) => [account.id, account.balanceCents ?? 0]),
  )
  for (const row of allocated) {
    free.set(row.accountId, (free.get(row.accountId) ?? 0) - row.cents)
  }
  const banks = list.filter(
    (account) =>
      (BANK_ACCOUNT_TYPES as readonly string[]).includes(account.type) &&
      account.archivedAt === null,
  )

  const out: GoalConversion[] = []
  for (const goal of goals) {
    await tx.insert(envelopesTable).values({
      id: goal.id,
      name: goal.name,
      color: goal.color,
      targetCents: goal.targetCents,
      dueDate: goal.targetDate,
      archivedAt: goal.archivedAt,
      createdAt: goal.createdAt,
    })
    const placements: { accountId: string; amountCents: number }[] = []
    let unplacedCents = 0
    if (goal.source === 'manual') {
      const wanted = goal.manualAmountCents ?? 0
      const best = [...banks].sort(
        (a, b) => (free.get(b.id) ?? 0) - (free.get(a.id) ?? 0),
      )[0]
      const room = best ? Math.max(0, free.get(best.id) ?? 0) : 0
      const placed = Math.min(wanted, room)
      if (placed > 0)
        placements.push({ accountId: best!.id, amountCents: placed })
      unplacedCents = wanted - placed
    } else {
      let missing = goal.targetCents
      const linked = links
        .filter((link) => link.goalId === goal.id)
        .map((link) => link.accountId)
        .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      for (const accountId of linked) {
        const take = Math.min(missing, Math.max(0, free.get(accountId) ?? 0))
        if (take <= 0) continue
        placements.push({ accountId, amountCents: take })
        missing -= take
      }
    }
    for (const placement of placements) {
      free.set(
        placement.accountId,
        (free.get(placement.accountId) ?? 0) - placement.amountCents,
      )
    }
    if (placements.length > 0) {
      await tx.insert(envelopeMovementsTable).values(
        placements.map((placement) => ({
          envelopeId: goal.id,
          accountId: placement.accountId,
          amountCents: placement.amountCents,
          onDate: today,
          reason: 'start' as const,
          note: 'Objectif d’épargne converti',
        })),
      )
    }
    out.push({
      goalId: goal.id,
      envelopeId: goal.id,
      placedCents: placements.reduce((s, p) => s + p.amountCents, 0),
      unplacedCents,
    })
  }
  return out
}
