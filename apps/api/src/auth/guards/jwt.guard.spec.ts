import {
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessTokensService } from '#/auth/access-tokens/access-tokens.service'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { JwtGuard, readBearerToken } from './jwt.guard'

const VALID_TOKEN = `fin_pat_${'a'.repeat(43)}`

/** Routes covering each `@TokenAccess` level, read by the guard through the Reflector. */
@Controller('sample')
class SampleController {
  @Get()
  read() {}

  @Post()
  writeWithoutDecorator() {}

  @Post('preview')
  @TokenAccess('read')
  preview() {}

  @Post('apply')
  @TokenAccess('write')
  apply() {}
}

@TokenAccess('none')
@Controller('session-only')
class SessionOnlyController {
  @Get()
  list() {}
}

type Handler = (...args: never[]) => unknown

interface FakeRequest {
  method: string
  headers: { authorization?: string }
  cookies?: Record<string, string>
  user?: unknown
  accessToken?: unknown
}

function createContext(
  request: Partial<FakeRequest>,
  handler: Handler = SampleController.prototype.read,
  controller: object = SampleController,
) {
  const req: FakeRequest = { method: 'GET', headers: {}, ...request }
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext
  return { context, request: req }
}

describe('readBearerToken', () => {
  it('reads a bearer token, case-insensitive scheme', () => {
    expect(readBearerToken(`Bearer ${VALID_TOKEN}`)).toBe(VALID_TOKEN)
    expect(readBearerToken(`bearer ${VALID_TOKEN}`)).toBe(VALID_TOKEN)
  })

  it('returns an empty string for another scheme or a malformed header', () => {
    expect(readBearerToken('Basic dXNlcjpwYXNz')).toBe('')
    expect(readBearerToken('Bearer')).toBe('')
    expect(readBearerToken('Bearer a b')).toBe('')
  })

  it('returns undefined without a header', () => {
    expect(readBearerToken(undefined)).toBeUndefined()
  })
})

describe('JwtGuard', () => {
  const verify = vi.fn()
  const authenticate = vi.fn()
  const jwt = { verify } as unknown as JwtService
  const accessTokens = { authenticate } as unknown as AccessTokensService
  let guard: JwtGuard

  beforeEach(() => {
    vi.clearAllMocks()
    guard = new JwtGuard(jwt, new Reflector(), accessTokens)
  })

  describe('session cookie', () => {
    it('rejects requests without a token cookie', async () => {
      const { context } = createContext({ cookies: undefined })

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(verify).not.toHaveBeenCalled()
    })

    it('rejects an empty token cookie', async () => {
      const { context } = createContext({ cookies: { token: '' } })

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(verify).not.toHaveBeenCalled()
    })

    it('rejects when the token fails verification', async () => {
      verify.mockImplementation(() => {
        throw new Error('invalid signature')
      })
      const { context } = createContext({ cookies: { token: 'tampered' } })

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(verify).toHaveBeenCalledWith('tampered')
    })

    it('accepts a valid token and attaches the user to the request', async () => {
      verify.mockReturnValue({ sub: 'user-123', iat: 1 })
      const { context, request } = createContext({
        cookies: { token: 'good-token' },
      })

      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(request.user).toEqual({ sub: 'user-123' })
      expect(request.accessToken).toBeUndefined()
    })

    it('lets the session call write and session-only routes', async () => {
      verify.mockReturnValue({ sub: 'user-123' })
      for (const [handler, controller] of [
        [SampleController.prototype.writeWithoutDecorator, SampleController],
        [SessionOnlyController.prototype.list, SessionOnlyController],
      ] as const) {
        const { context } = createContext(
          { method: 'POST', cookies: { token: 'good-token' } },
          handler,
          controller,
        )
        await expect(guard.canActivate(context)).resolves.toBe(true)
      }
    })
  })

  describe('personal access token', () => {
    const bearer = { authorization: `Bearer ${VALID_TOKEN}` }

    it('accepts a valid read token on a GET route', async () => {
      authenticate.mockResolvedValue({
        id: 'tok-1',
        userId: 'user-123',
        scope: 'read',
      })
      const { context, request } = createContext({ headers: bearer })

      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(authenticate).toHaveBeenCalledWith(VALID_TOKEN)
      expect(request.user).toEqual({ sub: 'user-123' })
      expect(request.accessToken).toEqual({ id: 'tok-1', scope: 'read' })
    })

    it('rejects an unknown, revoked or expired token', async () => {
      authenticate.mockResolvedValue(null)
      const { context, request } = createContext({ headers: bearer })

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(request.user).toBeUndefined()
    })

    it('does not fall back to the cookie when the bearer token is invalid', async () => {
      authenticate.mockResolvedValue(null)
      verify.mockReturnValue({ sub: 'user-123' })
      const { context } = createContext({
        headers: bearer,
        cookies: { token: 'good-token' },
      })

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(verify).not.toHaveBeenCalled()
    })

    it('rejects another Authorization scheme without looking anything up', async () => {
      const { context } = createContext({
        headers: { authorization: 'Basic abc' },
      })

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(authenticate).not.toHaveBeenCalled()
    })

    it('refuses mutating routes that do not opt in, whatever the scope', async () => {
      authenticate.mockResolvedValue({
        id: 'tok-1',
        userId: 'user-123',
        scope: 'write',
      })
      const { context, request } = createContext(
        { method: 'POST', headers: bearer },
        SampleController.prototype.writeWithoutDecorator,
      )

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      )
      expect(request.user).toBeUndefined()
      // Still marked, so the refused call is audited.
      expect(request.accessToken).toEqual({ id: 'tok-1', scope: 'write' })
    })

    it('refuses a read token on a write route', async () => {
      authenticate.mockResolvedValue({
        id: 'tok-1',
        userId: 'user-123',
        scope: 'read',
      })
      const { context } = createContext(
        { method: 'POST', headers: bearer },
        SampleController.prototype.apply,
      )

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('accepts a write token on a write route', async () => {
      authenticate.mockResolvedValue({
        id: 'tok-1',
        userId: 'user-123',
        scope: 'write',
      })
      const { context } = createContext(
        { method: 'POST', headers: bearer },
        SampleController.prototype.apply,
      )

      await expect(guard.canActivate(context)).resolves.toBe(true)
    })

    it('accepts a read token on a POST route marked read', async () => {
      authenticate.mockResolvedValue({
        id: 'tok-1',
        userId: 'user-123',
        scope: 'read',
      })
      const { context } = createContext(
        { method: 'POST', headers: bearer },
        SampleController.prototype.preview,
      )

      await expect(guard.canActivate(context)).resolves.toBe(true)
    })

    it('refuses session-only GET routes', async () => {
      authenticate.mockResolvedValue({
        id: 'tok-1',
        userId: 'user-123',
        scope: 'write',
      })
      const { context } = createContext(
        { headers: bearer },
        SessionOnlyController.prototype.list,
        SessionOnlyController,
      )

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      )
    })
  })
})
