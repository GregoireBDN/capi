#!/usr/bin/env node
// Dependency specifier gate (#243): no package.json of the workspace may
// depend on a moving dist-tag (`latest`, `next`, a nightly channel, `*`), so a
// lockfile refresh never silently takes a new build. Semver ranges stay
// allowed (the lockfile pins them and `minimumReleaseAge` applies), as do
// `workspace:` and aliases to an exact version (`npm:nitro-nightly@3.0.1-...`).
// Prints package names and specifiers only.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

/** A dist-tag is a bare word (`latest`, `next`, `canary`) or `*` / empty. */
export function isMovingSpecifier(spec) {
  if (spec.startsWith('workspace:')) return false
  const version = spec.startsWith('npm:')
    ? spec.slice(spec.lastIndexOf('@') + 1)
    : spec
  if (spec.startsWith('npm:') && !spec.slice(4).replace(/^@/, '').includes('@'))
    return true
  const v = version.trim()
  return v === '' || v === '*' || v === 'x' || /^[a-z][a-z0-9-]*$/i.test(v)
}

const files = execFileSync(
  'git',
  ['ls-files', 'package.json', '**/package.json'],
  {
    cwd: root,
    encoding: 'utf8',
  },
)
  .split('\n')
  .filter(Boolean)

let failures = 0
for (const file of files) {
  const pkg = JSON.parse(readFileSync(join(root, file), 'utf8'))
  for (const field of FIELDS) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      if (isMovingSpecifier(spec)) {
        console.error(
          `::error file=${file}::${field}.${name} uses a moving specifier "${spec}"`,
        )
        failures++
      }
    }
  }
}
if (failures > 0) process.exit(1)
console.log(
  `${files.length} package.json files: no moving dependency specifier`,
)
