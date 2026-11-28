/**
 * Categorization rules as Claude sees them (#531): `list_rules` reads the
 * rules in evaluation order with their matches over 12 months and the
 * conflicts between them, so a new rule is not a duplicate; `update_rule`
 * edits one (pattern, category, enabled) after a preview. Deleting a rule and
 * « Faire gagner cette règle » stay in the app.
 */
import { z } from 'zod'
import type { ApiClient } from '../api/client.js'
import type {
  AccountDto,
  ApplyCategorizationRulesResultDto,
  CategorizationRuleConflictDto,
  CategorizationRuleDto,
  CategorizationRulePreviewDto,
  CategorizationRulesInsightsDto,
  CategoryDto,
  PreviewCategorizationRuleDto,
  UpdateCategorizationRuleDto,
} from '../api/types.js'
import { frenchDate, signedEuros } from '../format.js'
import { KIND_LABELS } from './labels.js'
import {
  listAccounts,
  listCategories,
  normalize,
  pickCategory,
  UUID_PATTERN,
} from './lookup.js'
import { defineTool, ToolInputError } from './tool.js'
import { confirmSchema, PREVIEW_FOOTER, PREVIEW_HEADER } from './write.js'

const PATTERN_MAX = 255
const SHOWN_CHANGES = 10
const SHOWN_CONFLICTS = 10

interface Names {
  category: (id: string | null) => string
  account: (id: string) => string
}

function namesOf(categories: CategoryDto[], accounts: AccountDto[]): Names {
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]))
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]))
  return {
    category: (id) =>
      id ? (categoryNames.get(id) ?? 'catégorie inconnue') : 'sans catégorie',
    account: (id) => accountNames.get(id) ?? 'un compte supprimé',
  }
}

/** `« UBER » → Transport`: a rule named in a sentence. */
export function ruleName(
  rule: CategorizationRuleDto | undefined,
  names: Names,
): string {
  if (!rule) return 'une règle supprimée'
  return `« ${rule.labelPattern} » → ${names.category(rule.categoryId)}`
}

/** The rule as a sentence: its conditions, then what it gives. */
export function ruleSentence(
  rule: CategorizationRuleDto,
  names: Names,
): string {
  const { minAmountCents: min, maxAmountCents: max } = rule
  const amount =
    min !== null && max !== null
      ? min === max
        ? `montant ${signedEuros(min)}`
        : `entre ${signedEuros(min)} et ${signedEuros(max)}`
      : min !== null
        ? `à partir de ${signedEuros(min)}`
        : max !== null
          ? `jusqu’à ${signedEuros(max)}`
          : null
  const conditions = [
    rule.matchType === 'regex'
      ? `libellé correspondant à /${rule.labelPattern}/`
      : `libellé contenant « ${rule.labelPattern} »`,
    rule.accountId ? `compte ${names.account(rule.accountId)}` : null,
    amount,
  ].filter((part) => part !== null)
  const gives = [
    names.category(rule.categoryId),
    rule.merchant ? `marchand « ${rule.merchant} »` : null,
    rule.counterpartAccountId
      ? `virement lié à ${names.account(rule.counterpartAccountId)}`
      : null,
  ].filter((part) => part !== null)
  return `${conditions.join(', ')} → ${gives.join(', ')}`
}

/** `- 4 opération(s) : « A » → X gagne sur « B » → Y.` */
function conflictLine(
  conflict: CategorizationRuleConflictDto,
  byId: Map<string, CategorizationRuleDto>,
  names: Names,
): string {
  return `- ${conflict.count} opération(s) : ${ruleName(byId.get(conflict.winnerRuleId), names)} (gagne) sur ${ruleName(byId.get(conflict.loserRuleId), names)}.`
}

export const listRulesTool = defineTool({
  name: 'list_rules',
  title: 'Règles de catégorisation',
  description:
    'Categorization rules by category, in evaluation order (rank 1 is tried first), with their id, whether they are enabled, how many transactions of the last 12 months they match, and the conflicts between them (same transactions, other category: which rule wins). Read them before create_rule or update_rule.',
  inputSchema: {
    category: z
      .string()
      .max(100)
      .optional()
      .describe(
        'Only the rules giving this category (name or slug), and their conflicts.',
      ),
  },
  async run({ api }, args) {
    const [rules, insights, categories, accounts] = await Promise.all([
      api.get<CategorizationRuleDto[]>('/api/categorization-rules'),
      api.get<CategorizationRulesInsightsDto>(
        '/api/categorization-rules/insights',
      ),
      listCategories(api),
      listAccounts(api),
    ])
    const names = namesOf(categories, accounts)
    const only = args.category ? pickCategory(categories, args.category) : null
    if (args.category && !only) {
      throw new ToolInputError(
        'Une règle donne toujours une catégorie : choisissez-en une.',
      )
    }
    const shown = rules
      .filter((r) => !only || r.categoryId === only.id)
      .sort((a, b) => a.rank - b.rank)
    if (shown.length === 0) {
      return only
        ? `Aucune règle ne donne la catégorie ${only.name}.`
        : 'Aucune règle de catégorisation.'
    }
    const matches = new Map(insights.rules.map((u) => [u.ruleId, u.matchCount]))
    const byId = new Map(rules.map((r) => [r.id, r]))
    const ids = new Set(shown.map((r) => r.id))

    const lines = [
      `${shown.length} règle(s)${only ? ` donnant ${only.name}` : ''}, ${rules.length} en tout. Correspondances : opérations depuis le ${frenchDate(insights.since)}, quelle que soit leur catégorie. La règle la plus précise est essayée d'abord (rang 1), la première qui correspond gagne ; les opérations classées à la main ne changent jamais.`,
    ]
    const byCategory = new Map<string, CategorizationRuleDto[]>()
    for (const rule of shown) {
      byCategory.set(rule.categoryId, [
        ...(byCategory.get(rule.categoryId) ?? []),
        rule,
      ])
    }
    const groups = [...byCategory].sort(([a], [b]) =>
      names.category(a).localeCompare(names.category(b), 'fr'),
    )
    for (const [categoryId, ofCategory] of groups) {
      const category = categories.find((c) => c.id === categoryId)
      lines.push(
        '',
        `${names.category(categoryId)}${category ? ` (${KIND_LABELS[category.kind]}${category.archivedAt ? ', archivée' : ''})` : ''} :`,
        ...ofCategory.map(
          (r) =>
            `- rang ${r.rank + 1}${r.enabled ? '' : ' [désactivée]'} · ${ruleSentence(r, names)} · ${matches.get(r.id) ?? 0} correspondance(s) · id ${r.id}`,
        ),
      )
    }

    const conflicts = insights.conflicts.filter(
      (c) => !only || ids.has(c.winnerRuleId) || ids.has(c.loserRuleId),
    )
    lines.push('')
    if (conflicts.length === 0) {
      lines.push('Aucun conflit entre règles actives.')
    } else {
      lines.push(
        `Conflits (${conflicts.length}, règles actives reconnaissant les mêmes opérations pour une autre catégorie) :`,
        ...conflicts
          .slice(0, SHOWN_CONFLICTS)
          .map((c) => conflictLine(c, byId, names)),
        ...(conflicts.length > SHOWN_CONFLICTS
          ? [`… et ${conflicts.length - SHOWN_CONFLICTS} autre(s).`]
          : []),
        "Pour faire gagner l'autre règle : « Faire gagner cette règle » sur la page Règles de l'application.",
      )
    }
    return lines.join('\n')
  },
})

/** The fields `update_rule` would change, compared with the saved rule. */
function changesOf(
  rule: CategorizationRuleDto,
  wanted: UpdateCategorizationRuleDto,
): UpdateCategorizationRuleDto {
  const changes: UpdateCategorizationRuleDto = {}
  if (
    wanted.labelPattern !== undefined &&
    wanted.labelPattern !== rule.labelPattern
  )
    changes.labelPattern = wanted.labelPattern
  if (wanted.matchType !== undefined && wanted.matchType !== rule.matchType)
    changes.matchType = wanted.matchType
  if (wanted.categoryId !== undefined && wanted.categoryId !== rule.categoryId)
    changes.categoryId = wanted.categoryId
  if (wanted.enabled !== undefined && wanted.enabled !== rule.enabled)
    changes.enabled = wanted.enabled
  return changes
}

async function previewEdit(
  api: ApiClient,
  rule: CategorizationRuleDto,
  edited: CategorizationRuleDto,
): Promise<CategorizationRulePreviewDto> {
  const body = {
    ruleId: rule.id,
    enabled: edited.enabled,
    priority: edited.priority,
    matchType: edited.matchType,
    labelPattern: edited.labelPattern,
    accountId: edited.accountId,
    minAmountCents: edited.minAmountCents,
    maxAmountCents: edited.maxAmountCents,
    categoryId: edited.categoryId,
    merchant: edited.merchant,
    counterpartAccountId: edited.counterpartAccountId,
  } satisfies PreviewCategorizationRuleDto
  return api.send<CategorizationRulePreviewDto>(
    'POST',
    '/api/categorization-rules/preview',
    body,
  )
}

export const updateRuleTool = defineTool({
  name: 'update_rule',
  title: 'Modifier une règle de catégorisation',
  description:
    'Edit a categorization rule (id from list_rules): its pattern, its category, or turn it off or on. The preview shows before → after, what re-applying the rules would change and the conflicts. Deleting a rule stays in the app.',
  write: { idempotent: true },
  inputSchema: {
    rule: z.string().regex(UUID_PATTERN).describe('Rule id (list_rules).'),
    pattern: z.string().trim().min(2).max(PATTERN_MAX).optional(),
    matchType: z.enum(['contains', 'regex']).optional(),
    category: z.string().max(100).optional().describe('Category name or slug.'),
    enabled: z.boolean().optional(),
    applyToExisting: z
      .boolean()
      .optional()
      .describe(
        'true: re-run the rules on existing transactions once saved. Default: next imports only.',
      ),
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    const [rules, categories, accounts] = await Promise.all([
      api.get<CategorizationRuleDto[]>('/api/categorization-rules'),
      listCategories(api),
      listAccounts(api),
    ])
    const rule = rules.find((r) => r.id === args.rule)
    if (!rule) {
      throw new ToolInputError(
        'Règle introuvable : prenez son id dans list_rules.',
      )
    }
    const category = args.category
      ? pickCategory(categories, args.category)
      : undefined
    if (category === null) {
      throw new ToolInputError('Une règle doit donner une catégorie.')
    }
    const changes = changesOf(rule, {
      labelPattern: args.pattern,
      matchType: args.matchType,
      categoryId: category?.id,
      enabled: args.enabled,
    })
    const names = namesOf(categories, accounts)
    const edited = { ...rule, ...changes } as CategorizationRuleDto
    const before = `- Avant : ${ruleSentence(rule, names)}${rule.enabled ? '' : ' [désactivée]'}`
    const after = `- Après : ${ruleSentence(edited, names)}${edited.enabled ? '' : ' [désactivée]'}`

    if (Object.keys(changes).length === 0) {
      return [
        `Rien à modifier : la règle (rang ${rule.rank + 1}) est déjà ainsi.`,
        before.replace('Avant', 'Règle'),
      ].join('\n')
    }
    if (
      rules.some(
        (r) =>
          r.id !== rule.id &&
          r.matchType === edited.matchType &&
          normalize(r.labelPattern) === normalize(edited.labelPattern) &&
          r.categoryId === edited.categoryId &&
          r.accountId === edited.accountId &&
          r.minAmountCents === edited.minAmountCents &&
          r.maxAmountCents === edited.maxAmountCents,
      )
    ) {
      throw new ToolInputError(
        'Une autre règle identique existe déjà (voir list_rules) : rien n’a été modifié.',
      )
    }

    if (args.confirm !== true) {
      const preview = await previewEdit(api, rule, edited)
      const byId = new Map(rules.map((r) => [r.id, r]))
      byId.set(rule.id, edited)
      const samples = preview.transactions
        .slice(0, SHOWN_CHANGES)
        .map(
          (t) =>
            `- ${frenchDate(t.bookingDate)} · ${signedEuros(t.amountCents)} · ${t.rawLabel} : ${names.category(t.categoryId)} → ${names.category(t.nextCategoryId)}`,
        )
      const kind = categories.find((c) => c.id === edited.categoryId)?.kind
      return [
        PREVIEW_HEADER,
        `Règle modifiée (rang ${rule.rank + 1} aujourd'hui ; sa place est recalculée) :`,
        before,
        `${after}${kind ? ` (${KIND_LABELS[kind]})` : ''}`,
        '',
        args.applyToExisting
          ? `En réappliquant les règles (applyToExisting) : ${preview.changed} opération(s) changeraient de catégorie (${preview.matched} reconnue(s) par la règle modifiée, ${preview.released} qu'elle ne gagnerait plus, ${preview.leavingReview} ne seraient plus à revoir).`
          : `Les opérations existantes ne changeraient pas (applyToExisting non demandé) ; réappliquer les règles en changerait ${preview.changed}.`,
        ...(samples.length > 0
          ? [
              `Exemples${preview.changed > samples.length ? ` (${samples.length} sur ${preview.changed})` : ''} :`,
              ...samples,
            ]
          : []),
        ...(preview.conflicts.length > 0
          ? [
              '',
              'Conflits avec d’autres règles (mêmes opérations, autre catégorie) :',
              ...preview.conflicts
                .slice(0, SHOWN_CONFLICTS)
                .map((c) => conflictLine(c, byId, names)),
            ]
          : []),
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }

    const saved = await api.send<CategorizationRuleDto>(
      'PATCH',
      `/api/categorization-rules/${rule.id}`,
      changes,
    )
    const lines = [
      `Règle modifiée (rang ${saved.rank + 1} dans l'ordre d'évaluation) :`,
      before,
      after,
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
      'Pour revenir en arrière : rappelez update_rule avec les valeurs d’avant.',
    )
    return lines.join('\n')
  },
})
