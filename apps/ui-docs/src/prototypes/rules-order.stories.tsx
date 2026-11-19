import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge, Button, Card, CategoryIcon, cn } from '@finances/ui'
import {
  ArrowDownUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  WandSparklesIcon,
} from 'lucide-react'
import { useState } from 'react'

/**
 * Prototypes of the « Ordre d'évaluation » card of the rules page (#299),
 * shown to the owner before one is built in `apps/web`; the owner chose A. Clickable mockups
 * with synthetic rules, not app code: the buttons do nothing.
 *
 * The card before: a long paragraph explaining the order, then a numbered
 * list of plain text (« Libellé contient « X » → Catégorie · priorité +1 »)
 * that wraps on three lines per rule on a phone.
 *
 * A. Liste numérotée : every rule as a row like the rule list: its rank in a
 *    badge, the text in bold, its category below, « priorité » only when set.
 * B. Par niveau : the same rules in two short sections, « Prioritaires »
 *    then « Automatique », one line per rule (rank, text, category icon).
 * C. Ce qui compte : the order only matters where rules overlap, so the
 *    card shows those pairs (who passes first, « Inverser »), the whole
 *    order folded below.
 */
const meta: Meta = {
  title: 'Prototypes/Rules order (#299)',
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile' },
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

/* ---------------------------------------------------------------------------
 * Synthetic data
 * ------------------------------------------------------------------------- */

interface Category {
  name: string
  icon: string
  color: string
}

const CATEGORIES = {
  restaurants: {
    name: 'Restaurants & cafés',
    icon: 'utensils',
    color: '#ca8a04',
  },
  transport: { name: 'Transport', icon: 'train-front', color: '#0891b2' },
  groceries: { name: 'Courses', icon: 'shopping-cart', color: '#d97706' },
  subscriptions: { name: 'Abonnements', icon: 'repeat', color: '#7c3aed' },
  telecom: { name: 'Télécom', icon: 'smartphone', color: '#2563eb' },
  savings: { name: 'Épargne', icon: 'piggy-bank', color: '#0284c7' },
  internal: {
    name: 'Virement interne',
    icon: 'arrow-left-right',
    color: '#64748b',
  },
} satisfies Record<string, Category>

interface Rule {
  pattern: string
  category: Category
  priority: number
  enabled?: boolean
}

/** In evaluation order: priority first, then the longer text. */
const RULES: Rule[] = [
  { pattern: 'UBER', category: CATEGORIES.transport, priority: 1 },
  {
    pattern: 'DEPUIS COMPTE COURANT',
    category: CATEGORIES.savings,
    priority: 0,
  },
  {
    pattern: 'VERS COMPTE COURANT',
    category: CATEGORIES.internal,
    priority: 0,
  },
  { pattern: 'BOUYGUES TELECOM', category: CATEGORIES.telecom, priority: 0 },
  { pattern: 'UBER EATS', category: CATEGORIES.restaurants, priority: 0 },
  { pattern: 'CARREFOUR', category: CATEGORIES.groceries, priority: 0 },
  {
    pattern: 'VIDEOPASS',
    category: CATEGORIES.subscriptions,
    priority: 0,
    enabled: false,
  },
  { pattern: 'MONOPRIX', category: CATEGORIES.groceries, priority: 0 },
  { pattern: 'NETFLIX', category: CATEGORIES.subscriptions, priority: 0 },
  { pattern: 'PICARD', category: CATEGORIES.groceries, priority: 0 },
]

/** Overlapping pairs: the first passes before the second. */
const OVERLAPS: { first: number; second: number; count: number }[] = [
  { first: 0, second: 4, count: 22 },
]

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------- */

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background min-h-screen space-y-4 p-4">
      <p className="text-muted-foreground text-xs">
        … les règles par catégorie, au-dessus.
      </p>
      {children}
    </div>
  )
}

function Rank({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="bg-muted text-muted-foreground inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums"
    >
      {n}
    </span>
  )
}

function PriorityBadge({ rule }: { rule: Rule }) {
  if (rule.priority === 0) return null
  return (
    <Badge variant="info" outline>
      priorité +{rule.priority}
    </Badge>
  )
}

/** The folded card header shared by the three directions. */
function Folded({
  title,
  meta,
  defaultOpen = true,
  children,
}: {
  title: string
  meta: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/60 flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="text-muted-foreground block text-xs">{meta}</span>
        </span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            'text-muted-foreground size-[0.8rem] shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="border-t">{children}</div>}
    </Card>
  )
}

function ApplyButton() {
  return (
    <div className="border-t p-4">
      <Button
        variant="secondary"
        outline
        className="w-full"
        iconStart={<WandSparklesIcon />}
      >
        Réappliquer toutes les règles
      </Button>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * A. Liste numérotée
 * ------------------------------------------------------------------------- */

function DirectionA() {
  return (
    <Page>
      <Folded
        title="Ordre d’évaluation"
        meta={`Avancé · ${RULES.length} règles`}
      >
        <ol className="divide-y">
          {RULES.map((rule, i) => (
            <li key={rule.pattern}>
              <button
                type="button"
                className="hover:bg-muted/60 flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left"
              >
                <Rank n={i + 1} />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span
                    className={cn(
                      'block text-sm font-medium break-words',
                      rule.enabled === false && 'text-muted-foreground',
                    )}
                  >
                    {rule.pattern}
                  </span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                    <CategoryIcon
                      icon={rule.category.icon}
                      color={rule.category.color}
                      size="sm"
                    />
                    {rule.category.name}
                    <PriorityBadge rule={rule} />
                    {rule.enabled === false && (
                      <Badge variant="secondary" outline>
                        Désactivée
                      </Badge>
                    )}
                  </span>
                </span>
                <ChevronRightIcon
                  aria-hidden
                  className="text-muted-foreground size-[0.8rem] shrink-0"
                />
              </button>
            </li>
          ))}
        </ol>
        <ApplyButton />
      </Folded>
    </Page>
  )
}

/* ---------------------------------------------------------------------------
 * B. Par niveau
 * ------------------------------------------------------------------------- */

function CompactRow({ rule, n }: { rule: Rule; n: number }) {
  return (
    <li>
      <button
        type="button"
        className="hover:bg-muted/60 flex min-h-11 w-full items-center gap-3 px-4 text-left"
      >
        <span className="text-muted-foreground w-5 shrink-0 text-right text-xs tabular-nums">
          {n}
        </span>
        <CategoryIcon
          icon={rule.category.icon}
          color={rule.category.color}
          size="sm"
          label={rule.category.name}
        />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-medium',
            rule.enabled === false && 'text-muted-foreground line-through',
          )}
        >
          {rule.pattern}
        </span>
        {rule.priority !== 0 && (
          <span className="text-info shrink-0 text-xs font-medium">
            +{rule.priority}
          </span>
        )}
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-[0.8rem] shrink-0"
        />
      </button>
    </li>
  )
}

function DirectionB() {
  const pinned = RULES.filter((rule) => rule.priority !== 0)
  const auto = RULES.filter((rule) => rule.priority === 0)
  return (
    <Page>
      <Folded
        title="Ordre d’évaluation"
        meta={`Avancé · ${RULES.length} règles`}
      >
        <h3 className="bg-muted/40 text-muted-foreground px-4 py-2 text-xs font-medium">
          Prioritaires
        </h3>
        <ol className="divide-y">
          {pinned.map((rule, i) => (
            <CompactRow key={rule.pattern} rule={rule} n={i + 1} />
          ))}
        </ol>
        <h3 className="bg-muted/40 text-muted-foreground border-t px-4 py-2 text-xs font-medium">
          Automatique · la plus précise d’abord
        </h3>
        <ol className="divide-y">
          {auto.map((rule, i) => (
            <CompactRow
              key={rule.pattern}
              rule={rule}
              n={pinned.length + i + 1}
            />
          ))}
        </ol>
        <ApplyButton />
      </Folded>
    </Page>
  )
}

/* ---------------------------------------------------------------------------
 * C. Ce qui compte
 * ------------------------------------------------------------------------- */

function RuleChip({ rule }: { rule: Rule }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CategoryIcon
        icon={rule.category.icon}
        color={rule.category.color}
        size="md"
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">
          {rule.pattern}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {rule.category.name}
        </span>
      </span>
    </span>
  )
}

function DirectionC() {
  const [all, setAll] = useState(false)
  return (
    <Page>
      <Folded title="Ordre d’évaluation" meta="Avancé · 1 chevauchement">
        <ul className="divide-y">
          {OVERLAPS.map(({ first, second, count }) => (
            <li key={`${first}-${second}`} className="space-y-3 p-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground w-10 shrink-0 text-xs">
                    D’abord
                  </span>
                  <RuleChip rule={RULES[first]} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground w-10 shrink-0 text-xs">
                    Puis
                  </span>
                  <RuleChip rule={RULES[second]} />
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                {count} opérations reconnues par les deux
              </p>
              <Button
                variant="secondary"
                outline
                className="w-full"
                iconStart={<ArrowDownUpIcon />}
              >
                Inverser
              </Button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll((v) => !v)}
          className="hover:bg-muted/60 flex min-h-11 w-full items-center gap-3 border-t px-4 text-left text-sm"
        >
          <span className="flex-1">
            Toutes les règles dans l’ordre ({RULES.length})
          </span>
          <ChevronDownIcon
            aria-hidden
            className={cn(
              'text-muted-foreground size-[0.8rem] transition-transform',
              all && 'rotate-180',
            )}
          />
        </button>
        {all && (
          <ol className="divide-y border-t">
            {RULES.map((rule, i) => (
              <CompactRow key={rule.pattern} rule={rule} n={i + 1} />
            ))}
          </ol>
        )}
        <ApplyButton />
      </Folded>
    </Page>
  )
}

export const ListeNumerotee: StoryObj = {
  name: 'A. Liste numérotée',
  render: () => <DirectionA />,
}

export const ParNiveau: StoryObj = {
  name: 'B. Par niveau',
  render: () => <DirectionB />,
}

export const CeQuiCompte: StoryObj = {
  name: 'C. Ce qui compte',
  render: () => <DirectionC />,
}
