import path from 'node:path'
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { multipleSetCookieInDev } from './dev/multiple-set-cookie'
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
      // `no-store` from `src/start.ts`.
      routeRules: {
        '/sw.js': { headers: { 'cache-control': 'no-cache' } },
        '/manifest.json': { headers: { 'cache-control': 'no-cache' } },
      },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    serviceWorker(),
  ],
})

export default config
