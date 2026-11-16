import path from 'node:path'
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { multipleSetCookieInDev } from './dev/multiple-set-cookie'
import { offlinePageHeaders } from './plugins/offline-csp'
import { serviceWorker } from './plugins/service-worker'

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [
      {
        find: /^@\//,
        replacement: path.resolve(import.meta.dirname, 'src') + '/',
      },
      {
        find: /^#\//,
        replacement: path.resolve(import.meta.dirname, 'src') + '/',
      },
    ],
  },
  plugins: [
    multipleSetCookieInDev(),
    devtools(),
    nitro({
      // Static files keep their own caching (`/assets/*`: a year, immutable);
      // the worker and manifest are revalidated on every fetch so a deploy is
      // picked up at once. Responses of the Start handler (pages, `/api`) get
      // `no-store` and their CSP from `src/start.ts`; the static offline page
      // gets its own CSP (`plugins/offline-csp.ts`).
      routeRules: {
        // Static files (bundles, icons, manifest, worker) are for this origin
        // only; pages get the same header from `src/start.ts` (#204).
        '/**': { headers: { 'cross-origin-resource-policy': 'same-origin' } },
        '/sw.js': { headers: { 'cache-control': 'no-cache' } },
        '/manifest.json': { headers: { 'cache-control': 'no-cache' } },
        '/offline.html': { headers: offlinePageHeaders() },
      },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    serviceWorker(),
  ],
})

export default config
