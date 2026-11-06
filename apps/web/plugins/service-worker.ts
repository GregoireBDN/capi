import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'vite'
import type { Plugin } from 'vite'
import {
  PUBLIC_SHELL_FILES,
  buildPrecacheManifest,
  isShellAsset,
} from '../src/sw/precache'

const SW_FILE_NAME = 'sw.js'
const MANIFEST_PLACEHOLDER = '__SW_MANIFEST__'

/**
 * Production-only: bundles `src/sw/worker/service-worker.ts` into `/sw.js` of the
 * client build and injects the precache manifest (the hashed client assets
 * plus the shell files of `public/`) and its content hash, which names the
 * cache.
 *
 * The worker is bundled by a separate, isolated Vite build (IIFE, no plugins)
 * and added to the client bundle as an asset: TanStack Start's client build
 * accepts a single entry chunk. A small hand-written plugin rather than
 * `vite-plugin-pwa`: it only touches the client environment of the TanStack
 * Start/Nitro build (the SSR bundle and the `/api` server route are
 * untouched), and the worker stays a short, auditable file.
 */
export function serviceWorker(): Plugin {
  const root = import.meta.dirname
  const entry = path.resolve(root, '../src/sw/worker/service-worker.ts')
  const publicDir = path.resolve(root, '../public')

  return {
    name: 'finances:service-worker',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    async generateBundle(_options, bundle) {
      const swSource = await bundleWorker(entry)
      if (swSource.split(MANIFEST_PLACEHOLDER).length !== 2) {
        this.error(
          `${SW_FILE_NAME} must reference ${MANIFEST_PLACEHOLDER} once`,
        )
      }

      const assets = Object.values(bundle)
        .filter((file) => isShellAsset(file.fileName, SW_FILE_NAME))
        .map((file) => ({
          fileName: file.fileName,
          content: file.type === 'chunk' ? file.code : file.source,
        }))
      const publicFiles = await Promise.all(
        PUBLIC_SHELL_FILES.map(async (fileName) => ({
          fileName,
          content: await readFile(path.join(publicDir, fileName)),
        })),
      )

      const manifest = buildPrecacheManifest(
        [...assets, ...publicFiles],
        swSource,
      )
      this.emitFile({
        type: 'asset',
        fileName: SW_FILE_NAME,
        source: swSource.replace(
          MANIFEST_PLACEHOLDER,
          JSON.stringify(manifest),
        ),
      })
    },
  }
}

/** Bundles the worker into one self-contained classic script (IIFE). */
async function bundleWorker(entry: string): Promise<string> {
  const result = await build({
    configFile: false,
    envFile: false,
    publicDir: false,
    logLevel: 'warn',
    root: path.dirname(entry),
    build: {
      write: false,
      minify: true,
      lib: {
        entry,
        formats: ['iife'],
        name: 'financesServiceWorker',
        fileName: () => SW_FILE_NAME,
      },
    },
  })
  const outputs = Array.isArray(result) ? result : [result]
  const chunks = outputs.flatMap((output) =>
    'output' in output
      ? output.output.filter((file) => file.type === 'chunk')
      : [],
  )
  if (chunks.length !== 1) {
    throw new Error(`Expected one service worker chunk, got ${chunks.length}`)
  }
  return chunks[0].code
}
