#!/usr/bin/env node
// Dependency audit gate (#101): runs `pnpm audit --prod` and fails on any high or
// critical advisory that is not in the allow-list (.github/security/audit-allowlist.json).
// Every allow-list entry needs a reason and, unless the advisory cannot affect
// production, the `fix` issue tracking it. Entries no longer reported are flagged
// so the list shrinks when dependencies are updated. Prints package names and
// advisory ids only.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const allowlistPath = join(root, '.github/security/audit-allowlist.json')
const BLOCKING = new Set(['high', 'critical'])

const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'))
const allowed = new Map()
for (const entry of allowlist.advisories ?? []) {
  if (!/^GHSA(-[0-9a-z]{4}){3}$/.test(entry.id ?? '') || !entry.reason) {
    console.error(
      `::error::invalid allow-list entry ${JSON.stringify(entry)}: needs a GHSA id and a reason`,
    )
    process.exit(2)
  }
  allowed.set(entry.id, entry)
}

const run = spawnSync('pnpm', ['audit', '--prod', '--json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
let report
try {
  report = JSON.parse(run.stdout)
} catch {
  console.error('::error::pnpm audit did not return JSON')
  console.error(run.stderr || run.stdout)
  process.exit(2)
}
if (report.error) {
  console.error(
    `::error::pnpm audit failed: ${report.error.code ?? ''} ${report.error.summary ?? ''}`,
  )
  process.exit(2)
}

const reported = new Set()
const blocking = []
let ignored = 0
for (const advisory of Object.values(report.advisories ?? {})) {
  const id = advisory.github_advisory_id
  reported.add(id)
  if (!BLOCKING.has(advisory.severity)) continue
  if (allowed.has(id)) {
    ignored++
    continue
  }
  const paths = [...new Set(advisory.findings.flatMap((f) => f.paths))]
  blocking.push({ ...advisory, paths })
}

const counts = report.metadata?.vulnerabilities ?? {}
console.log(
  `pnpm audit --prod: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ` +
    `${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low; ${ignored} high/critical allow-listed`,
)

for (const id of allowed.keys()) {
  if (!reported.has(id)) {
    console.log(
      `::warning::${id} (${allowed.get(id).package}) is no longer reported: remove it from the allow-list`,
    )
  }
}

if (blocking.length > 0) {
  console.log(
    `\n${blocking.length} high/critical advisories not in the allow-list:`,
  )
  for (const a of blocking) {
    console.log(
      `::error::${a.severity} ${a.module_name} ${a.vulnerable_versions} (patched ${a.patched_versions}) ` +
        `${a.github_advisory_id}: ${a.title}`,
    )
    console.log(
      `  via ${a.paths.slice(0, 3).join(', ')}${a.paths.length > 3 ? ', …' : ''}`,
    )
  }
  console.log(
    '\nUpdate the dependency, or add the advisory to .github/security/audit-allowlist.json with a reason and a fix issue (see SECURITY.md).',
  )
  process.exit(1)
}
