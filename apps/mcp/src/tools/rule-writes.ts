import { z } from 'zod'
import type {
  ApplyCategorizationRulesResultDto,
  CategorizationRuleConflictDto,
  CategorizationRuleDto,
  CategorizationRulePreviewDto,
  CreateCategorizationRuleDto,
} from '../api/types.js'
import { frenchDate, signedEuros } from '../format.js'
import { KIND_LABELS } from './labels.js'
import {
  listAccounts,
  listCategories,
  normalize,
  pickAccount,
  pickCategory,
} from './lookup.js'
import { defineTool, ToolInputError } from './tool.js'
import { confirmSchema, PREVIEW_FOOTER, PREVIEW_HEADER } from './write.js'

const PATTERN_MAX = 255
const SHOWN_CHANGES = 10
const SHOWN_CONFLICTS = 5
/** Id the API gives the unsaved rule in a preview. */
const PREVIEW_RULE_ID = '00000000-0000-0000-0000-000000000000'

/** `« UBER » → Transport` for an existing rule. */
function ruleName(
  rule: CategorizationRuleDto | undefined,
  categoryName: (id: string) => string,
): string {
  if (!rule) return 'une règle supprimée'
  return `« ${rule.labelPattern} » → ${categoryName(rule.categoryId)}`
}

/** One line per conflict of the previewed rule (the nil id). */
function conflictLines(
  conflicts: CategorizationRuleConflictDto[],
  rules: CategorizationRuleDto[],
  categoryName: (id: string) => string,
): string[] {
  const byId = new Map(rules.map((r) => [r.id, r]))
  return conflicts.slice(0, SHOWN_CONFLICTS).map((conflict) => {
    if (conflict.winnerRuleId === PREVIEW_RULE_ID) {
      return `- ${conflict.count} opération(s) aussi reconnue(s) par la règle ${ruleName(byId.get(conflict.loserRuleId), categoryName)} : la nouvelle règle passerait avant (plus précise).`
    }
    return `- ${conflict.count} opération(s) resteraient à la règle ${ruleName(byId.get(conflict.winnerRuleId), categoryName)}, plus précise ou prioritaire.`
  })
}

export const createRuleTool = defineTool({
  name: 'create_rule',
  title: 'Créer une règle de catégorisation',
  description:
    'Create a categorization rule: transactions whose label contains `pattern` (or matches it as a regex) get `category`. The first matching rule wins and the order is computed: most specific first (regex, then the longer pattern, then account / amount conditions), unless the owner gave a rule priority in the app; transactions filed by hand are never overwritten. Without confirm: preview with how many transactions match, what re-applying the rules would change (samples) and the conflicts with existing rules (transactions another rule also matches but files differently, and which rule wins). With confirm: true it creates the rule, once (an identical rule is not created again), and with applyToExisting also re-applies the rules to existing transactions.',
  write: { idempotent: true },
  inputSchema: {
    pattern: z
      .string()
      .trim()
      .min(2)
      .max(PATTERN_MAX)
      .describe(
        'Text searched in the bank label, case-insensitive, e.g. "BOULANGERIE DUPONT" (prefer the stable merchant part, not dates or card numbers).',
      ),
    matchType: z
      .enum(['contains', 'regex'])
      .optional()
      .describe('Default contains. regex = a regular expression.'),
    category: z
      .string()
      .max(100)
      .describe('Category name or slug (see list_categories).'),
    kind: z
      .enum(['expense', 'income', 'transfer'])
      .optional()
      .describe("Kind given to matches. Default: the category's kind."),
    account: z
      .string()
      .max(100)
      .optional()
      .describe('Only transactions of this account. Default: every account.'),
    applyToExisting: z
      .boolean()
      .optional()
      .describe(
        'true: also re-run the rules on existing transactions (uncategorized ones and those filed by a rule) once it is created. Default false: only future imports.',
      ),
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    const [categories, accounts, rules] = await Promise.all([
      listCategories(api),
      args.account ? listAccounts(api) : Promise.resolve([]),
      api.get<CategorizationRuleDto[]>('/api/categorization-rules'),
    ])
    const category = pickCategory(categories, args.category)
    if (!category) {
      throw new ToolInputError('Une règle doit donner une catégorie.')
    }
    const account = args.account ? pickAccount(accounts, args.account) : null
    const rule = {
      matchType: args.matchType ?? 'contains',
      labelPattern: args.pattern,
      categoryId: category.id,
      kind: args.kind ?? null,
      accountId: account?.id ?? null,
    } satisfies CreateCategorizationRuleDto
    const describe = [
      `- Libellé ${rule.matchType === 'regex' ? `correspondant à /${rule.labelPattern}/` : `contenant « ${rule.labelPattern} »`}${account ? `, compte ${account.name}` : ''}`,
      `- → ${category.name}${rule.kind ? ` (${KIND_LABELS[rule.kind]})` : ''}`,
    ]

    const existing = rules.find(
      (r) =>
        r.matchType === rule.matchType &&
        normalize(r.labelPattern) === normalize(rule.labelPattern) &&
        r.categoryId === rule.categoryId &&
        (r.accountId ?? null) === rule.accountId &&
        (r.kind ?? null) === rule.kind &&
        r.minAmountCents === null &&
        r.maxAmountCents === null,
    )
    if (existing) {
      return [
        `Rien à créer : une règle identique existe déjà (rang ${existing.rank + 1} dans l'ordre d'évaluation${existing.enabled ? '' : ', désactivée'}).`,
        ...describe,
      ].join('\n')
    }

    if (args.confirm !== true) {
      const preview = await api.send<CategorizationRulePreviewDto>(
        'POST',
        '/api/categorization-rules/preview',
        rule,
      )
      const names = new Map(categories.map((c) => [c.id, c.name]))
      const name = (id: string | null) =>
        id ? (names.get(id) ?? 'catégorie inconnue') : 'sans catégorie'
      const conflicts = conflictLines(preview.conflicts, rules, name)
      const samples = preview.transactions
        .slice(0, SHOWN_CHANGES)
        .map(
          (t) =>
            `- ${frenchDate(t.bookingDate)} · ${signedEuros(t.amountCents)} · ${t.rawLabel} : ${name(t.categoryId)} → ${name(t.nextCategoryId)}`,
        )
      return [
        PREVIEW_HEADER,
        `Règle qui serait créée (sa place dans l'ordre est calculée : la plus précise d'abord) :`,
        ...describe,
        '',
        `Opérations existantes correspondant au libellé : ${preview.matched}.`,
        args.applyToExisting
          ? `En réappliquant les règles (applyToExisting) : ${preview.changed} opération(s) changeraient de catégorie, ${preview.leavingReview} ne seraient plus à revoir, ${preview.released} perdraient leur catégorie de règle.`
          : `Les opérations existantes ne changeraient pas (applyToExisting non demandé) ; réappliquer les règles en changerait ${preview.changed}.`,
        ...(samples.length > 0
          ? [
              `Exemples${preview.changed > samples.length ? ` (${samples.length} sur ${preview.changed})` : ''} :`,
              ...samples,
            ]
          : []),
        ...(conflicts.length > 0
          ? [
              '',
              `Conflits avec des règles existantes (mêmes opérations, autre catégorie) :`,
              ...conflicts,
              "Pour faire gagner une autre règle : « Faire gagner cette règle » sur la page Règles de l'application.",
            ]
          : []),
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }

    const created = await api.send<CategorizationRuleDto>(
      'POST',
      '/api/categorization-rules',
      rule,
    )
    const lines = [
      `Règle créée (rang ${created.rank + 1} dans l'ordre d'évaluation, id ${created.id}) :`,
      ...describe,
    ]
    if (args.applyToExisting) {
      const applied = await api.send<ApplyCategorizationRulesResultDto>(
        'POST',
        '/api/categorization-rules/apply',
        {},
      )
      lines.push(
        `Règles réappliquées : ${applied.updated} opération(s) modifiée(s) sur ${applied.scanned} examinée(s) (${applied.manualSkipped} classée(s) à la main laissée(s) telles quelles).`,
      )
    }
    lines.push(
      '',
      "Pour annuler : supprimez la règle dans l'application (page Règles) ; les opérations qu'elle a classées repassent alors par les autres règles. Aucun outil MCP ne supprime.",
    )
    return lines.join('\n')
  },
})
