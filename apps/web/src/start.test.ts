import { describe, expect, it, vi } from 'vitest'

import { cacheHeadersMiddleware, securityHeadersMiddleware } from './start'

type ServerFn = (options: {
  request: Request
  pathname: string
  context: Record<string, unknown>
  handlerType: 'serverFn' | 'router'
  next: (options?: { context?: Record<string, unknown> }) => Promise<{
    request: Request
    pathname: string
    context: Record<string, unknown>
    response: Response
  }>
}) => Promise<{ response: Response; context: Record<string, unknown> }>

const securityHeaders = (
  securityHeadersMiddleware.options as unknown as { server: ServerFn }
).server
const cacheHeaders = (
  cacheHeadersMiddleware.options as unknown as { server: ServerFn }
).server

function run(
  middleware: ServerFn,
  pathname: string,
  response: () => Response = () => new Response('<html></html>'),
  handlerType: 'serverFn' | 'router' = 'router',
) {
  const request = new Request(`http://web.test${pathname}`)
  const next = vi.fn(
    async (options?: { context?: Record<string, unknown> }) => ({
      request,
      pathname,
      context: options?.context ?? {},
      response: response(),
    }),
  )
  return {
    next,
    result: middleware({ request, pathname, context: {}, handlerType, next }),
  }
}

function nonceOf(policy: string | null): string | undefined {
  return policy?.match(/'nonce-([^']+)'/)?.[1]
}

describe('securityHeadersMiddleware', () => {
  it.each(['/auth', '/dashboard', '/', '/transactions', '/does-not-exist'])(
    'sends a CSP and frame protection with %s',
    async (pathname) => {
      const { next, result } = run(securityHeaders, pathname)
      const { response } = await result

      const policy = response.headers.get('content-security-policy')
      expect(policy).toContain("frame-ancestors 'none'")
      expect(policy).toContain("default-src 'self'")
      expect(policy).toContain("object-src 'none'")
      expect(response.headers.get('x-frame-options')).toBe('DENY')
      // The nonce in the header is the one handed to the router.
      expect(nonceOf(policy)).toBeDefined()
      expect(next).toHaveBeenCalledWith({
        context: { cspNonce: nonceOf(policy) },
      })
    },
  )

  it('covers server functions and redirects', async () => {
    const serverFn = await run(
      securityHeaders,
      '/_serverFn/abc',
      () => Response.json({ ok: true }),
      'serverFn',
    ).result
    const redirect = await run(securityHeaders, '/', () =>
      Response.redirect('http://web.test/dashboard', 307),
    ).result

    for (const { response } of [serverFn, redirect]) {
      expect(response.headers.get('content-security-policy')).toContain(
        "frame-ancestors 'none'",
      )
      expect(response.headers.get('x-frame-options')).toBe('DENY')
    }
    expect(redirect.response.headers.get('location')).toBe(
      'http://web.test/dashboard',
    )
  })

  it('uses a new nonce for every response', async () => {
    const first = await run(securityHeaders, '/dashboard').result
    const second = await run(securityHeaders, '/dashboard').result

    expect(
      nonceOf(first.response.headers.get('content-security-policy')),
    ).not.toBe(nonceOf(second.response.headers.get('content-security-policy')))
  })

  it('leaves the API proxy with the API own headers', async () => {
    const { next, result } = run(securityHeaders, '/api/auth/me', () =>
      Response.json(
        {},
        { headers: { 'content-security-policy': "default-src 'none'" } },
      ),
    )
    const { response } = await result

    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none'",
    )
    expect(response.headers.get('x-frame-options')).toBeNull()
    expect(next).toHaveBeenCalledWith({ context: {} })
  })
})

describe('cacheHeadersMiddleware', () => {
  it('keeps pages private and unstored', async () => {
    const { response } = await run(cacheHeaders, '/dashboard').result

    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})
