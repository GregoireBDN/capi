import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common'
import '#/load-env'
import { Writable } from 'node:stream'
import { DrizzleQueryError } from 'drizzle-orm'
import type { PinoLogger } from 'nestjs-pino'
import pinoHttp, { type Options } from 'pino-http'
import postgres from 'postgres'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loggerParams } from '#/config/logger'
import {
  AllExceptionsFilter,
  type ErrorResponse,
} from './all-exceptions.filter'

function createHost(requestId = 'req-123', url = '/api/widgets') {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  }
  const request = { id: requestId, url }
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost
  return { host, reply }
}

describe('AllExceptionsFilter', () => {
  let logger: {
    error: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
    setContext: ReturnType<typeof vi.fn>
  }
  let filter: AllExceptionsFilter

  beforeEach(() => {
    logger = { error: vi.fn(), warn: vi.fn(), setContext: vi.fn() }
    filter = new AllExceptionsFilter(logger as unknown as PinoLogger)
  })

  function captureBody(reply: {
    send: ReturnType<typeof vi.fn>
  }): ErrorResponse {
    return reply.send.mock.calls[0][0] as ErrorResponse
  }

  it('normalises an HttpException into the uniform envelope', () => {
    const { host, reply } = createHost()

    filter.catch(new NotFoundException('User 42 not found'), host)

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND)
    const body = captureBody(reply)
    expect(body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      message: ['User 42 not found'],
      requestId: 'req-123',
      path: '/api/widgets',
    })
    expect(body.timestamp).toEqual(expect.any(String))
    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('preserves ValidationPipe message arrays', () => {
    const { host, reply } = createHost()

    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['email must be an email', 'password is too short'],
        error: 'Bad Request',
      }),
      host,
    )

    const body = captureBody(reply)
    expect(body.statusCode).toBe(400)
    expect(body.error).toBe('Bad Request')
    expect(body.message).toEqual([
      'email must be an email',
      'password is too short',
    ])
  })

  it('hides internals behind a generic 500 for unexpected faults', () => {
    const { host, reply } = createHost()
    const boom = new Error('connection string leaked secret')

    filter.catch(boom, host)

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    const body = captureBody(reply)
    expect(body.message).toEqual(['Internal server error'])
    expect(body.error).toBe('Internal Server Error')
    // The original error is logged (with stack) but never sent to the client.
    expect(logger.error).toHaveBeenCalledOnce()
    expect(JSON.stringify(body)).not.toContain('leaked secret')
    // The log line carries the exception and the correlation id.
    expect(logger.error).toHaveBeenCalledWith(
      { err: boom, requestId: 'req-123', path: '/api/widgets' },
      'Unhandled exception',
    )
  })

  it('logs expected 4xx client errors at warn, never at error', () => {
    const { host } = createHost()

    filter.catch(new NotFoundException('nope'), host)

    expect(logger.warn).toHaveBeenCalledWith(
      { requestId: 'req-123', path: '/api/widgets', statusCode: 404 },
      'nope',
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('echoes the correlation id from the request', () => {
    const { host, reply } = createHost('abc-789')

    filter.catch(new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT), host)

    expect(captureBody(reply).requestId).toBe('abc-789')
  })
})

/**
 * The filter's 500 log line as written by a pino logger configured with the
 * app's serializers (#133). Synthetic values only.
 */
describe('AllExceptionsFilter log lines', () => {
  const LABEL = 'SYNTHETIC-LABEL-SHOP-EXAMPLE'
  const AMOUNT = 4242_17
  const BALANCE = 1337_99

  function logOnce(exception: unknown): Record<string, unknown> {
    const lines: string[] = []
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString())
        callback()
      },
    })
    const { logger: pino } = pinoHttp(
      { ...(loggerParams.pinoHttp as Options), transport: undefined },
      stream,
    )
    const logger = {
      setContext: vi.fn(),
      warn: vi.fn(),
      error: (obj: object, msg: string) => pino.error(obj, msg),
    }
    const filter = new AllExceptionsFilter(logger as unknown as PinoLogger)

    filter.catch(exception, createHost().host)

    expect(lines).toHaveLength(1)
    return JSON.parse(lines[0]) as Record<string, unknown>
  }

  it('logs a failed query without its params, message or Postgres detail', () => {
    const PostgresError = postgres.PostgresError as unknown as new (
      fields: Record<string, string>,
    ) => Error
    const cause = new PostgresError({
      message: `new row for relation "transactions" violates check constraint "amount_check"`,
      severity: 'ERROR',
      code: '23514',
      detail: `Failing row contains (${LABEL}, ${AMOUNT}, ${BALANCE}).`,
      table_name: 'transactions',
      constraint_name: 'amount_check',
    })
    const query =
      'insert into "transactions" ("label", "amount_cents", "balance_cents") values ($1, $2, $3)'

    const entry = logOnce(
      new DrizzleQueryError(query, [LABEL, AMOUNT, BALANCE], cause),
    )

    const line = JSON.stringify(entry)
    for (const value of [LABEL, String(AMOUNT), String(BALANCE)]) {
      expect(line).not.toContain(value)
    }
    expect(line).not.toContain('Failed query')
    expect(line).not.toContain('Failing row')
    expect(entry).toMatchObject({
      msg: 'Unhandled exception',
      requestId: 'req-123',
      path: '/api/widgets',
      err: {
        type: 'DrizzleQueryError',
        query,
        cause: {
          type: 'PostgresError',
          code: '23514',
          table_name: 'transactions',
          constraint_name: 'amount_check',
        },
      },
    })
    expect((entry.err as { stack: string }).stack).toMatch(
      /^DrizzleQueryError\n\s+at /,
    )
  })

  it('still logs other 500s with their message and stack', () => {
    const entry = logOnce(new Error('connection string leaked secret'))

    expect(entry).toMatchObject({
      msg: 'Unhandled exception',
      requestId: 'req-123',
      err: { type: 'Error', message: 'connection string leaked secret' },
    })
    expect((entry.err as { stack: string }).stack).toMatch(
      /^Error: connection string leaked secret\n\s+at /,
    )
  })
})
