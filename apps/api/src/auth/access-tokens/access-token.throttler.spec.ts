import type { ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { accessTokenThrottler } from './access-token.throttler'

const TOKEN = `fin_pat_${'b'.repeat(43)}`

function contextOf(headers: Record<string, string>) {
  const request = { headers }
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext,
  }
}

describe('accessTokenThrottler', () => {
  it('is skipped for requests without a bearer token', () => {
    expect(accessTokenThrottler.skipIf!(contextOf({}).context)).toBe(true)
    expect(
      accessTokenThrottler.skipIf!(contextOf({ cookie: 'token=x' }).context),
    ).toBe(true)
  })

  it('applies to bearer requests, keyed by the token hash (never the token)', async () => {
    const { context, request } = contextOf({ authorization: `Bearer ${TOKEN}` })

    expect(accessTokenThrottler.skipIf!(context)).toBe(false)
    const tracker = await accessTokenThrottler.getTracker!(request, context)
    expect(tracker).toMatch(/^pat:[0-9a-f]{64}$/)
    expect(tracker).not.toContain(TOKEN)
  })
})
