import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { TerminusModule } from '@nestjs/terminus'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '#/database/database.service'
import { EmailService } from '#/email/email.service'
import { DatabaseHealthIndicator } from './database.health'
import { HealthController } from './health.controller'
import { SmtpHealthIndicator } from './smtp.health'

/**
 * `/health` gates container health and deploy rollbacks: it checks the
 * database, and SMTP only when SMTP is configured (optional in production).
 */
async function createApp(email: {
  enabled: boolean
  verify: () => Promise<void>
}) {
  const moduleRef = await Test.createTestingModule({
    imports: [TerminusModule.forRoot({ logger: false })],
    controllers: [HealthController],
    providers: [
      DatabaseHealthIndicator,
      SmtpHealthIndicator,
      {
        provide: DatabaseService,
        useValue: { ping: vi.fn().mockResolvedValue(undefined) },
      },
      {
        provide: EmailService,
        useValue: { enabled: email.enabled, verifyConnection: email.verify },
      },
    ],
  }).compile()
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
    {
      logger: false,
    },
  )
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  return app
}

describe('HealthController', () => {
  let app: NestFastifyApplication | undefined

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  it('leaves SMTP out when it is not configured', async () => {
    const verify = vi.fn()
    app = await createApp({ enabled: false, verify })
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json().details).toEqual({ database: { status: 'up' } })
    expect(verify).not.toHaveBeenCalled()
  })

  it('checks SMTP when it is configured', async () => {
    app = await createApp({
      enabled: true,
      verify: vi.fn().mockResolvedValue(undefined),
    })
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json().details).toEqual({
      database: { status: 'up' },
      smtp: { status: 'up' },
    })
  })

  it('fails when configured SMTP is unreachable', async () => {
    app = await createApp({
      enabled: true,
      verify: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
    })
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(503)
  })
})
