import {
  Body,
  Controller,
  HttpCode,
  Post,
  ValidationPipe,
} from '@nestjs/common'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  MAX_JSON_DEPTH,
  exceedsJsonDepth,
  registerJsonDepthLimit,
} from './json-depth'

class PartDto {
  @IsString()
  label!: string
}

class ProbeDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartDto)
  parts?: PartDto[]

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>
}

@Controller('probe')
class ProbeController {
  @Post()
  @HttpCode(200)
  create(@Body() body: ProbeDto) {
    return { parts: body.parts?.length ?? 0 }
  }

  @Post('empty')
  @HttpCode(204)
  empty() {}
}

/** `{"meta":{"a":{"a":...}}}`: an object `levels` deep, as raw JSON text. */
function nested(levels: number): string {
  return `${'{"a":'.repeat(levels - 1)}{}${'}'.repeat(levels - 1)}`
}

async function createApp(withLimit: boolean) {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeController],
  }).compile()
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
    { logger: false },
  )
  if (withLimit) registerJsonDepthLimit(app.getHttpAdapter().getInstance())
  // Same options as `main.ts`.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  app.setGlobalPrefix('api')
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  return app
}

function post(
  app: NestFastifyApplication,
  payload: string,
  url = '/api/probe',
) {
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json' },
    payload,
  })
}

describe('exceedsJsonDepth', () => {
  it('counts objects and arrays, not scalars', () => {
    expect(exceedsJsonDepth('text', 0)).toBe(false)
    expect(exceedsJsonDepth(null, 0)).toBe(false)
    expect(exceedsJsonDepth(undefined, 0)).toBe(false)
    expect(exceedsJsonDepth({}, 0)).toBe(true)
    expect(exceedsJsonDepth({}, 1)).toBe(false)
    expect(exceedsJsonDepth({ a: [{ b: 1 }] }, 3)).toBe(false)
    expect(exceedsJsonDepth({ a: [{ b: 1 }] }, 2)).toBe(true)
    expect(exceedsJsonDepth([[[[]]]], 4)).toBe(false)
    expect(exceedsJsonDepth([[[[]]]], 3)).toBe(true)
  })

  it('walks a very deep value without overflowing the stack', () => {
    const deep = JSON.parse(nested(100_000)) as unknown
    expect(exceedsJsonDepth(deep, MAX_JSON_DEPTH)).toBe(true)
  })
})

describe('JSON depth limit (#182)', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    app = await createApp(true)
  })

  afterAll(async () => {
    await app.close()
  })

  it('answers 400 to a 5 000-level body, with the error envelope', async () => {
    const response = await post(app, `{"meta":${nested(5000)}}`)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      message: [`Request body nested deeper than ${MAX_JSON_DEPTH} levels`],
      path: '/api/probe',
    })
  })

  it(`accepts ${MAX_JSON_DEPTH} levels and refuses one more`, async () => {
    // The body object itself is the first level.
    const ok = await post(app, `{"meta":${nested(MAX_JSON_DEPTH - 1)}}`)
    expect(ok.statusCode).toBe(200)

    const tooDeep = await post(app, `{"meta":${nested(MAX_JSON_DEPTH)}}`)
    expect(tooDeep.statusCode).toBe(400)
  })

  it('leaves ordinary bodies and validation alone', async () => {
    const ok = await post(app, '{"parts":[{"label":"a"},{"label":"b"}]}')
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ parts: 2 })

    const invalid = await post(app, '{"parts":[{"label":1}]}')
    expect(invalid.statusCode).toBe(400)
    expect(JSON.stringify(invalid.json())).toContain('label')
  })

  it('leaves bodiless requests alone', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/probe/empty',
    })
    expect(response.statusCode).toBe(204)
  })

  it('was a 500 without it (the audit finding)', async () => {
    const unprotected = await createApp(false)
    try {
      const response = await post(unprotected, `{"meta":${nested(5000)}}`)
      expect(response.statusCode).toBe(500)
    } finally {
      await unprotected.close()
    }
  })
})
