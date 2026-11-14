import { Controller, Get, Param } from '@nestjs/common'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { LoggerModule } from 'nestjs-pino'
import { Writable } from 'node:stream'
import type { Options } from 'pino-http'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createFastifyAdapter } from './fastify-adapter'
import { loggerParams, logSerializers } from './logger'

/**
 * The request log line keeps no query string (#181): the transactions search
 * text (`?q=`), ids and amount filters stay out of the logs, whether in the
 * URL, the decoded query or the page URL of the `Referer`.
 */

const SEARCH = 'SYNTHETIC-SEARCH-TEXT'
const ACCOUNT = 'acc-synthetic-42'

@Controller('transactions')
class ProbeController {
  @Get()
  list() {
    return []
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return { id }
  }
}

describe('API request log', () => {
  let app: NestFastifyApplication
  const lines: string[] = []

  beforeAll(async () => {
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString())
        callback()
      },
    })
    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: [
            {
              ...(loggerParams.pinoHttp as Options),
              level: 'info',
              transport: undefined,
            },
            stream,
          ],
        }),
      ],
      controllers: [ProbeController],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter(),
      { logger: false },
    )
    app.setGlobalPrefix('api')
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    lines.length = 0
  })

  function requestLines() {
    return lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((entry) => entry.req !== undefined)
  }

  it('logs the path, method, request id and status without the query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/transactions?q=${SEARCH}&accountId=${ACCOUNT}&minAmount=4242`,
      headers: {
        'x-request-id': '18181818-1818-4181-8181-181818181818',
        referer: `https://finances.example.test/transactions?q=${SEARCH}`,
      },
    })
    expect(response.statusCode).toBe(200)

    const entries = requestLines()
    expect(entries).toHaveLength(1)
    const raw = JSON.stringify(entries)
    for (const value of [SEARCH, ACCOUNT, '4242', 'q=', '?']) {
      expect(raw).not.toContain(value)
    }
    expect(entries[0]).toMatchObject({
      req: {
        id: '18181818-1818-4181-8181-181818181818',
        method: 'GET',
        url: '/api/transactions',
        headers: {
          referer: 'https://finances.example.test/transactions',
        },
      },
      res: { statusCode: 200 },
    })
    expect(entries[0].req).not.toHaveProperty('query')
  })

  it('keeps a path without query as it is', async () => {
    await app.inject({ method: 'GET', url: '/api/transactions/tx-1' })

    expect(requestLines()[0]).toMatchObject({
      req: { method: 'GET', url: '/api/transactions/tx-1' },
      res: { statusCode: 200 },
    })
  })

  it('leaves the request itself untouched', async () => {
    const headers = { referer: `https://finances.example.test/x?q=${SEARCH}` }
    const req = {
      url: `/api/transactions?q=${SEARCH}`,
      query: { q: SEARCH },
      headers,
    }

    const serialized = logSerializers.req(req)

    expect(serialized.url).toBe('/api/transactions')
    expect(serialized.headers?.referer).toBe('https://finances.example.test/x')
    expect(headers.referer).toContain(SEARCH)
  })
})
