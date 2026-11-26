/**
 * The « Capi » Skill (`skills/capi/`, #497) holds the methods the tool
 * descriptions no longer repeat. These checks keep it in step with the server:
 * every tool it names exists, its links resolve, and it carries no secret.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { connect } from './test/mock-api.js'
import { PROMPT_FILES, SKILL_FILES, skillBundle } from './skill.js'
import { tools } from './tools/index.js'

const SKILL_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../skills/capi',
)

function skillFiles(): { path: string; text: string }[] {
  const references = readdirSync(join(SKILL_DIR, 'references')).map((name) =>
    join('references', name),
  )
  return ['SKILL.md', ...references].map((path) => ({
    path,
    text: readFileSync(join(SKILL_DIR, path), 'utf8'),
  }))
}

/** Upper bound of the tool definitions sent on `tools/list`, in characters
 * (43,006 after #497, 50,306 before): methods go in the Skill, not here. */
const TOOL_DEFINITIONS_BUDGET = 45_000

describe('Capi skill', () => {
  it('has the frontmatter claude.ai and Claude Code expect', () => {
    const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8')
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? ''
    expect(frontmatter).toMatch(/^name: capi$/m)
    const description = /^description: (.+)$/m.exec(frontmatter)?.[1] ?? ''
    expect(description.length).toBeGreaterThan(40)
    expect(description.length).toBeLessThanOrEqual(1024)
    expect(description).not.toMatch(/[<>]/)
  })

  it('names only tools the server has, and links only its own files', () => {
    const names = new Set(tools.map((t) => t.name))
    const toolLike = /`([a-z]+(?:_[a-z]+)+)`/g
    // Arguments and values written in backticks, not tools.
    const notTools = new Set(['value_date'])
    for (const { path, text } of skillFiles()) {
      for (const [, name] of text.matchAll(toolLike)) {
        if (name && !notTools.has(name))
          expect(names, `${path}: ${name}`).toContain(name)
      }
      for (const [, target] of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
        if (!target) continue
        const base = path.startsWith('references/')
          ? join(SKILL_DIR, 'references')
          : SKILL_DIR
        expect(
          () => readFileSync(join(base, target)),
          `${path}: ${target}`,
        ).not.toThrow()
      }
    }
  })

  it('covers the methods that left the tool descriptions', () => {
    const all = skillFiles()
      .map((f) => f.text)
      .join('\n')
    for (const name of [
      'preview_bank_import',
      'commit_bank_import',
      'close_months',
      'set_budget_targets',
      'add_investment_snapshots',
      'sync_security_positions',
      'sync_crypto_holdings',
      'set_invested_amount',
      'link_repayment',
      'share_expense',
      'split_transaction',
      'create_rule',
    ])
      expect(all).toContain(`\`${name}\``)
    expect(all).toContain('date;amount;label;balance')
    expect(all).toContain('confirm: true')
  })

  it('is sent whole by the prompts, every file once, without frontmatter', () => {
    expect([...SKILL_FILES].sort()).toEqual(
      skillFiles()
        .map((f) => f.path)
        .sort(),
    )
    const bundle = skillBundle()
    for (const file of SKILL_FILES)
      expect(bundle.split(`=== Fichier ${file} ===`)).toHaveLength(2)
    expect(bundle).not.toMatch(/^description: /m)
  })

  it('gives each prompt its method and every file that method links to', () => {
    for (const files of Object.values(PROMPT_FILES)) {
      const sent = new Set<string>(files)
      expect(sent).toContain('SKILL.md')
      for (const file of files) {
        if (file === 'SKILL.md') continue
        const text = readFileSync(join(SKILL_DIR, file), 'utf8')
        for (const [, target] of text.matchAll(/\]\(([a-z-]+\.md)\)/g))
          expect(sent, `${file} → ${target}`).toContain(`references/${target}`)
      }
    }
    expect(skillBundle(PROMPT_FILES.monthReview)).not.toContain(
      'point-finances.md ===',
    )
  })

  it('carries no token, URL or address', () => {
    for (const { path, text } of skillFiles()) {
      expect(text, path).not.toMatch(/fin_pat_|Bearer |https?:\/\//)
      expect(text, path).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i)
      // No IBAN-like account number.
      expect(text, path).not.toMatch(/\bFR\d{2}[ \d]{10,}/)
    }
  })
})

describe('tool definitions size', () => {
  it(`stays under ${TOOL_DEFINITIONS_BUDGET} characters`, async () => {
    const { client } = await connect({})
    const { tools: listed } = await client.listTools()
    expect(listed).toHaveLength(35)
    const size = listed.reduce((sum, t) => sum + JSON.stringify(t).length, 0)
    expect(size).toBeLessThanOrEqual(TOOL_DEFINITIONS_BUDGET)
  })
})
