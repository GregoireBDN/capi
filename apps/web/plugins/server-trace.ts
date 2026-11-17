/**
 * What Nitro may copy into `.output/server/node_modules` (#242).
 *
 * Nitro bundles the server code and keeps as external only a built-in list of
 * "native or non-bundleable" packages (nf3's `NodeNativePackages` and
 * `NonBundleablePackages`), which it then traces into `node_modules`. That
 * list is traced whenever one of its packages can be resolved from the app,
 * imported or not: with pnpm the build and test tooling of the workspace
 * (vite, rolldown, esbuild, sharp, playwright, turbo, ...) resolves, so the
 * image used to ship ~120 MB of tools the server never loads.
 *
 * `SERVER_TRACE_EXCLUDE` takes the tooling of this repository out of that
 * list (`!pkg` in Nitro's `traceDeps`), and `assertServerTrace` fails the
 * build when anything outside `SERVER_RUNTIME_PACKAGES` is traced, so a new
 * tool, or a new runtime dependency that really is external, is a deliberate
 * change of this file.
 */

/** Build and test tooling found by the trace, never imported by the server. */
export const SERVER_TRACE_EXCLUDE = [
  // Vite and its bundlers / transformers (and their native bindings).
  'vite',
  'rolldown',
  'rollup',
  'esbuild',
  'lightningcss',
  'oxc-parser',
  '@tailwindcss/oxide',
  '@swc/core',
  'fsevents',
  // Monorepo runner, icon generation, end-to-end tests.
  'turbo',
  'sharp',
  'playwright',
  'playwright-core',
] as const

/**
 * Packages the server bundle imports at runtime and Nitro keeps external:
 * `tslib` (imported by `react-remove-scroll`, under the Radix dialogs).
 */
export const SERVER_RUNTIME_PACKAGES: ReadonlySet<string> = new Set(['tslib'])

/** Nitro `traceDeps` entries excluding the tooling. */
export function serverTraceDeps(): Array<string> {
  return SERVER_TRACE_EXCLUDE.map((name) => `!${name}`)
}

/** Throws when the trace copied a package the server is not known to need. */
export function assertServerTrace(
  tracedPackages: Record<string, unknown>,
): void {
  const unexpected = Object.keys(tracedPackages)
    .filter((name) => !SERVER_RUNTIME_PACKAGES.has(name))
    .sort()
  if (unexpected.length > 0) {
    throw new Error(
      `Nitro traced unexpected packages into .output/server/node_modules: ${unexpected.join(', ')}. ` +
        'Exclude build tooling in SERVER_TRACE_EXCLUDE, or add a real runtime dependency to ' +
        'SERVER_RUNTIME_PACKAGES (apps/web/plugins/server-trace.ts).',
    )
  }
}
