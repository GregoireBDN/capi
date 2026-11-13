import { DrizzleQueryError } from 'drizzle-orm'
import postgres from 'postgres'

/**
 * Privacy-safe logging of database errors (#133).
 *
 * A failed Drizzle query throws a `DrizzleQueryError` whose `message` — and so
 * the first line of its `stack` — is `Failed query: <sql>\nparams: <values>`,
 * and which keeps the values in `params`. Its `cause`, the postgres.js
 * `PostgresError`, carries row values in `detail` (`Key (col)=(value) already
 * exists`, `Failing row contains (...)`) and sometimes in its `message`
 * (`invalid input syntax for type integer: "<value>"`). Bound values can be
 * transaction labels, amounts, balances or token hashes, which must never be
 * logged, so pino's standard serializer (which copies all of these) is replaced
 * for any error whose cause chain involves the database.
 */

/** Longest SQL text kept in a log line (bulk inserts can be huge). */
export const MAX_LOGGED_SQL_LENGTH = 2000

/** How deep a cause chain is followed (guards against cycles). */
const MAX_CAUSE_DEPTH = 5

/**
 * `PostgresError` fields that name things or classify the error, never values.
 * Left out on purpose: `message`, `detail`, `hint`, `where`, `internal_query`,
 * `data`, `position`/`internal_position` and `query`/`parameters` (debug only).
 */
const SAFE_POSTGRES_FIELDS = [
  'code',
  'severity',
  'routine',
  'schema_name',
  'table_name',
  'column_name',
  'type_name',
  'constraint_name',
] as const

/** Serialized shape of an error in a database error chain. */
export interface SafeErrorLog {
  type: string
  /** SQL text with its `$n` placeholders, without the bound values. */
  query?: string
  code?: string
  severity?: string
  routine?: string
  schema_name?: string
  table_name?: string
  column_name?: string
  type_name?: string
  constraint_name?: string
  /** Stack frames only: the first line repeats the (unsafe) message. */
  stack?: string
  cause?: SafeErrorLog
}

function isPostgresError(value: unknown): value is postgres.PostgresError {
  return (
    value instanceof postgres.PostgresError ||
    (value instanceof Error && value.name === 'PostgresError')
  )
}

function isDatabaseError(value: unknown): boolean {
  return value instanceof DrizzleQueryError || isPostgresError(value)
}

/** Whether `err` or any error in its `cause` chain comes from the database. */
export function involvesDatabase(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
    if (isDatabaseError(current)) return true
    if (!(current instanceof Error)) return false
    current = current.cause
  }
  return false
}

function errorType(err: Error): string {
  return typeof err.constructor === 'function' && err.constructor.name
    ? err.constructor.name
    : err.name
}

/**
 * Keeps only the `at ...` frames of a stack, headed by the error type: V8
 * prints the message (here the SQL and its params) before the first frame.
 */
function framesOnly(type: string, stack: unknown): string | undefined {
  if (typeof stack !== 'string') return undefined
  const frames = stack.split('\n').filter((line) => /^\s+at /.test(line))
  return [type, ...frames].join('\n')
}

function truncate(text: string): string {
  return text.length > MAX_LOGGED_SQL_LENGTH
    ? `${text.slice(0, MAX_LOGGED_SQL_LENGTH)}…`
    : text
}

/**
 * Serializes an error of a database error chain to safe fields only: its
 * class, the SQL text (no params), the Postgres code and object names, and its
 * stack frames. Never a message, `params`, `detail` or any other value.
 */
export function serializeDatabaseError(
  err: unknown,
  depth = 0,
): SafeErrorLog | undefined {
  if (!(err instanceof Error)) {
    // A thrown non-Error in the chain: its content is unknown, keep the kind.
    return err === undefined ? undefined : { type: typeof err }
  }

  const type = errorType(err)
  const log: SafeErrorLog = { type }

  if (err instanceof DrizzleQueryError && typeof err.query === 'string') {
    log.query = truncate(err.query)
  }
  if (isPostgresError(err)) {
    for (const field of SAFE_POSTGRES_FIELDS) {
      const value = (err as unknown as Record<string, unknown>)[field]
      if (typeof value === 'string' && value !== '') log[field] = value
    }
  } else {
    // Connection and driver errors (`ECONNREFUSED`, `CONNECTION_CLOSED`, ...)
    // identify themselves by a code; their message is dropped like any other.
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string') log.code = code
  }

  log.stack = framesOnly(type, err.stack)

  if (err.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    log.cause = serializeDatabaseError(err.cause, depth + 1)
  }
  return log
}

/** Line message used instead of a database error's own message. */
export const DATABASE_ERROR_MESSAGE = 'Database query failed'

/** From `\nparams: ` up to the first stack frame, or the end of the text. */
const QUERY_PARAMS = /\nparams: [\s\S]*?(?=\n\s+at |$)/g

/**
 * Removes the params of a `Failed query: <sql>\nparams: <values>` text that
 * has left its `DrizzleQueryError`, e.g. Nest's exception handlers re-logging
 * `exception.message` and `exception.stack` as plain strings.
 */
export function scrubQueryParams(text: string): string {
  return text.includes('Failed query: ')
    ? text.replace(QUERY_PARAMS, '\nparams: [redacted]')
    : text
}

/**
 * pino `err` serializer. pino-http wraps it (`wrapErrorSerializer`), so it
 * receives the output of pino's standard serializer, whose non-enumerable
 * `raw` is the original error. Errors involving the database are re-serialized
 * to safe fields; every other error keeps the standard output (minus the
 * params of a failed query text, should one appear in it).
 */
export function safeErrorSerializer(serialized: unknown): unknown {
  if (serialized === null || typeof serialized !== 'object') return serialized
  const raw = (serialized as { raw?: unknown }).raw ?? serialized
  if (involvesDatabase(raw)) return serializeDatabaseError(raw)

  const standard = serialized as { message?: unknown; stack?: unknown }
  if (typeof standard.message === 'string') {
    standard.message = scrubQueryParams(standard.message)
  }
  if (typeof standard.stack === 'string') {
    standard.stack = scrubQueryParams(standard.stack)
  }
  return serialized
}

/**
 * pino `hooks.logMethod`. Without a message argument pino uses the error's
 * `message` as the line's `msg` (`logger.error(err)`, `logger.error({ err })`,
 * which is also how nestjs-pino's `Logger.error(err)` reaches pino), and the
 * `err` serializer never sees it. Give such lines an explicit message instead:
 * a generic one for database errors, the error's own (params scrubbed) for any
 * other, as pino would have done. String arguments are scrubbed too.
 */
export function safeLogMethod(
  this: unknown,
  args: unknown[],
  method: (...args: unknown[]) => void,
): void {
  const [first, ...rest] = args
  let obj = first
  if (first instanceof Error) obj = { err: first }

  if (obj !== null && typeof obj === 'object' && rest.length === 0) {
    const { err, msg } = obj as { err?: unknown; msg?: unknown }
    if (err instanceof Error && msg === undefined) {
      rest.push(
        involvesDatabase(err)
          ? DATABASE_ERROR_MESSAGE
          : scrubQueryParams(err.message),
      )
    }
  }

  const scrub = (arg: unknown) =>
    typeof arg === 'string' ? scrubQueryParams(arg) : arg
  method.apply(this, [scrub(obj), ...rest.map(scrub)])
}
