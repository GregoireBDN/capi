import '#/load-env'
import { randomUUID } from 'node:crypto'
import type { CallHandler, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { sql } from 'drizzle-orm'
import { defer, lastValueFrom } from 'rxjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DatabaseService, outsideOwnerScope } from '#/database/database.service'
import { OwnerScopeInterceptor } from './owner-scope.interceptor'

/**
 * The owner's transaction of each request (ADR 0009, #557). Writes go to a
 * table of this spec only, dropped at the end; no user row is needed.
 */
describe.skipIf(!process.env.DATABASE_URL)('owner scope (#557)', () => {
  const database = new DatabaseService()
  const table = sql.raw(`spec_owner_scope_${randomUUID().slice(0, 8)}`)
  const owner = randomUUID()

  beforeAll(async () => {
    await database.db.execute(sql`create table ${table} (label text unique)`)
  })

  afterAll(async () => {
    await database.db.execute(sql`drop table ${table}`)
    await database.onModuleDestroy()
  })

  const ownerSetting = async () => {
    const [row] = await database.db.execute<{ owner: string | null }>(
      sql`select nullif(current_setting('app.user_id', true), '') as owner`,
    )
    return row.owner
  }
  const insert = (label: string, db = database.db) =>
    db.execute(sql`insert into ${table} values (${label})`)
  const labels = async () =>
    (
      await database.db.execute<{ label: string }>(
        sql`select label from ${table} order by label`,
      )
    ).map((row) => row.label)
  const clear = () => database.db.execute(sql`delete from ${table}`)

  it('runs as the owner, and only inside', async () => {
    expect(await database.asOwner(owner, ownerSetting)).toBe(owner)
    expect(await ownerSetting()).toBeNull()
    expect(
      await database.asOwner(owner, () => outsideOwnerScope(ownerSetting)),
    ).toBeNull()
  })

  it('rolls the whole of it back on a failure', async () => {
    await clear()
    await expect(
      database.asOwner(owner, async () => {
        await insert('kept-until-failure')
        throw new Error('refused')
      }),
    ).rejects.toThrow('refused')
    expect(await labels()).toEqual([])
  })

  it('fails rather than lose writes when a failed query was caught', async () => {
    await clear()
    await expect(
      database.asOwner(owner, async () => {
        await insert('lost')
        await insert('lost').catch(() => undefined)
      }),
    ).rejects.toMatchObject({ cause: { code: '25P02' } })
    expect(await labels()).toEqual([])
  })

  it('keeps savepoints side by side apart, and nested ones working', async () => {
    await clear()
    const outcome = await database.asOwner(owner, async () => {
      const outer = database.db
      return Promise.allSettled([
        database.db.transaction(async (tx) => {
          await insert('first', tx)
          // Through the outer handle: nests, never waits for itself.
          await outer.transaction(async () => insert('nested'))
        }),
        database.db.transaction(async () => {
          await insert('second')
          await insert('first')
        }),
        database.db.transaction(async () => insert('third')),
      ])
    })
    expect(outcome.map((result) => result.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
    ])
    expect(await labels()).toEqual(['first', 'nested', 'third'])
  })

  it('leaves work that outlives it to the pool', async () => {
    let later: Promise<string | null> | undefined
    await database.asOwner(owner, async () => {
      later = new Promise((resolve) => setTimeout(resolve, 20)).then(
        ownerSetting,
      )
    })
    expect(await later).toBeNull()
  })

  describe('interceptor', () => {
    const interceptor = new OwnerScopeInterceptor(database, new Reflector())
    const context = (user?: { sub: string }) =>
      ({
        getType: () => 'http',
        getHandler: () => () => undefined,
        getClass: () => class {},
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      }) as unknown as ExecutionContext
    const handler: CallHandler = { handle: () => defer(ownerSetting) }

    it("runs a signed-in request in its user's transaction", async () => {
      await expect(
        lastValueFrom(interceptor.intercept(context({ sub: owner }), handler)),
      ).resolves.toBe(owner)
    })

    it('leaves anonymous requests on the pool', async () => {
      await expect(
        lastValueFrom(interceptor.intercept(context(), handler)),
      ).resolves.toBeNull()
    })
  })
})
