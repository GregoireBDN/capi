import path from 'node:path'
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { multipleSetCookieInDev } from './dev/multiple-set-cookie'

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [
      { find: /^@\//, replacement: path.resolve(import.meta.dirname, 'src') + '/' },
      { find: /^#\//, replacement: path.resolve(import.meta.dirname, 'src') + '/' },
    ],
  },
  plugins: [
    multipleSetCookieInDev(),
    devtools(),
    nitro(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
