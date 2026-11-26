// Copies the « Capi » Skill (`skills/capi/`, #497) into `dist/skill-capi/`, so
// the built server (and its image, which ships `dist/` only) reads the same
// methods for its prompts as the Skill itself: one source, no copy to keep in
// step by hand. Run after `tsc` by `pnpm build`.
import { cpSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const from = join(here, '../../../skills/capi')
const to = join(here, '../dist/skill-capi')
rmSync(to, { recursive: true, force: true })
cpSync(from, to, { recursive: true })
