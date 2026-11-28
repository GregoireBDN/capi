import { AsyncLocalStorage } from 'node:async_hooks'
import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '#/config/env'
import { setOwner } from './owner-scope'
import * as schema from './schema'

type Db = PostgresJsDatabase<typeof schema>
/** An open database transaction. */
export type DatabaseTransaction = Parameters<
  Parameters<Db['transaction']>[0]
>[0]

/**
 * An owner's transaction (ADR 0009, #557), or a savepoint inside it, that
 * `DatabaseService.db` answers with for everything awaited inside it.
 */
interface Scope {
  tx: DatabaseTransaction
  parent: Scope | null
  /** Cleared once the transaction or savepoint has ended. */
  open: boolean
  /** Savepoints opened on this scope run one after the other. */
  queue: Promise<unknown>
  /** `tx`, whose `transaction(...)` opens a scoped savepoint. */
  view: Db
  /** The user it reads and writes as, kept once it has ended (#559). */
  owner: string
}

const scopes = new AsyncLocalStorage<Scope>()

/** The innermost scope still open, if any: a closed one is never used. */
function current(): Scope | undefined {
  let scope = scopes.getStore()
  while (scope && !scope.open) scope = scope.parent ?? undefined
  return scope
}

function isWithin(scope: Scope, ancestor: Scope): boolean {
  for (let s: Scope | null = scope; s; s = s.parent) {
    if (s === ancestor) return true
  }
  return false
}

function openScope(
  tx: DatabaseTransaction,
  parent: Scope | null,
  owner: string,
): Scope {
  const scope = {
    tx,
    parent,
    open: true,
    queue: Promise.resolve(),
    owner,
  } as Scope
  const view = Object.create(tx) as Db & {
    transaction: Db['transaction']
  }
  // A savepoint opens on the innermost open scope: from inside a savepoint,
  // a call through an outer handle nests instead of waiting for itself.
  view.transaction = ((fn: (tx: DatabaseTransaction) => Promise<unknown>) => {
    const inner = current()
    return savepoint(inner && isWithin(inner, scope) ? inner : scope, fn)
  }) as Db['transaction']
  scope.view = view
  return scope
}

/**
 * A savepoint on `scope`. Two opened side by side (a `Promise.all`) would
 * interleave on the one connection and release each other, so they wait in
 * turn; inside it, `db` is the savepoint.
 */
function savepoint<T>(
  scope: Scope,
  fn: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  const run: Promise<T> = scope.queue.then(() =>
    scope.tx.transaction(async (sp) => {
      const inner = openScope(sp, scope, scope.owner)
      try {
        return await scopes.run(inner, () =>
          fn(inner.view as unknown as DatabaseTransaction),
        )
      } finally {
        inner.open = false
      }
    }),
  )
  scope.queue = run.catch(() => undefined)
  return run
}

type Client = Pick<postgres.Sql, 'unsafe'>

/**
 * `begin` and `savepoint` for a reserved connection (postgres.js has none
 * there), as Drizzle calls them. Transactions opened side by side wait in
 * turn: two on one connection would mix their statements.
 */
function transactionsOn(connection: postgres.ReservedSql) {
  let queue: Promise<unknown> = Promise.resolve()
  let savepoints = 0
  const client = (): Client & { savepoint: typeof savepoint } => ({
    unsafe: ((query: string, params?: never[]) =>
      connection.unsafe(query, params)) as Client['unsafe'],
    savepoint,
  })
  async function within<T>(
    open: string,
    close: string,
    undo: string,
    fn: (client: Client) => Promise<T>,
  ): Promise<T> {
    await connection.unsafe(open)
    try {
      const result = await fn(client())
      await connection.unsafe(close)
      return result
    } catch (error) {
      await connection.unsafe(undo)
      throw error
    }
  }
  function savepoint<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const name = `capi_sp_${++savepoints}`
    return within(
      `savepoint ${name}`,
      `release savepoint ${name}`,
      `rollback to savepoint ${name}`,
      fn,
    )
  }
  function begin<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const run = queue.then(() => within('begin', 'commit', 'rollback', fn))
    queue = run.catch(() => undefined)
    return run
  }
  return { begin }
}

/**
 * Runs `fn` outside any owner's transaction, on the connection pool: work
 * that outlives the request that started it (a wallet sync, the daily
 * close) or that writes global data (prices), so it neither uses a
 * transaction about to end nor holds the request's locks.
 */
export function outsideOwnerScope<T>(fn: () => T): T {
  return scopes.exit(fn)
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private client: postgres.Sql | undefined
  private _db: Db | undefined
  /** Set by `within`: `db` is always this transaction. */
  private fixed: Db | undefined

  /**
   * A `DatabaseService` whose `db` is the open transaction `tx` (#435):
   * services built on it run every query inside it, and their own
   * `db.transaction(...)` become savepoints, so a refusal anywhere rolls
   * everything back with `tx`.
   */
  static within(tx: DatabaseTransaction): DatabaseService {
    const scoped = Object.create(DatabaseService.prototype) as DatabaseService
    // The services read `db` only; a transaction answers the same calls.
    scoped.fixed = tx as unknown as Db
    return scoped
  }

  /**
   * The current owner's transaction inside `asOwner` (every authenticated
   * request, `OwnerScopeInterceptor`), else the connection pool.
   */
  get db(): Db {
    if (this.fixed) return this.fixed
    return current()?.view ?? this.pool
  }

  private get pool(): Db {
    if (!this._db) {
      this.client = postgres(env.DATABASE_URL)
      this._db = drizzle(this.client, { schema })
    }
    return this._db
  }

  /**
   * Runs `fn` in one transaction that reads and writes as `userId` (ADR
   * 0009, #557): `app.user_id` is set for it, and `db` is that transaction
   * for everything `fn` awaits, so the services' own transactions become
   * savepoints and a failure anywhere rolls the whole of it back. Always a
   * new transaction from the pool, even inside another owner's.
   */
  async asOwner<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    if (this.fixed) {
      // Specs: a savepoint of their rolled-back transaction.
      return this.fixed.transaction(async (tx) => {
        await setOwner(tx, userId)
        return fn()
      })
    }
    return this.pool.transaction(async (tx) => {
      await setOwner(tx, userId)
      const scope = openScope(tx, null, userId)
      try {
        const result = await scopes.run(scope, fn)
        // A failed query whose error was caught leaves the transaction
        // aborted, and Postgres would answer COMMIT with a silent rollback:
        // this fails instead (25P02), so nothing reports a write it lost.
        await tx.execute(sql`select 1`)
        return result
      } finally {
        scope.open = false
      }
    })
  }

  /**
   * Runs `fn`, which outlives the request that started it (a wallet sync,
   * the valuation after it), as the request's user (#559) but outside its
   * transaction: on a connection of its own with `app.user_id` set for the
   * session, each statement committed as it goes, so its progress is kept
   * when it fails. Outside any request (or in specs), `fn` runs on the pool.
   */
  outsideRequest<T>(fn: () => Promise<T>): Promise<T> {
    const owner = scopes.getStore()?.owner
    return outsideOwnerScope(() =>
      owner && !this.fixed ? this.onOwnConnection(owner, fn) : fn(),
    )
  }

  private async onOwnConnection<T>(
    userId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    void this.pool
    const connection = await this.client!.reserve()
    let scope: Scope | undefined
    try {
      await connection`select set_config('app.user_id', ${userId}, false)`
      // A reserved connection has no `options` nor `begin` of its own:
      // Drizzle reads the pool's options (its type parsers, already set up),
      // and transactions are opened by hand on the connection.
      Object.assign(connection, {
        options: this.client!.options,
        ...transactionsOn(connection),
      })
      const db = drizzle(connection, { schema })
      scope = {
        tx: db as unknown as DatabaseTransaction,
        parent: null,
        open: true,
        queue: Promise.resolve(),
        view: db,
        owner: userId,
      }
      return await scopes.run(scope, fn)
    } finally {
      if (scope) scope.open = false
      // Back to the pool without an owner.
      await connection`select set_config('app.user_id', '', false)`.catch(
        () => undefined,
      )
      connection.release()
    }
  }

  /** Lightweight round-trip used by the health check to confirm the DB answers. */
  async ping(): Promise<void> {
    await this.db.execute(sql`SELECT 1`)
  }

  /**
   * Drain the Postgres connection pool on shutdown. Wired up via
   * `app.enableShutdownHooks()` so SIGTERM/SIGINT close connections cleanly
   * instead of leaving them dangling.
   */
  async onModuleDestroy(): Promise<void> {
    await this.client?.end()
  }
}
