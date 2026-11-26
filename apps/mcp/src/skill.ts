/**
 * The « Capi » Skill (`skills/capi/`, #497) is the one source of the methods:
 * the prompts (`revue_du_mois`, `importer_mes_investissements`) send
 * `SKILL.md` and the files their task needs, for clients without Skills,
 * instead of keeping their own copy.
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
  'references/crypto.md',
  'references/export-banque.md',
  'references/import-releve.md',
  'references/operations.md',
  'references/placements.md',
  'references/point-finances.md',
  'references/projet.md',
] as const

export type SkillFile = (typeof SKILL_FILES)[number]

export function skillDir(): string {
  const dir = SKILL_DIRS.find((d) => existsSync(join(d, 'SKILL.md')))
  if (!dir) throw new Error('Capi Skill files not found (skills/capi)')
  return dir
}

/** What each prompt sends: its method and the files it links to, never the
 * advice sheets (finance review, projects), so a prompt stays light. */
export const PROMPT_FILES = {
  monthReview: [
    'SKILL.md',
    'references/bilan-du-mois.md',
    'references/import-releve.md',
    'references/export-banque.md',
    'references/operations.md',
    'references/placements.md',
    'references/crypto.md',
  ],
  investments: ['SKILL.md', 'references/placements.md', 'references/crypto.md'],
} as const satisfies Record<string, readonly SkillFile[]>

const bundles = new Map<string, string>()

/**
 * The given files of the Skill (all by default), `SKILL.md` without its
 * frontmatter, each under a line naming it, so the links between them still
 * say where to look.
 */
export function skillBundle(files: readonly SkillFile[] = SKILL_FILES): string {
  const key = files.join('|')
  const cached = bundles.get(key)
  if (cached !== undefined) return cached
  const dir = skillDir()
  const bundle = files
    .map((file) => {
      const text = readFileSync(join(dir, file), 'utf8')
        .replace(/^---\n[\s\S]*?\n---\n/, '')
        .trim()
      return `=== Fichier ${file} ===\n\n${text}`
    })
    .join('\n\n')
  bundles.set(key, bundle)
  return bundle
}
