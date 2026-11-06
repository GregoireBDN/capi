import { randomBytes } from 'node:crypto'
import { z } from 'zod'

/**
 * Validated environment configuration, parsed once at module load.
 *
 * A single Zod schema describes every variable the API reads. It is validated
 * against `process.env` at boot: any missing or invalid variable crashes the
 * process with an explicit message instead of failing obscurely later. Import
 * `env` from here instead of touching `process.env` directly.
 */

const isProduction = process.env['NODE_ENV'] === 'production'

/** Dev/test fallback matching the docker-compose Postgres service. */
const DEV_DATABASE_URL = 'postgres://user:password@localhost:5432/finances'

/**
 * Required in production (a missing value crashes the boot); outside production
 * it falls back to a sane local default so the app runs without a fully
 * populated `.env`.
 */
const requiredInProduction = (name: string, devDefault: string) =>
  isProduction
    ? z
        .string({ error: `${name} is required when NODE_ENV=production` })
        .min(1, `${name} is required when NODE_ENV=production`)
    : z.string().min(1).default(devDefault)

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.url().default('http://localhost:3000'),

  DATABASE_URL: requiredInProduction('DATABASE_URL', DEV_DATABASE_URL),

  /**
   * Secret used to sign auth JWTs. Required in production: booting without it
   * would otherwise sign tokens with a known value, making them forgeable.
   * Outside production we generate an ephemeral per-boot secret (below) so local
   * dev works without a configured secret while never exposing a fixed default.
   */
  JWT_SECRET: isProduction
    ? z
        .string({ error: 'JWT_SECRET is required when NODE_ENV=production' })
        .min(1, 'JWT_SECRET is required when NODE_ENV=production')
    : z.string().min(1).optional(),

  // SMTP — dev defaults target the Mailpit container.
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  // Env values are strings; only the literal "true" enables TLS.
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@finances.app'),

  // Crypto prices (CoinGecko public API, key-less). Only asset ids are sent.
  // Anything but the literal "false" keeps it enabled.
  PRICE_API_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  PRICE_API_URL: z.url().default('https://api.coingecko.com/api/v3'),
  /** How long a fetched price is fresh before it is asked again. */
  PRICE_CACHE_TTL_SECONDS: z.coerce.number().int().min(30).default(600),
})

function loadEnv() {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }

  return {
    ...parsed.data,
    JWT_SECRET: parsed.data.JWT_SECRET ?? randomBytes(32).toString('hex'),
    isProduction,
  }
}

export const env = loadEnv()
export type Env = typeof env
