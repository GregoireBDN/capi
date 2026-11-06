import { describe, expect, it } from 'vitest'
import { shouldRegisterServiceWorker } from './service-worker-registration'

describe('shouldRegisterServiceWorker', () => {
  it('registers only in production, on a secure context, when supported', () => {
    expect(
      shouldRegisterServiceWorker({
        production: true,
        secureContext: true,
        supported: true,
      }),
    ).toBe(true)
  })

  it.each([
    { production: false, secureContext: true, supported: true },
    { production: true, secureContext: false, supported: true },
    { production: true, secureContext: true, supported: false },
  ])('does not register when %o', (env) => {
    expect(shouldRegisterServiceWorker(env)).toBe(false)
  })
})
