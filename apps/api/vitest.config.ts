import { defineConfig } from 'vitest/config'
import { resolveTestDatabaseUrl } from './vitest.test-database'

// Integration specs run against a dedicated database, never the app's
// (see vitest.test-database.ts).
const testDatabaseUrl = resolveTestDatabaseUrl()

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globalSetup: ['./vitest.test-database.ts'],
    env: {
      DATABASE_URL: testDatabaseUrl,
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.module.ts', 'src/main.ts'],
    },
  },
})
