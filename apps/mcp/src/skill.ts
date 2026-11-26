/**
 * The « Capi » Skill (`skills/capi/`, #497) is the one source of the methods:
 * the prompts (`revue_du_mois`, `importer_mes_investissements`) send it whole,
 * for clients without Skills, instead of keeping their own copy.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** `dist/skill-capi/`, copied at build (all the image ships), else the
 * checkout's `skills/capi/` (sources run by tsx or Vitest). */
const SKILL_DIRS = [
  join(here, 'skill-capi'),
  join(here, '../../../skills/capi'),
]

/** The Skill's files, in the order the prompts send them. */
export const SKILL_FILES = [
  'SKILL.md',
  'references/bilan-du-mois.md',
  'references/import-releve.md',
  'references/operations.md',
  'references/placements.md',
] as const

export type SkillFile = (typeof SKILL_FILES)[number]

export function skillDir(): string {
  const dir = SKILL_DIRS.find((d) => existsSync(join(d, 'SKILL.md')))
  if (!dir) throw new Error('Capi Skill files not found (skills/capi)')
  return dir
}

let bundle: string | undefined

/**
 * Every file of the Skill, `SKILL.md` without its frontmatter first, each
 * under a line naming it, so the links between them still say where to look.
 */
export function skillBundle(): string {
  if (bundle !== undefined) return bundle
  const dir = skillDir()
  bundle = SKILL_FILES.map((file) => {
    const text = readFileSync(join(dir, file), 'utf8')
      .replace(/^---\n[\s\S]*?\n---\n/, '')
      .trim()
    return `=== Fichier ${file} ===\n\n${text}`
  }).join('\n\n')
  return bundle
}
