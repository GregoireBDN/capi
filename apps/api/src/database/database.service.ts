import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '#/config/env'
import * as schema from './schema'

type Db = PostgresJsDatabase<typeof schema>
/** An open database transaction. */
export type DatabaseTransaction = Parameters<
  Parameters<Db['transaction']>[0]
>[0]

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private client: postgres.Sql | undefined
  private _db: PostgresJsDatabase<typeof schema> | undefined

  /**
   * A `DatabaseService` whose `db` is the open transaction `tx` (#435):
   * services built on it run every query inside it, and their own
   * `db.transaction(...)` become savepoints, so a refusal anywhere rolls
   * everything back with `tx`.
   */
  static within(tx: DatabaseTransaction): DatabaseService {
    const scoped = Object.create(DatabaseService.prototype) as DatabaseService
    // The services read `db` only; a transaction answers the same calls.
    Object.defineProperty(scoped, 'db', { value: tx })
    return scoped
  }

  get db(): PostgresJsDatabase<typeof schema> {
    if (!this._db) {
      this.client = postgres(env.DATABASE_URL)
      this._db = drizzle(this.client, { schema })
    }
    return this._db
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
