import { defineConfig } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          // Same CSS as `storybook dev` (vite.config.ts), so play checks
          // that read computed styles (contrast, layout) see the real tokens.
          tailwindcss(),
          storybookTest({
            configDir: resolve(dir, '.storybook'),
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
          setupFiles: [resolve(dir, '.storybook/vitest.setup.ts')],
        },
      },
    ],
  },
})
