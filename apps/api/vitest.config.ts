import { defineConfig } from 'vitest/config'
import { resolveTestDatabaseUrl } from './vitest.test-database'

// Integration specs run against a dedicated database, never the app's
// (see vitest.test-database.ts).
const testDatabaseUrl = resolveTestDatabaseUrl()

/**
 * The isolation suite (#558) holds one transaction for its whole run, with
 * the demo's global prices uncommitted in it: other specs writing the same
 * prices would wait for it, so it runs alone, after them.
 */
const ALONE = ['src/app.isolation.spec.ts']

const shared = {
  globals: true,
  environment: 'node',
  env: { DATABASE_URL: testDatabaseUrl },
} as const

export default defineConfig({
  test: {
    globalSetup: ['./vitest.test-database.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.module.ts', 'src/main.ts'],
    },
    projects: [
      {
        test: {
          ...shared,
          name: 'api',
          include: ['src/**/*.spec.ts'],
          exclude: ALONE,
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          ...shared,
          name: 'isolation',
          include: ALONE,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
})
