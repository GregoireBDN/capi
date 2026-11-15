import { RequestMethod } from '@nestjs/common'
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'
import { TOKEN_ACCESS_KEY } from '#/auth/access-tokens/token-access.decorator'
import { FreshAuthGuard } from '#/auth/guards/fresh-auth.guard'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import {
  OAuthConsentController,
  OAuthController,
  OAuthTokenInfoController,
} from './oauth.controller'
import { RemoteMcpModule } from './remote-mcp.module'

/**
 * Route audit of the remote MCP routes (#78). `app.routes.spec.ts` audits the
 * app with `REMOTE_MCP_ENABLED` off, where none of these exist; this keeps the
 * same rules for them: only the four RFC endpoints are public, the owner's
 * routes are session-only, approving needs a fresh session.
 */

type Controller = new (...args: never[]) => object

function routes(controller: Controller) {
  const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string
  const classGuards =
    (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]) ?? []
  const prototype = controller.prototype as Record<string, unknown>
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => {
      const handler = prototype[name] as object
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as number
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string
      const guards = [
        ...classGuards,
        ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? []),
      ]
      return {
        key: `${RequestMethod[method]} /api/${prefix}/${path}`.replace(
          /\/$/,
          '',
        ),
        guards,
        tokenAccess:
          Reflect.getMetadata(TOKEN_ACCESS_KEY, handler) ??
          Reflect.getMetadata(TOKEN_ACCESS_KEY, controller),
      }
    })
}

describe('RemoteMcpModule', () => {
  it('mounts nothing when disabled', () => {
    expect(RemoteMcpModule.register(false)).toEqual({
      module: RemoteMcpModule,
    })
  })

  it('mounts the three controllers when enabled', () => {
    expect(RemoteMcpModule.register(true).controllers).toEqual([
      OAuthController,
      OAuthConsentController,
      OAuthTokenInfoController,
    ])
  })

  it('leaves only the RFC endpoints public', () => {
    const publicRoutes = routes(OAuthController)
    expect(publicRoutes.map((route) => route.key).sort()).toEqual([
      'GET /api/oauth/metadata',
      'POST /api/oauth/register',
      'POST /api/oauth/revoke',
      'POST /api/oauth/token',
    ])
    expect(publicRoutes.every((route) => route.guards.length === 0)).toBe(true)
  })

  it('keeps the owner routes session-only, approving with a fresh session', () => {
    const owner = routes(OAuthConsentController)
    expect(owner.map((route) => route.key).sort()).toEqual([
      'DELETE /api/oauth/grants/:id',
      'GET /api/oauth/audit',
      'GET /api/oauth/authorize',
      'GET /api/oauth/grants',
      'POST /api/oauth/authorize',
      'POST /api/oauth/authorize/deny',
    ])
    for (const route of owner) {
      expect(route.guards[0]).toBe(JwtGuard)
      expect(route.tokenAccess).toBe('none')
    }
    const approve = owner.find((r) => r.key === 'POST /api/oauth/authorize')
    expect(approve?.guards).toContain(FreshAuthGuard)
  })

  it('guards token-info with JwtGuard', () => {
    const [info] = routes(OAuthTokenInfoController)
    expect(info.key).toBe('GET /api/oauth/token-info')
    expect(info.guards).toEqual([JwtGuard])
  })
})
