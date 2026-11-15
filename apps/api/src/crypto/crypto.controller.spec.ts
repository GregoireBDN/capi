import { ForbiddenException } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { AccountHoldingsController } from './crypto.controller'
import type { CryptoService } from './crypto.service'

const ACCOUNT = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc'
const HOLDING = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abd'
const DTO = {
  assetId: 'bitcoin',
  symbol: 'BTC',
  name: 'Bitcoin',
  quantity: '1',
}

function setup(refuse = false) {
  const crypto = {
    assertTokenMayWrite: vi.fn(() =>
      refuse
        ? Promise.reject(new ForbiddenException('refused'))
        : Promise.resolve(),
    ),
    create: vi.fn(() => Promise.resolve({ id: HOLDING })),
    update: vi.fn(() => Promise.resolve({ id: HOLDING })),
  }
  const controller = new AccountHoldingsController(
    crypto as unknown as CryptoService,
  )
  return { crypto, controller }
}

const session = {} as FastifyRequest
const token = {
  accessToken: { id: 'tok', scope: 'write' },
} as unknown as FastifyRequest

// #104: write tokens (MCP sync_crypto_holdings) may add or replace holdings
// only on manual crypto accounts and only hand-entered lines; the session is
// not restricted. The rules themselves are covered in crypto.service.spec.ts.
describe('AccountHoldingsController token limits', () => {
  it('checks token requests before creating or replacing a holding', async () => {
    const { crypto, controller } = setup()
    await controller.create(ACCOUNT, DTO, token)
    expect(crypto.assertTokenMayWrite).toHaveBeenCalledWith(ACCOUNT)
    await controller.update(ACCOUNT, HOLDING, DTO, token)
    expect(crypto.assertTokenMayWrite).toHaveBeenCalledWith(ACCOUNT, HOLDING)
    expect(crypto.create).toHaveBeenCalledOnce()
    expect(crypto.update).toHaveBeenCalledOnce()
  })

  it('writes nothing when the token is refused', async () => {
    const { crypto, controller } = setup(true)
    await expect(controller.create(ACCOUNT, DTO, token)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await expect(
      controller.update(ACCOUNT, HOLDING, DTO, token),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(crypto.create).not.toHaveBeenCalled()
    expect(crypto.update).not.toHaveBeenCalled()
  })

  it('leaves session requests to the usual checks', async () => {
    const { crypto, controller } = setup(true)
    await controller.create(ACCOUNT, DTO, session)
    await controller.update(ACCOUNT, HOLDING, DTO, session)
    expect(crypto.assertTokenMayWrite).not.toHaveBeenCalled()
  })
})
