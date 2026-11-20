/*
 * #396 prototypes: how a transaction's kind and category are chosen, drawn
 * in the stepped frame of #385 (round ✕, title, round ›, steps). Three
 * directions for the owner to choose from; deleted by the PR that builds the
 * chosen one. Synthetic data only (the default categories, invented labels).
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronRightIcon,
  EuroIcon,
  SearchIcon,
  TagIcon,
  XIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import * as React from 'react'

import {
  CategoryIcon,
  categoryIconComponent,
  cn,
  Input,
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetSteps,
} from '@finances/ui'

/* ---------------------------------------------------------------------------
 * Synthetic data
 * ------------------------------------------------------------------------ */

type Kind = 'expense' | 'income' | 'transfer'

interface Category {
  id: string
  name: string
  kind: Kind
  color: string
  icon: string
}

const CATEGORIES: Category[] = [
  {
    id: 'rent',
    name: 'Loyer',
    kind: 'expense',
    color: '#dc2626',
    icon: 'house',
  },
  {
    id: 'energy',
    name: 'Énergie',
    kind: 'expense',
    color: '#ea580c',
    icon: 'zap',
  },
  {
    id: 'groceries',
    name: 'Courses',
    kind: 'expense',
    color: '#d97706',
    icon: 'shopping-cart',
  },
  {
    id: 'restaurants',
    name: 'Restaurants & cafés',
    kind: 'expense',
    color: '#ca8a04',
    icon: 'utensils',
  },
  {
    id: 'transport',
    name: 'Transport',
    kind: 'expense',
    color: '#0891b2',
    icon: 'train-front',
  },
  {
    id: 'subscriptions',
    name: 'Abonnements',
    kind: 'expense',
    color: '#7c3aed',
    icon: 'repeat',
  },
  {
    id: 'insurance',
    name: 'Assurances',
    kind: 'expense',
    color: '#4f46e5',
    icon: 'shield',
  },
  {
    id: 'telecom',
    name: 'Télécom',
    kind: 'expense',
    color: '#2563eb',
    icon: 'smartphone',
  },
  {
    id: 'health',
    name: 'Santé',
    kind: 'expense',
    color: '#e11d48',
    icon: 'heart-pulse',
  },
  {
    id: 'shopping',
    name: 'Shopping',
    kind: 'expense',
    color: '#db2777',
    icon: 'shopping-bag',
  },
  {
    id: 'leisure',
    name: 'Loisirs',
    kind: 'expense',
    color: '#c026d3',
    icon: 'ticket',
  },
  {
    id: 'travel',
    name: 'Voyages',
    kind: 'expense',
    color: '#0d9488',
    icon: 'plane',
  },
  {
    id: 'bank-fees',
    name: 'Frais bancaires',
    kind: 'expense',
    color: '#57534e',
    icon: 'landmark',
  },
  {
    id: 'cash',
    name: 'Retraits d’espèces',
    kind: 'expense',
    color: '#78716c',
    icon: 'banknote',
  },
  {
    id: 'taxes',
    name: 'Impôts',
    kind: 'expense',
    color: '#9f1239',
    icon: 'receipt',
  },
  {
    id: 'gifts',
    name: 'Cadeaux',
    kind: 'expense',
    color: '#be185d',
    icon: 'gift',
  },
  {
    id: 'other-expenses',
    name: 'Autres dépenses',
    kind: 'expense',
    color: '#6b7280',
    icon: 'tag',
  },
  {
    id: 'salary',
    name: 'Salaire',
    kind: 'income',
    color: '#15803d',
    icon: 'briefcase',
  },
  {
    id: 'family',
    name: 'Aide familiale',
    kind: 'income',
    color: '#16a34a',
    icon: 'hand-heart',
  },
  {
    id: 'vouchers',
    name: 'Titres-restaurant',
    kind: 'income',
    color: '#0f766e',
    icon: 'utensils',
  },
  {
    id: 'benefits',
    name: 'Aides & allocations',
    kind: 'income',
    color: '#65a30d',
    icon: 'hand-coins',
  },
  {
    id: 'refunds',
    name: 'Remboursements',
    kind: 'income',
    color: '#059669',
    icon: 'undo-2',
  },
  {
    id: 'other-income',
    name: 'Autres revenus',
    kind: 'income',
    color: '#4d7c0f',
    icon: 'coins',
  },
  {
    id: 'internal',
    name: 'Virement interne',
    kind: 'transfer',
    color: '#64748b',
    icon: 'arrow-left-right',
  },
  {
    id: 'savings',
    name: 'Épargne',
    kind: 'transfer',
    color: '#0284c7',
    icon: 'piggy-bank',
  },
  {
    id: 'investment',
    name: 'Investissement',
    kind: 'transfer',
    color: '#0369a1',
    icon: 'trending-up',
  },
]

/** « Habituels »: usual labels with their category (invented). */
const HABITS: Record<Kind, { label: string; categoryId: string }[]> = {
  expense: [
    { label: 'Boulangerie Démo', categoryId: 'groceries' },
    { label: 'Brasserie du Coin', categoryId: 'restaurants' },
    { label: 'Supérette Démo', categoryId: 'groceries' },
    { label: 'Pass Navigo', categoryId: 'transport' },
  ],
  income: [{ label: 'Salaire Démo', categoryId: 'salary' }],
  transfer: [{ label: 'Vers le Livret A', categoryId: 'savings' }],
}

/** The kind's most used categories. */
const MOST_USED: Record<Kind, string[]> = {
  expense: ['groceries', 'restaurants', 'transport'],
  income: ['salary', 'refunds'],
  transfer: ['savings', 'internal'],
}

const KINDS: {
  id: Kind
  label: string
  line: string
  title: string
  icon: LucideIcon
  color: string
}[] = [
  {
    id: 'expense',
    label: 'Dépense',
    line: 'Vous payez',
    title: 'Ajouter une dépense',
    icon: ArrowUpRightIcon,
    color: '#ea580c',
  },
  {
    id: 'income',
    label: 'Revenu',
    line: 'Vous recevez',
    title: 'Ajouter un revenu',
    icon: ArrowDownLeftIcon,
    color: '#16a34a',
  },
  {
    id: 'transfer',
    label: 'Virement',
    line: 'Entre comptes',
    title: 'Ajouter un virement',
    icon: ArrowLeftRightIcon,
    color: '#0284c7',
  },
]

const kindOf = (id: Kind) => KINDS.find((kind) => kind.id === id) ?? KINDS[0]
const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id)

/** Lowercase, without accents, for the search. */
function searchable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/* ---------------------------------------------------------------------------
 * The picker's state (shared by the three directions)
 * ------------------------------------------------------------------------ */

function usePicker(initialKind: Kind = 'expense') {
  const [kind, setKind] = React.useState<Kind>(initialKind)
  const [query, setQuery] = React.useState('')
  const [chosen, setChosen] = React.useState<string | null>(null)
  const [habit, setHabit] = React.useState<string | null>(null)
  const wanted = searchable(query.trim())
  const ofKind = CATEGORIES.filter((c) => c.kind === kind)
  const matches = ofKind.filter(
    (c) => wanted === '' || searchable(c.name).includes(wanted),
  )
  const habits = HABITS[kind].filter(
    (h) =>
      wanted === '' ||
      searchable(h.label).includes(wanted) ||
      searchable(categoryOf(h.categoryId)?.name ?? '').includes(wanted),
  )
  const mostUsed =
    wanted === ''
      ? MOST_USED[kind].map((id) => categoryOf(id)).filter((c) => c != null)
      : []
  const all = [...matches].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  return {
    kind,
    setKind: (next: Kind) => {
      setKind(next)
      setChosen(null)
      setHabit(null)
    },
    query,
    setQuery,
    chosen,
    choose: (id: string) => {
      setChosen(id)
      setHabit(null)
    },
    habit,
    pickHabit: (label: string, categoryId: string) => {
      setHabit(label)
      setChosen(categoryId)
    },
    habits,
    mostUsed,
    all,
  }
}

type Picker = ReturnType<typeof usePicker>

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------ */

/** The app's 22px root, so rem-sized parts look like the app. */
function AppRoot({ children }: { children: React.ReactNode }) {
  React.useLayoutEffect(() => {
    const root = document.documentElement
    const before = root.style.fontSize
    root.style.fontSize = '22px'
    return () => {
      root.style.fontSize = before
    }
  }, [])
  return <>{children}</>
}

function SearchField({ picker }: { picker: Picker }) {
  return (
    <div className="relative">
      <SearchIcon
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2"
      />
      <Input
        type="search"
        aria-label="Rechercher une catégorie"
        placeholder="Rechercher"
        value={picker.query}
        onChange={(event) => picker.setQuery(event.target.value)}
        className="h-11 pl-10 text-[16px]"
      />
      {picker.query !== '' && (
        <button
          type="button"
          aria-label="Effacer"
          onClick={() => picker.setQuery('')}
          className="text-muted-foreground absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full"
        >
          <XIcon className="size-[16px]" />
        </button>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground px-4 pt-4 pb-1 text-[12px] font-semibold tracking-wide uppercase">
      {children}
    </p>
  )
}

/** One category: its icon, its name, a check once chosen. */
function CategoryRow({
  category,
  chosen,
  onChoose,
  detail,
}: {
  category: Category
  chosen: boolean
  onChoose: () => void
  detail?: string
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={chosen}
        onClick={onChoose}
        className={cn(
          'flex min-h-[52px] w-full items-center gap-3 px-4 text-left outline-none',
          'hover:bg-muted/50 focus-visible:bg-muted/60',
          chosen && 'bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]',
        )}
      >
        <CategoryIcon icon={category.icon} color={category.color} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-[16px]',
              chosen && 'font-semibold',
            )}
          >
            {category.name}
          </span>
          {detail && (
            <span className="text-muted-foreground block truncate text-[13px]">
              {detail}
            </span>
          )}
        </span>
        {chosen && (
          <CheckIcon
            aria-hidden
            className="text-primary size-[20px] shrink-0"
          />
        )}
      </button>
    </li>
  )
}

/** A usual label: the label, its category under it. */
function HabitRow({
  label,
  category,
  chosen,
  onPick,
}: {
  label: string
  category: Category
  chosen: boolean
  onPick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={chosen}
        className={cn(
          'flex min-h-[52px] w-full items-center gap-3 px-4 text-left outline-none',
          'hover:bg-muted/50 focus-visible:bg-muted/60',
          chosen && 'bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]',
        )}
      >
        <CategoryIcon icon={category.icon} color={category.color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-medium">
            {label}
          </span>
          <span className="text-muted-foreground block truncate text-[13px]">
            {category.name}
          </span>
        </span>
        {chosen && (
          <CheckIcon
            aria-hidden
            className="text-primary size-[20px] shrink-0"
          />
        )}
      </button>
    </li>
  )
}

/** The list under the fixed header: usual, most used, then all (A–Z). */
function CategoryList({
  picker,
  habitsAs = 'rows',
}: {
  picker: Picker
  habitsAs?: 'rows' | 'cards'
}) {
  const { habits, mostUsed, all } = picker
  return (
    <div role="radiogroup" aria-label="Catégorie" className="pb-6">
      {habits.length > 0 &&
        (habitsAs === 'cards' ? (
          <>
            <SectionTitle>Habituels</SectionTitle>
            <ul className="flex gap-2 overflow-x-auto px-4 pt-1 pb-2 [scrollbar-width:none]">
              {habits.map((h) => {
                const category = categoryOf(h.categoryId)
                if (!category) return null
                const chosen = picker.habit === h.label
                return (
                  <li key={h.label} className="shrink-0">
                    <button
                      type="button"
                      aria-pressed={chosen}
                      onClick={() => picker.pickHabit(h.label, h.categoryId)}
                      className={cn(
                        'flex w-[150px] flex-col items-start gap-1 rounded-xl border p-2.5 text-left',
                        chosen &&
                          'border-primary bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]',
                      )}
                    >
                      <CategoryIcon
                        icon={category.icon}
                        color={category.color}
                      />
                      <span className="w-full truncate text-[15px] font-medium">
                        {h.label}
                      </span>
                      <span className="text-muted-foreground w-full truncate text-[12px]">
                        {category.name}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <>
            <SectionTitle>Habituels</SectionTitle>
            <ul className="divide-y">
              {habits.map((h) => {
                const category = categoryOf(h.categoryId)
                if (!category) return null
                return (
                  <HabitRow
                    key={h.label}
                    label={h.label}
                    category={category}
                    chosen={picker.habit === h.label}
                    onPick={() => picker.pickHabit(h.label, h.categoryId)}
                  />
                )
              })}
            </ul>
          </>
        ))}
      {mostUsed.length > 0 && (
        <>
          <SectionTitle>Les plus utilisées</SectionTitle>
          <ul className="divide-y">
            {mostUsed.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                chosen={picker.habit === null && picker.chosen === category.id}
                onChoose={() => picker.choose(category.id)}
              />
            ))}
          </ul>
        </>
      )}
      <SectionTitle>
        {picker.query.trim() === '' ? 'Toutes les catégories' : 'Résultats'}
      </SectionTitle>
      {all.length === 0 ? (
        <p className="text-muted-foreground px-4 py-3 text-[15px]">
          Aucune catégorie « {picker.query.trim()} ».
        </p>
      ) : (
        <ul className="divide-y">
          {all.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              chosen={picker.habit === null && picker.chosen === category.id}
              onChoose={() => picker.choose(category.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * The kind switch, three ways
 * ------------------------------------------------------------------------ */

/** A. Three tiles: an icon, the kind, a short line; the chosen one in its colour. */
function KindTiles({ picker }: { picker: Picker }) {
  return (
    <div role="radiogroup" aria-label="Type" className="grid grid-cols-3 gap-2">
      {KINDS.map((kind) => {
        const on = picker.kind === kind.id
        const Icon = kind.icon
        return (
          <button
            key={kind.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => picker.setKind(kind.id)}
            className={cn(
              'flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1 py-2 text-center transition-colors',
              !on && 'border-border hover:bg-muted/50',
            )}
            style={
              on
                ? {
                    borderColor: kind.color,
                    backgroundColor: `color-mix(in srgb, ${kind.color} 12%, var(--popover))`,
                  }
                : undefined
            }
          >
            <Icon
              aria-hidden
              className="size-[22px]"
              style={{ color: on ? kind.color : 'var(--muted-foreground)' }}
            />
            <span className="text-[15px] leading-tight font-semibold">
              {kind.label}
            </span>
            <span className="text-muted-foreground w-full truncate text-[11px] leading-tight">
              {kind.line}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** B. A tab bar: icon over the name, a bar under the chosen one, in its colour. */
function KindTabs({ picker }: { picker: Picker }) {
  return (
    <div role="tablist" aria-label="Type" className="grid grid-cols-3">
      {KINDS.map((kind) => {
        const on = picker.kind === kind.id
        const Icon = kind.icon
        return (
          <button
            key={kind.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => picker.setKind(kind.id)}
            className={cn(
              'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[14px]',
              on ? 'font-semibold' : 'text-muted-foreground',
            )}
            style={on ? { color: kind.color } : undefined}
          >
            <Icon aria-hidden className="size-[20px]" />
            {kind.label}
            <span
              aria-hidden
              className="absolute inset-x-5 bottom-0 h-[3px] rounded-full transition-colors"
              style={{ backgroundColor: on ? kind.color : 'transparent' }}
            />
          </button>
        )
      })}
    </div>
  )
}

/** C. A pill track with icons, the chosen kind filled with its colour. */
function KindPills({ picker }: { picker: Picker }) {
  return (
    <div
      role="radiogroup"
      aria-label="Type"
      className="bg-background/70 grid grid-cols-3 gap-1 rounded-full p-1"
    >
      {KINDS.map((kind) => {
        const on = picker.kind === kind.id
        const Icon = kind.icon
        return (
          <button
            key={kind.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => picker.setKind(kind.id)}
            className={cn(
              'flex min-h-[40px] min-w-0 items-center justify-center gap-1 rounded-full px-1 text-[14px] font-medium transition-colors',
              on ? 'text-white shadow-sm' : 'text-foreground',
            )}
            style={on ? { backgroundColor: kind.color } : undefined}
          >
            <Icon aria-hidden className="size-[16px] shrink-0" />
            {kind.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * The stepped frame of #385 around a direction
 * ------------------------------------------------------------------------ */

type Direction = 'tiles' | 'tabs' | 'pills'

function Frame({
  direction,
  width,
  height,
  desktop = false,
  singleKind,
}: {
  direction: Direction
  width: number
  height: number
  desktop?: boolean
  /** A picker for one kind (a rule, a budget): no switch. */
  singleKind?: Kind
}) {
  const picker = usePicker(singleKind)
  const kind = kindOf(picker.kind)
  const chosen = picker.chosen ? categoryOf(picker.chosen) : undefined
  const Glyph = chosen ? categoryIconComponent(chosen.icon) : TagIcon
  const switcher = singleKind ? null : direction === 'tiles' ? (
    <KindTiles picker={picker} />
  ) : direction === 'tabs' ? (
    <KindTabs picker={picker} />
  ) : (
    <KindPills picker={picker} />
  )
  return (
    <Sheet open>
      <div
        style={{ width, height }}
        className={cn(
          'bg-popover text-popover-foreground flex flex-col overflow-hidden border shadow-xl',
          desktop ? 'rounded-xl' : 'rounded-[36px]',
        )}
      >
        {!desktop && <div aria-hidden className="h-[34px] shrink-0" />}
        <SheetBar
          title={singleKind ? 'Classer dans' : kind.title}
          description={
            singleKind
              ? 'Les opérations trouvées seront classées dans cette catégorie.'
              : 'Étape 1 sur 3 : Catégorie'
          }
          steps={
            singleKind ? undefined : (
              <SheetSteps
                current="category"
                onSelect={() => undefined}
                steps={[
                  {
                    key: 'category',
                    label: chosen?.name ?? 'Catégorie',
                    icon: <Glyph aria-hidden />,
                    color: chosen?.color,
                  },
                  {
                    key: 'amount',
                    label: 'Montant',
                    icon: <EuroIcon aria-hidden />,
                    disabled: !chosen,
                  },
                  {
                    key: 'details',
                    label: 'Détails',
                    icon: <CalendarDaysIcon aria-hidden />,
                    disabled: true,
                  },
                ]}
              />
            )
          }
          action={
            <SheetBarAction
              label="Suivant"
              icon={<ChevronRightIcon aria-hidden strokeWidth={2.6} />}
              disabled={!chosen}
            />
          }
        />
        {/* Fixed: the kind switch and the search. */}
        {direction === 'tabs' ? (
          <div className="shrink-0 border-b">
            {switcher}
            <div className={cn('px-4 pb-3', switcher ? 'pt-1' : 'pt-3')}>
              <SearchField picker={picker} />
            </div>
          </div>
        ) : direction === 'pills' ? (
          <div
            className="shrink-0 space-y-3 border-b px-4 py-3"
            style={{
              backgroundColor: `color-mix(in srgb, ${kind.color} ${singleKind ? 0 : 10}%, var(--popover))`,
            }}
          >
            {switcher}
            <SearchField picker={picker} />
          </div>
        ) : (
          <div className="shrink-0 space-y-3 border-b px-4 py-3">
            {switcher}
            <SearchField picker={picker} />
          </div>
        )}
        {/* What scrolls: usual, most used, all. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <CategoryList
            picker={picker}
            habitsAs={direction === 'tabs' ? 'cards' : 'rows'}
          />
        </div>
      </div>
    </Sheet>
  )
}

function Board({
  direction,
  text,
  only,
}: {
  direction: Direction
  text: string
  /** One frame only (0–3), for screenshots. */
  only?: number
}) {
  return (
    <AppRoot>
      <div className="bg-background text-foreground min-h-screen space-y-4 p-6">
        {only === undefined && (
          <p className="text-muted-foreground max-w-[60ch] text-[15px]">
            {text}
          </p>
        )}
        <div className="flex flex-wrap items-start gap-8">
          {[
            {
              label: 'Téléphone 320 px',
              node: <Frame direction={direction} width={320} height={640} />,
            },
            {
              label: 'Téléphone 390 px',
              node: <Frame direction={direction} width={390} height={780} />,
            },
            {
              label: 'Ordinateur (fenêtre)',
              node: (
                <Frame direction={direction} width={480} height={640} desktop />
              ),
            },
            {
              label: 'Un seul type (règle, budget…): sans sélecteur',
              node: (
                <Frame
                  direction={direction}
                  width={390}
                  height={640}
                  singleKind="expense"
                />
              ),
            },
          ]
            .filter((_, index) => only === undefined || index === only)
            .map(({ label, node }) => (
              <figure key={label} className="space-y-2">
                <figcaption className="text-muted-foreground text-[13px] font-medium">
                  {label}
                </figcaption>
                {node}
              </figure>
            ))}
        </div>
      </div>
    </AppRoot>
  )
}

/** `only` from the URL (« args=only:1 »), a number or nothing. */
function toFrame(value: unknown): number | undefined {
  const frame = Number(value)
  return value === undefined || Number.isNaN(frame) ? undefined : frame
}

const meta = {
  title: 'Prototypes/Choix de la catégorie (#396)',
  parameters: { layout: 'fullscreen' },
  argTypes: { only: { control: 'number' } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const A_Tuiles: Story = {
  name: 'A. Tuiles',
  render: (args) => (
    <Board
      only={toFrame((args as { only?: unknown }).only)}
      direction="tiles"
      text="A. Trois tuiles pour le type (une icône, le nom, une ligne), la tuile choisie dans sa couleur ; la recherche dessous, fixe. Puis la liste : « Habituels » (le libellé et sa catégorie), « Les plus utilisées », « Toutes les catégories » de A à Z, une ligne par catégorie."
    />
  ),
}

export const B_Onglets: Story = {
  name: 'B. Onglets',
  render: (args) => (
    <Board
      only={toFrame((args as { only?: unknown }).only)}
      direction="tabs"
      text="B. Une barre d’onglets avec icônes, soulignée de la couleur du type choisi ; la recherche dessous. « Habituels » en cartes qui défilent de côté, puis les catégories en liste."
    />
  ),
}

export const C_Pastilles: Story = {
  name: 'C. Pastilles colorées',
  render: (args) => (
    <Board
      only={toFrame((args as { only?: unknown }).only)}
      direction="pills"
      text="C. Un rail de pastilles avec icônes, la pastille choisie pleine de sa couleur, et tout le haut teinté de cette couleur ; la recherche dans ce bandeau. La liste comme en A."
    />
  ),
}
