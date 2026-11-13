import '#/load-env'
import { Writable } from 'node:stream'
import { sql } from 'drizzle-orm'
import { DrizzleQueryError } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import pinoHttp, { type Options } from 'pino-http'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loggerParams } from '#/config/logger'
import {
  DATABASE_ERROR_MESSAGE,
  MAX_LOGGED_SQL_LENGTH,
  involvesDatabase,
  safeErrorSerializer,
  scrubQueryParams,
  serializeDatabaseError,
} from './safe-error'

/**
 * Database errors never reach the logs with their bound values (#133).
 * Synthetic values only: each one is a marker the log line must not contain.
 */

const LABEL = 'SYNTHETIC-LABEL-SHOP-EXAMPLE'
const AMOUNT = 4242_17
const BALANCE = 1337_99
const TOKEN_HASH = 'synthetic0hash0deadbeef'
const SENSITIVE = [LABEL, String(AMOUNT), String(BALANCE), TOKEN_HASH]

const INSERT_SQL =
  'insert into "transactions" ("label", "amount_cents", "balance_cents") values ($1, $2, $3)'

/** Builds a postgres.js server error as the driver does (`Object.assign`). */
function postgresError(fields: Record<string, string>): postgres.PostgresError {
  const PostgresError = postgres.PostgresError as unknown as new (
    fields: Record<string, string>,
  ) => postgres.PostgresError
  return new PostgresError(fields)
}

function uniqueViolation(): DrizzleQueryError {
  const cause = postgresError({
    message: `duplicate key value violates unique constraint "transactions_label_key"`,
    severity_local: 'ERROR',
    severity: 'ERROR',
    code: '23505',
    detail: `Key (label)=(${LABEL}) already exists.`,
    where: `SQL statement with ${BALANCE}`,
    schema_name: 'public',
    table_name: 'transactions',
    constraint_name: 'transactions_label_key',
    file: 'nbtinsert.c',
    line: '666',
    routine: '_bt_check_unique',
  })
  return new DrizzleQueryError(
    INSERT_SQL,
    [LABEL, AMOUNT, BALANCE, TOKEN_HASH],
    cause,
  )
}

/** A pino logger with the app's configuration, writing to memory. */
function captureLogger() {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString())
      callback()
    },
  })
  const { logger } = pinoHttp(
    { ...(loggerParams.pinoHttp as Options), transport: undefined },
    stream,
  )
  return { logger, lines }
}

function expectNoValue(text: string) {
  for (const value of SENSITIVE) expect(text).not.toContain(value)
}

function expectNoSensitiveValue(text: string) {
  expectNoValue(text)
  expect(text).not.toContain('params')
  expect(text).not.toContain('Failed query')
  expect(text).not.toContain('already exists')
}

describe('involvesDatabase', () => {
  it('spots a database error anywhere in the cause chain', () => {
    expect(involvesDatabase(uniqueViolation())).toBe(true)
    expect(involvesDatabase(uniqueViolation().cause)).toBe(true)
    expect(
      involvesDatabase(
        new Error('import failed', { cause: uniqueViolation() }),
      ),
    ).toBe(true)
  })

  it('leaves other errors alone', () => {
    expect(involvesDatabase(new Error('boom'))).toBe(false)
    expect(
      involvesDatabase(new Error('outer', { cause: new TypeError('inner') })),
    ).toBe(false)
    expect(involvesDatabase('a string')).toBe(false)
    expect(involvesDatabase(undefined)).toBe(false)
  })
})

describe('serializeDatabaseError', () => {
  it('keeps the class, SQL text, Postgres code and object names only', () => {
    const log = serializeDatabaseError(uniqueViolation())

    expect(log).toMatchObject({
      type: 'DrizzleQueryError',
      query: INSERT_SQL,
      cause: {
        type: 'PostgresError',
        code: '23505',
        severity: 'ERROR',
        routine: '_bt_check_unique',
        schema_name: 'public',
        table_name: 'transactions',
        constraint_name: 'transactions_label_key',
      },
    })
    expect(log?.stack).toMatch(/^DrizzleQueryError\n\s+at /)
    expect(log?.cause?.stack).toMatch(/^PostgresError(\n\s+at |$)/)
    expectNoSensitiveValue(JSON.stringify(log))
  })

  it('drops the message of a Postgres error, which can quote a value', () => {
    const cause = postgresError({
      message: `invalid input syntax for type integer: "${LABEL}"`,
      severity: 'ERROR',
      code: '22P02',
      routine: 'pg_strtoint32_safe',
    })
    const log = serializeDatabaseError(
      new DrizzleQueryError('select $1::integer', [LABEL], cause),
    )

    expect(log?.cause?.code).toBe('22P02')
    expectNoSensitiveValue(JSON.stringify(log))
  })

  it('keeps the code of a connection error, not its message', () => {
    const cause = Object.assign(new Error(`connect ECONNREFUSED ${LABEL}`), {
      code: 'ECONNREFUSED',
    })
    const log = serializeDatabaseError(
      new DrizzleQueryError(INSERT_SQL, [LABEL], cause),
    )

    expect(log?.cause).toMatchObject({ type: 'Error', code: 'ECONNREFUSED' })
    expectNoSensitiveValue(JSON.stringify(log))
  })

  it('also strips the message of an app error wrapping a query error', () => {
    const wrapper = new Error(`could not save ${LABEL}`, {
      cause: uniqueViolation(),
    })
    const log = serializeDatabaseError(wrapper)

    expect(log?.type).toBe('Error')
    expect(log?.cause?.type).toBe('DrizzleQueryError')
    expect(log?.cause?.cause?.code).toBe('23505')
    expectNoSensitiveValue(JSON.stringify(log))
  })

  it('truncates very long SQL', () => {
    const query = `insert into "t" values ${'($1), '.repeat(1000)}`
    const log = serializeDatabaseError(new DrizzleQueryError(query, []))

    expect(log?.query).toHaveLength(MAX_LOGGED_SQL_LENGTH + 1)
    expect(log?.query?.endsWith('…')).toBe(true)
  })
})

describe('scrubQueryParams', () => {
  it('redacts the params of a failed query text, up to the stack frames', () => {
    const text = `Error: Failed query: select $1\nparams: ${LABEL},\n${AMOUNT}\n    at fn (file.ts:1:1)`
    expect(scrubQueryParams(text)).toBe(
      'Error: Failed query: select $1\nparams: [redacted]\n    at fn (file.ts:1:1)',
    )
  })

  it('leaves other texts alone', () => {
    expect(scrubQueryParams('params: are fine here')).toBe(
      'params: are fine here',
    )
  })
})

describe('safeErrorSerializer', () => {
  it('returns the standard serialization of non-database errors untouched', () => {
    const standard = { type: 'Error', message: 'boom', stack: 'Error: boom' }
    expect(safeErrorSerializer(standard)).toBe(standard)
    expect(safeErrorSerializer('not an error')).toBe('not an error')
  })
})

describe('app logger (loggerParams)', () => {
  it('logs a failed query without its params, message or detail', () => {
    const { logger, lines } = captureLogger()

    logger.error({ err: uniqueViolation() }, 'Unhandled exception')

    expect(lines).toHaveLength(1)
    expectNoSensitiveValue(lines[0])
    const entry = JSON.parse(lines[0]) as { err: Record<string, unknown> }
    expect(entry.err).toMatchObject({
      type: 'DrizzleQueryError',
      query: INSERT_SQL,
      cause: { code: '23505', constraint_name: 'transactions_label_key' },
    })
    expect(entry.err).not.toHaveProperty('message')
  })

  it('gives a line logged with a query error but no message a safe message', () => {
    const { logger, lines } = captureLogger()

    // pino would otherwise use the error's message as the line's `msg`; the
    // second form is how nestjs-pino's `Logger.error(err)` reaches pino.
    logger.error(uniqueViolation())
    logger.error({ err: uniqueViolation(), context: 'ExceptionHandler' })

    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expectNoSensitiveValue(line)
      expect(JSON.parse(line)).toMatchObject({
        msg: DATABASE_ERROR_MESSAGE,
        err: { type: 'DrizzleQueryError' },
      })
    }
  })

  it('scrubs a failed query text that has left its error', () => {
    const { logger, lines } = captureLogger()
    const original = uniqueViolation()
    // Nest's "wrong contract" path: `logger.error(exception.message, stack)`
    // becomes a plain Error rebuilt from those strings.
    const rebuilt = new Error(original.message)
    rebuilt.stack = original.stack

    logger.error({ err: rebuilt })
    logger.error(original.message)

    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expectNoValue(line)
      expect(line).toContain('params: [redacted]')
    }
    const entry = JSON.parse(lines[0]) as { err: { stack: string } }
    expect(entry.err.stack).toMatch(/params: \[redacted\]\n\s+at /)
  })

  it('logs other errors with message and stack as before', () => {
    const { logger, lines } = captureLogger()

    logger.error({ err: new Error('price provider unreachable') }, 'boom')
    logger.error(new Error('price provider unreachable'))

    const entry = JSON.parse(lines[0]) as { err: Record<string, unknown> }
    expect(entry).toMatchObject({ msg: 'boom' })
    expect(entry.err).toMatchObject({
      type: 'Error',
      message: 'price provider unreachable',
    })
    expect(entry.err.stack).toMatch(
      /^Error: price provider unreachable\n\s+at /,
    )
    // Without a message, the line still takes the error's, as pino does.
    expect(JSON.parse(lines[1])).toMatchObject({
      msg: 'price provider unreachable',
      err: { message: 'price provider unreachable' },
    })
  })
})

describe.skipIf(!process.env.DATABASE_URL)(
  'app logger with a real failed query (database)',
  () => {
    let client: postgres.Sql

    beforeAll(() => {
      client = postgres(process.env.DATABASE_URL!, { max: 1 })
    })

    afterAll(async () => {
      await client.end()
    })

    it('logs neither the bound value nor the Postgres message quoting it', async () => {
      const db = drizzle(client)
      const error = await db
        .execute(sql`select ${LABEL}::integer`)
        .then(() => undefined)
        .catch((caught: unknown) => caught)

      // The raw error does carry the value: this is what must not be logged.
      expect(error).toBeInstanceOf(DrizzleQueryError)
      expect(String((error as Error).message)).toContain(LABEL)

      const { logger, lines } = captureLogger()
      logger.error({ err: error }, 'Unhandled exception')

      expectNoSensitiveValue(lines[0])
      const entry = JSON.parse(lines[0]) as { err: Record<string, unknown> }
      expect(entry.err).toMatchObject({
        type: 'DrizzleQueryError',
        query: 'select $1::integer',
        cause: { type: 'PostgresError', code: '22P02' },
      })
    })
  },
)
