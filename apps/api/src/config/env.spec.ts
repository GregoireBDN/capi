import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `env` is parsed at module load, so each case resets the module registry and
 * re-imports with a freshly mutated `process.env`.
 */
async function importEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules()
  const original = { ...process.env }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  try {
    return await import('./env.js')
  } finally {
    process.env = original
  }
}

describe('env', () => {
  let savedEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    savedEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = savedEnv
    vi.resetModules()
  })

  /** Minimal set of variables required for a production boot to succeed. */
  const PROD_BASE = {
    NODE_ENV: 'production',
    JWT_SECRET: 'a-real-production-secret-of-40-chars-xyz',
    DATABASE_URL: 'postgres://user:password@db:5432/finances',
  }

  it('throws when JWT_SECRET is missing in production', async () => {
    await expect(
      importEnv({ ...PROD_BASE, JWT_SECRET: undefined }),
    ).rejects.toThrow(/JWT_SECRET is required when NODE_ENV=production/)
  })

  it('refuses a JWT_SECRET shorter than 32 characters in production', async () => {
    await expect(
      importEnv({ ...PROD_BASE, JWT_SECRET: 'x'.repeat(31) }),
    ).rejects.toThrow(/JWT_SECRET must be at least 32 characters/)
  })

  it('accepts a JWT_SECRET of exactly 32 characters in production', async () => {
    const { env } = await importEnv({
      ...PROD_BASE,
      JWT_SECRET: 'x'.repeat(32),
    })
    expect(env.JWT_SECRET).toBe('x'.repeat(32))
  })

  it('reports an empty JWT_SECRET as missing in production', async () => {
    const attempt = importEnv({ ...PROD_BASE, JWT_SECRET: '' })
    await expect(attempt).rejects.toThrow(
      /JWT_SECRET is required when NODE_ENV=production/,
    )
    await expect(attempt).rejects.not.toThrow(/at least 32/)
  })

  it('keeps short secrets usable outside production (tests, dev)', async () => {
    const { env } = await importEnv({
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret',
    })
    expect(env.JWT_SECRET).toBe('test-secret')
  })

  it('throws when DATABASE_URL is missing in production', async () => {
    await expect(
      importEnv({ ...PROD_BASE, DATABASE_URL: undefined }),
    ).rejects.toThrow(/DATABASE_URL is required when NODE_ENV=production/)
  })

  it('throws when APP_URL is not a valid URL', async () => {
    await expect(
      importEnv({ ...PROD_BASE, APP_URL: 'not-a-url' }),
    ).rejects.toThrow(/Invalid environment configuration/)
  })

  it('uses the provided JWT_SECRET in production', async () => {
    const { env } = await importEnv(PROD_BASE)
    expect(env.JWT_SECRET).toBe('a-real-production-secret-of-40-chars-xyz')
  })

  it('falls back to an ephemeral secret outside production', async () => {
    const { env } = await importEnv({
      NODE_ENV: 'development',
      JWT_SECRET: undefined,
    })
    expect(env.JWT_SECRET).toMatch(/^[0-9a-f]{64}$/)
    expect(env.JWT_SECRET).not.toBe('dev-secret-change-in-production')
  })

  it('applies development defaults for unset variables', async () => {
    const { env } = await importEnv({
      NODE_ENV: 'development',
      PORT: undefined,
      APP_URL: undefined,
      DATABASE_URL: undefined,
      SMTP_HOST: undefined,
      SMTP_PORT: undefined,
      SMTP_SECURE: undefined,
      EMAIL_FROM: undefined,
    })
    expect(env.PORT).toBe(4000)
    expect(env.APP_URL).toBe('http://localhost:3000')
    expect(env.DATABASE_URL).toBe(
      'postgres://user:password@localhost:5432/finances',
    )
    expect(env.SMTP_HOST).toBe('localhost')
    expect(env.SMTP_PORT).toBe(1025)
    expect(env.SMTP_SECURE).toBe(false)
    expect(env.EMAIL_FROM).toBe('noreply@capi.app')
    expect(env.isProduction).toBe(false)
  })

  it('trusts loopback and private ranges as proxies by default', async () => {
    const { env } = await importEnv({
      ...PROD_BASE,
      TRUSTED_PROXIES: undefined,
    })
    expect(env.TRUSTED_PROXIES).toEqual(['loopback', 'uniquelocal'])
  })

  it('parses TRUSTED_PROXIES and rejects invalid entries', async () => {
    const { env } = await importEnv({
      ...PROD_BASE,
      TRUSTED_PROXIES: '172.18.0.0/16, 10.0.0.2',
    })
    expect(env.TRUSTED_PROXIES).toEqual(['172.18.0.0/16', '10.0.0.2'])

    await expect(
      importEnv({ ...PROD_BASE, TRUSTED_PROXIES: 'web' }),
    ).rejects.toThrow(/TRUSTED_PROXIES/)
  })

  it('makes SMTP optional in production (unset or empty SMTP_HOST)', async () => {
    for (const SMTP_HOST of [undefined, '']) {
      const { env } = await importEnv({ ...PROD_BASE, SMTP_HOST })
      expect(env.SMTP_HOST).toBeUndefined()
      expect(env.smtpEnabled).toBe(false)
    }
    const { env } = await importEnv({
      ...PROD_BASE,
      SMTP_HOST: 'smtp.example.test',
    })
    expect(env.SMTP_HOST).toBe('smtp.example.test')
    expect(env.smtpEnabled).toBe(true)
  })

  it('keeps SMTP on the local Mailpit outside production', async () => {
    const { env } = await importEnv({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
    })
    expect(env.smtpEnabled).toBe(true)
  })

  it('coerces numeric and boolean string variables', async () => {
    const { env } = await importEnv({
      NODE_ENV: 'development',
      PORT: '8080',
      SMTP_PORT: '587',
      SMTP_SECURE: 'true',
    })
    expect(env.PORT).toBe(8080)
    expect(env.SMTP_PORT).toBe(587)
    expect(env.SMTP_SECURE).toBe(true)
  })

  describe('passkeys (WebAuthn)', () => {
    it('defaults the RP id and origin to APP_URL', async () => {
      const { env } = await importEnv({
        APP_URL: 'https://capi.example.ts.net/some/path',
        WEBAUTHN_RP_ID: undefined,
        WEBAUTHN_ORIGIN: undefined,
      })
      expect(env.webauthn).toEqual({
        rpId: 'capi.example.ts.net',
        origin: 'https://capi.example.ts.net',
      })
    })

    it('accepts an explicit origin and a parent domain as RP id', async () => {
      const { env } = await importEnv({
        APP_URL: 'http://localhost:3000',
        WEBAUTHN_ORIGIN: 'https://app.example.test:8443',
        WEBAUTHN_RP_ID: 'example.test',
      })
      expect(env.webauthn).toEqual({
        rpId: 'example.test',
        origin: 'https://app.example.test:8443',
      })
    })

    it('treats empty values as unset', async () => {
      const { env } = await importEnv({
        APP_URL: 'http://localhost:3100',
        WEBAUTHN_ORIGIN: '',
        WEBAUTHN_RP_ID: '',
      })
      expect(env.webauthn).toEqual({
        rpId: 'localhost',
        origin: 'http://localhost:3100',
      })
    })

    it('refuses an RP id that does not cover the origin', async () => {
      await expect(
        importEnv({
          APP_URL: 'https://capi.example.test',
          WEBAUTHN_RP_ID: 'other.test',
        }),
      ).rejects.toThrow(/WEBAUTHN_RP_ID/)
      await expect(
        importEnv({
          APP_URL: 'https://capi.example.test',
          WEBAUTHN_RP_ID: 'ances.example.test',
        }),
      ).rejects.toThrow(/WEBAUTHN_RP_ID/)
    })
  })
})
