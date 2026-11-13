import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import type { AccessTokensService } from './access-tokens.service'
import { recordAccessTokenUse } from './access-token-audit.hook'

function setup(recordUse = vi.fn().mockResolvedValue(undefined)) {
  const accessTokens = { recordUse } as unknown as AccessTokensService
  const logger = { warn: vi.fn() }
  return { accessTokens, logger, recordUse }
}

const reply = { statusCode: 403 } as FastifyReply

describe('recordAccessTokenUse', () => {
  it('records the method, route pattern and status, never the concrete URL', async () => {
    const { accessTokens, logger, recordUse } = setup()
    const request = {
      method: 'PATCH',
      url: '/api/transactions/0d2c?search=secret-label',
      routeOptions: { url: '/api/transactions/:id' },
      accessToken: { id: 'tok-1', scope: 'write' },
    } as unknown as FastifyRequest

    await recordAccessTokenUse(accessTokens, logger, request, reply)

    expect(recordUse).toHaveBeenCalledWith({
      tokenId: 'tok-1',
      method: 'PATCH',
      route: '/api/transactions/:id',
      statusCode: 403,
    })
    expect(JSON.stringify(recordUse.mock.calls)).not.toContain('secret-label')
  })

  it('ignores requests not made with a token', async () => {
    const { accessTokens, logger, recordUse } = setup()
    const request = {
      method: 'GET',
      routeOptions: { url: '/api/accounts' },
    } as FastifyRequest

    await recordAccessTokenUse(accessTokens, logger, request, reply)

    expect(recordUse).not.toHaveBeenCalled()
  })

  it('never throws when recording fails', async () => {
    const { accessTokens, logger } = setup(
      vi.fn().mockRejectedValue(new Error('db down')),
    )
    const request = {
      method: 'GET',
      routeOptions: { url: '/api/accounts' },
      accessToken: { id: 'tok-1', scope: 'read' },
    } as unknown as FastifyRequest

    await expect(
      recordAccessTokenUse(accessTokens, logger, request, reply),
    ).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledOnce()
  })
})
