/*
 * #406 prototypes: Opérations' filters, clearer and with icons, drawn in
 * the app's frame (header, month bar, title, search, filters, totals, the
 * start of the list) on a computer and on phones of 320 and 390 px. The
 * owner kept option 1 (icon chips) from a first round of three; 1a–1c are
 * its third round. Deleted by the PR that builds the chosen one. Synthetic
 * data only (invented accounts, labels, amounts). Widths follow the frames
 * (container queries), never the Storybook window.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  ArrowDownLeftIcon,
  ArrowDownUpIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  BitcoinIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  EllipsisVerticalIcon,
  InboxIcon,
  LandmarkIcon,
  ListIcon,
  PiggyBankIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  TagIcon,
  UtensilsIcon,
  WalletIcon,
  XIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import * as React from 'react'

import {
  Button,
  CategoryIcon,
  cn,
  CountPill,
  OptionGroup,
  OptionRow,
  PeriodBar,
  PeriodBarLabel,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchField,
  Sheet,
  SheetBar,
  SheetBarAction,
  Switch,
} from '@finances/ui'

/* ---------------------------------------------------------------------------
 * Synthetic data
 * ------------------------------------------------------------------------ */

type Kind = 'expense' | 'income' | 'transfer'
type AccountType = 'checking' | 'savings' | 'meal_voucher' | 'crypto'

interface Account {
  id: string
  name: string
  type: AccountType
}

const ACCOUNTS: Account[] = [
  { id: 'cc', name: 'Compte courant', type: 'checking' },
  { id: 'la', name: 'Livret A', type: 'savings' },
  { id: 'lj', name: 'Livret Jeune', type: 'savings' },
  { id: 'tr', name: 'Titres-restaurant', type: 'meal_voucher' },
]

/** The account lists' badges (`ACCOUNT_TYPE_ICONS` in the web app). */
const ACCOUNT_BADGES: Record<
  AccountType,
  { icon: LucideIcon; className: string }
> = {
  checking: { icon: WalletIcon, className: 'bg-chart-1/15 text-chart-1' },
  savings: { icon: PiggyBankIcon, className: 'bg-chart-3/15 text-chart-3' },
  meal_voucher: {
    icon: UtensilsIcon,
    className: 'bg-chart-6/15 text-chart-6',
  },
  crypto: { icon: BitcoinIcon, className: 'bg-chart-2/15 text-chart-2' },
}

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
    id: 'salary',
    name: 'Salaire',
    kind: 'income',
    color: '#15803d',
    icon: 'briefcase',
  },
  {
    id: 'vouchers',
    name: 'Titres-restaurant',
    kind: 'income',
    color: '#0f766e',
    icon: 'utensils',
  },
  {
    id: 'refunds',
    name: 'Remboursements',
    kind: 'income',
    color: '#059669',
    icon: 'receipt',
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

/** The kinds as the #396 picker draws them. */
const KINDS: {
  id: Kind
  label: string
  group: string
  icon: LucideIcon
  color: string
}[] = [
  {
    id: 'expense',
    label: 'Dépenses',
    group: 'Dépenses',
    icon: ArrowUpRightIcon,
    color: '#d97706',
  },
  {
    id: 'income',
    label: 'Revenus',
    group: 'Revenus',
    icon: ArrowDownLeftIcon,
    color: '#16a34a',
  },
  {
    id: 'transfer',
    label: 'Virements internes',
    group: 'Mouvements internes',
    icon: ArrowLeftRightIcon,
    color: '#0284c7',
  },
]

const UNCATEGORIZED = '__none'
const REVIEW_COUNT = 7

interface Row {
  label: string
  detail: string
  category?: string
  cents: number
  review?: boolean
}

const ROWS: Row[] = [
  { label: 'Biocoop', detail: 'Courses', category: 'groceries', cents: -4_312 },
  {
    label: 'Navigo',
    detail: 'Transport',
    category: 'transport',
    cents: -8_640,
  },
  {
    label: 'Salaire Acme',
    detail: 'Salaire',
    category: 'salary',
    cents: 245_000,
  },
  {
    label: 'Monoprix',
    detail: 'Courses',
    category: 'groceries',
    cents: -2_785,
  },
]

const REVIEW_ROWS: Row[] = [
  {
    label: 'PAIEMENT CB 1811 LYON',
    detail: 'À revoir',
    cents: -1_890,
    review: true,
  },
  {
    label: 'VIR SEPA M DUPONT',
    detail: 'À revoir',
    cents: 12_000,
    review: true,
  },
  { label: 'PRLV SEPA ASSO', detail: 'À revoir', cents: -3_500, review: true },
]

const money = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})
const formatCents = (cents: number) => money.format(cents / 100)

/* ---------------------------------------------------------------------------
 * Filter state (the URL's `account`, `category`, `kind`, `oneOff`, `review`)
 * ------------------------------------------------------------------------ */

type ListKey = 'account' | 'category' | 'kind'

interface Filters {
  account?: string
  category?: string
  kind?: Kind
  oneOff: boolean
  review: boolean
}

type Preset = 'none' | 'two' | 'review'

const PRESETS: Record<Preset, Filters> = {
  none: { oneOff: false, review: false },
  two: { account: 'la', category: 'groceries', oneOff: false, review: false },
  review: { oneOff: false, review: true },
}

function useFilters(preset: Preset) {
  const [filters, setFilters] = React.useState<Filters>(PRESETS[preset])
  const setList = (key: ListKey, value: string | undefined) =>
    setFilters((current) => ({ ...current, [key]: value }))
  const setToggle = (key: 'oneOff' | 'review', on: boolean) =>
    setFilters((current) => ({ ...current, [key]: on }))
  const clear = () => setFilters({ oneOff: false, review: false })
  /** Every filter but « À revoir ». */
  const clearChips = () =>
    setFilters((current) => ({ oneOff: false, review: current.review }))
  const count = [
    filters.account,
    filters.category,
    filters.kind,
    filters.oneOff || undefined,
    filters.review || undefined,
  ].filter((value) => value !== undefined).length
  return { filters, setList, setToggle, clear, clearChips, count }
}

type FilterState = ReturnType<typeof useFilters>

/** What each filter is: its name, its icon, « all ». */
const LISTS: Record<
  ListKey,
  { label: string; icon: LucideIcon; all: string; short: string }
> = {
  account: {
    label: 'Compte',
    icon: LandmarkIcon,
    all: 'Tous les comptes',
    short: 'Tous',
  },
  category: {
    label: 'Catégorie',
    icon: TagIcon,
    all: 'Toutes les catégories',
    short: 'Toutes',
  },
  kind: {
    label: 'Type',
    icon: ArrowDownUpIcon,
    all: 'Tous les types',
    short: 'Tous',
  },
}

const TOGGLES = {
  review: { label: 'À revoir', icon: InboxIcon },
  oneOff: { label: 'Ponctuelles', icon: SparkleIcon },
} as const

/* ---------------------------------------------------------------------------
 * Icons of the values
 * ------------------------------------------------------------------------ */

function AccountBadge({
  type,
  size = 'md',
}: {
  type: AccountType
  size?: 'sm' | 'md'
}) {
  const { icon: Icon, className } = ACCOUNT_BADGES[type]
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        size === 'sm' ? 'size-[1.15rem]' : 'size-7',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'size-[0.7rem]' : 'size-[0.85rem]'} />
    </span>
  )
}

function KindBadge({ kind, size = 'md' }: { kind: Kind; size?: 'sm' | 'md' }) {
  const meta = KINDS.find((item) => item.id === kind)!
  const Icon = meta.icon
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        size === 'sm' ? 'size-[1.15rem] rounded-[0.3rem]' : 'size-7 rounded-lg',
      )}
      style={{
        color: `color-mix(in oklab, ${meta.color} 82%, var(--foreground))`,
        backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
      }}
    >
      <Icon className={size === 'sm' ? 'size-[0.7rem]' : 'size-[0.85rem]'} />
    </span>
  )
}

/** A filter's own icon on a neutral tile (« Tous les comptes »). */
function FilterBadge({
  icon: Icon,
  size = 'md',
}: {
  icon: LucideIcon
  size?: 'sm' | 'md'
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-muted text-muted-foreground inline-flex shrink-0 items-center justify-center',
        size === 'sm' ? 'size-[1.15rem] rounded-[0.3rem]' : 'size-7 rounded-lg',
      )}
    >
      <Icon className={size === 'sm' ? 'size-[0.7rem]' : 'size-[0.85rem]'} />
    </span>
  )
}

/** The chosen value of a list filter: its name and its own icon. */
function valueOf(
  key: ListKey,
  value: string,
  size: 'sm' | 'md' = 'sm',
): { label: string; icon: React.ReactNode } {
  if (key === 'account') {
    const account = ACCOUNTS.find((item) => item.id === value)!
    return {
      label: account.name,
      icon: <AccountBadge type={account.type} size={size} />,
    }
  }
  if (key === 'kind') {
    const kind = KINDS.find((item) => item.id === value)!
    return { label: kind.label, icon: <KindBadge kind={kind.id} size={size} /> }
  }
  if (value === UNCATEGORIZED)
    return {
      label: 'Sans catégorie',
      icon: (
        <CategoryIcon
          icon={null}
          color={null}
          fallback={CircleHelpIcon}
          size={size}
        />
      ),
    }
  const category = CATEGORIES.find((item) => item.id === value)!
  return {
    label: category.name,
    icon: (
      <CategoryIcon icon={category.icon} color={category.color} size={size} />
    ),
  }
}

/* ---------------------------------------------------------------------------
 * The option lists: the same rows in a popover, a phone screen or a panel
 * ------------------------------------------------------------------------ */

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function OptionsList({
  listKey,
  value,
  onPick,
}: {
  listKey: ListKey
  value: string | undefined
  onPick: (value: string | undefined) => void
}) {
  const [query, setQuery] = React.useState('')
  const meta = LISTS[listKey]
  const all = (
    <OptionRow
      selected={value === undefined}
      leading={<FilterBadge icon={meta.icon} />}
      label={meta.all}
      onClick={() => onPick(undefined)}
    />
  )
  if (listKey === 'account')
    return (
      <div role="radiogroup" aria-label={meta.label} className="divide-y">
        {all}
        {ACCOUNTS.map((account) => (
          <OptionRow
            key={account.id}
            selected={value === account.id}
            leading={<AccountBadge type={account.type} />}
            label={account.name}
            onClick={() => onPick(account.id)}
          />
        ))}
      </div>
    )
  if (listKey === 'kind')
    return (
      <div role="radiogroup" aria-label={meta.label} className="divide-y">
        {all}
        {KINDS.map((kind) => (
          <OptionRow
            key={kind.id}
            selected={value === kind.id}
            leading={<KindBadge kind={kind.id} />}
            label={kind.label}
            onClick={() => onPick(kind.id)}
          />
        ))}
      </div>
    )
  const needle = fold(query.trim())
  return (
    <div role="radiogroup" aria-label={meta.label}>
      <div className="px-3 pt-3 pb-1">
        <SearchField
          aria-label="Rechercher une catégorie"
          placeholder="Rechercher"
          value={query}
          onValueChange={setQuery}
        />
      </div>
      {needle === '' && (
        <div className="divide-y">
          {all}
          <OptionRow
            selected={value === UNCATEGORIZED}
            leading={valueOf('category', UNCATEGORIZED, 'md').icon}
            label="Sans catégorie"
            onClick={() => onPick(UNCATEGORIZED)}
          />
        </div>
      )}
      {KINDS.map((kind) => {
        const rows = CATEGORIES.filter(
          (category) =>
            category.kind === kind.id &&
            (needle === '' || fold(category.name).includes(needle)),
        )
        if (rows.length === 0) return null
        return (
          <OptionGroup key={kind.id} title={kind.group}>
            {rows.map((category) => (
              <OptionRow
                key={category.id}
                selected={value === category.id}
                leading={
                  <CategoryIcon icon={category.icon} color={category.color} />
                }
                label={category.name}
                onClick={() => onPick(category.id)}
              />
            ))}
          </OptionGroup>
        )
      })}
    </div>
  )
}

/** A list filter's options in a popover (a computer). */
function OptionsPopover({
  listKey,
  state,
  open,
  onOpenChange,
  children,
}: {
  listKey: ListKey
  state: FilterState
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={LISTS[listKey].label}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="max-h-[min(30rem,var(--radix-popover-content-available-height))] w-[20rem] overflow-y-auto p-0"
      >
        <OptionsList
          listKey={listKey}
          value={state.filters[listKey]}
          onPick={(value) => {
            state.setList(listKey, value)
            onOpenChange(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * A popover drawn in place, open, for the screenshots (a real popover
 * opens before the board is laid out and lands elsewhere).
 */
function StaticPanel({
  align = 'start',
  width = '20rem',
  children,
}: {
  align?: 'start' | 'end'
  width?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{ width }}
      className={cn(
        'bg-popover text-popover-foreground absolute top-full z-20 mt-1 max-h-[30rem] overflow-y-auto rounded-md border shadow-md',
        align === 'start' ? 'left-0' : 'right-0',
      )}
    >
      {children}
    </div>
  )
}

function StaticOptions({
  listKey,
  state,
}: {
  listKey: ListKey
  state: FilterState
}) {
  return (
    <StaticPanel>
      <OptionsList
        listKey={listKey}
        value={state.filters[listKey]}
        onPick={(value) => state.setList(listKey, value)}
      />
    </StaticPanel>
  )
}

/* ---------------------------------------------------------------------------
 * A full-screen page inside a phone frame (#385's frame)
 * ------------------------------------------------------------------------ */

function PhoneScreen({
  title,
  onClose,
  onBack,
  action,
  children,
}: {
  title: string
  onClose: () => void
  onBack?: () => void
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <div className="bg-popover text-popover-foreground absolute inset-0 z-30 flex flex-col">
        <div aria-hidden className="h-[34px] shrink-0" />
        <SheetBar title={title} onBack={onBack} action={action} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
          {children}
        </div>
      </div>
    </Sheet>
  )
}

/** Opened by a frame's filters: a list or the whole sheet. */
type Overlay = { kind: 'list'; key: ListKey } | { kind: 'sheet' } | null

/* ---------------------------------------------------------------------------
 * The totals (every direction): labels over their figures, the note inside
 * ------------------------------------------------------------------------ */

function Totals({
  review,
  head,
}: {
  review: boolean
  /** A first row (1a·A·2: the filters set, the totals being theirs). */
  head?: React.ReactNode
}) {
  if (review) return null
  const figures = [
    { label: 'Revenus', cents: 245_000 },
    { label: 'Dépenses', cents: -183_412 },
    { label: 'Net', cents: 61_588, toned: true },
  ]
  return (
    <section
      aria-label="Résumé"
      className="bg-card @container overflow-hidden rounded-xl border"
    >
      {head}
      <dl className="grid grid-cols-3 divide-x">
        {figures.map((figure) => (
          <div key={figure.label} className="@container min-w-0 px-3 py-2">
            <dt className="text-muted-foreground text-[13px]">
              {figure.label}
            </dt>
            <dd
              className={cn(
                'text-[clamp(13px,13cqi,19px)] font-semibold whitespace-nowrap tabular-nums',
                figure.toned && 'text-chart-delta-good',
              )}
            >
              {formatCents(figure.cents)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground flex items-center gap-1.5 border-t px-3 py-1.5 text-[13px]">
        <ArrowLeftRightIcon aria-hidden className="size-[14px] shrink-0" />1
        virement interne exclu · dont ponctuelles −200,00 €
      </p>
    </section>
  )
}

/* ---------------------------------------------------------------------------
 * The page around the filters
 * ------------------------------------------------------------------------ */

function ListPreview({
  review,
  count = 42,
}: {
  review: boolean
  count?: number
}) {
  const rows = review ? REVIEW_ROWS : ROWS
  return (
    <section className="bg-card overflow-hidden rounded-xl border">
      <div className="text-muted-foreground flex min-h-11 items-center justify-between border-b px-3 text-[14px]">
        <span>
          {review ? `${REVIEW_COUNT} à revoir` : `${count} opérations`}
        </span>
        <span>{review ? 'Tout valider' : 'Plus récentes ⌄'}</span>
      </div>
      <p className="bg-muted/50 text-muted-foreground px-3 py-1 text-[13px] font-medium">
        Mardi 18 novembre
      </p>
      <ul className="divide-y">
        {rows.map((row) => {
          const category = CATEGORIES.find((item) => item.id === row.category)
          return (
            <li
              key={row.label}
              className="flex min-h-[56px] items-center gap-3 px-3"
            >
              <CategoryIcon
                icon={category?.icon ?? null}
                color={category?.color ?? null}
                fallback={CircleHelpIcon}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">
                  {row.label}
                </span>
                <span
                  className={cn(
                    'block truncate text-[13px]',
                    row.review ? 'text-warning' : 'text-muted-foreground',
                  )}
                >
                  {row.detail}
                </span>
              </span>
              <span
                className={cn(
                  'text-[15px] whitespace-nowrap tabular-nums',
                  row.cents > 0 && 'text-chart-delta-good',
                )}
              >
                {row.cents > 0 ? '+' : ''}
                {formatCents(row.cents)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Header, month bar, title: the app's frame (#386, #401). */
function Chrome({
  phone,
  review,
  titleEnd,
  children,
}: {
  phone: boolean
  review: boolean
  titleEnd?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <>
      <div className="bg-background flex h-12 items-center gap-2 border-b px-2">
        <span className="text-muted-foreground flex min-h-11 items-center gap-1 px-1 text-[15px]">
          <ChevronLeftIcon aria-hidden className="size-[18px]" />
          Dépenses
        </span>
        <span className="flex-1" />
        <span className="bg-secondary flex size-10 items-center justify-center rounded-lg">
          <EllipsisVerticalIcon aria-hidden className="size-[18px]" />
        </span>
        <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-full text-[14px] font-semibold">
          CM
        </span>
      </div>
      <div className="bg-background @container border-b px-2 py-1.5">
        <PeriodBar
          previous={{
            label: 'Mois précédent',
            onClick: () => undefined,
            disabled: review,
          }}
          next={{
            label: 'Mois suivant',
            onClick: () => undefined,
            disabled: review,
          }}
        >
          <PeriodBarLabel
            text={review ? 'Toutes les dates' : 'Novembre 2026'}
            shortText={review ? 'Toutes' : 'nov. 2026'}
          />
        </PeriodBar>
      </div>
      <div className={cn('space-y-4', phone ? 'p-4' : 'p-6')}>
        <div className="flex items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate text-[24px] font-semibold">
            Opérations
          </h1>
          {titleEnd}
        </div>
        {children}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * A. Puces à icônes: the chips, each with its icon; on / off chips carry a
 *    round check, list chips a ⌄; the phone sheet is one list of rows.
 * ------------------------------------------------------------------------ */

const CHIP =
  'relative inline-flex min-h-[38px] items-center gap-1.5 rounded-full border text-[15px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:touch-hitbox'
const CHIP_OFF = 'bg-background text-foreground hover:bg-muted'
const CHIP_ON =
  'border-primary/60 bg-[color-mix(in_srgb,var(--primary)_9%,var(--background))] text-foreground'

function ListChipA({
  listKey,
  state,
  phone,
  forceOpen = false,
}: {
  listKey: ListKey
  state: FilterState
  phone: boolean
  forceOpen?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const meta = LISTS[listKey]
  const Icon = meta.icon
  const value = state.filters[listKey]
  if (value === undefined && phone) return null
  if (value === undefined)
    return (
      <OptionsPopover
        listKey={listKey}
        state={state}
        open={open}
        onOpenChange={setOpen}
      >
        <button type="button" className={cn(CHIP, CHIP_OFF, 'pr-2.5 pl-3')}>
          <Icon aria-hidden className="text-muted-foreground size-[17px]" />
          {meta.label}
          <ChevronDownIcon aria-hidden className="size-[16px] opacity-60" />
        </button>
      </OptionsPopover>
    )
  const chosen = valueOf(listKey, value)
  const chip = (
    <span className={cn(CHIP, CHIP_ON, 'max-w-full pr-1 pl-2')}>
      <OptionsPopover
        listKey={listKey}
        state={state}
        open={open}
        onOpenChange={setOpen}
      >
        <button
          type="button"
          aria-label={`${meta.label} : ${chosen.label}, changer`}
          className="flex min-w-0 items-center gap-1.5 outline-none"
        >
          {chosen.icon}
          <span className="text-muted-foreground">{meta.label}</span>
          <span className="truncate">{chosen.label}</span>
        </button>
      </OptionsPopover>
      <button
        type="button"
        aria-label={`Retirer le filtre ${meta.label}`}
        onClick={() => state.setList(listKey, undefined)}
        className="hover:bg-primary/15 flex size-7 shrink-0 items-center justify-center rounded-full"
      >
        <XIcon aria-hidden className="size-[15px]" />
      </button>
    </span>
  )
  if (!forceOpen) return chip
  return (
    <span className="relative inline-flex max-w-full">
      {chip}
      <StaticOptions listKey={listKey} state={state} />
    </span>
  )
}

function ToggleChipA({
  toggle,
  state,
  count,
  className,
}: {
  toggle: 'review' | 'oneOff'
  state: FilterState
  count?: number
  className?: string
}) {
  const on = state.filters[toggle]
  const meta = TOGGLES[toggle]
  const Icon = meta.icon
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => state.setToggle(toggle, !on)}
      className={cn(CHIP, on ? CHIP_ON : CHIP_OFF, 'pr-3 pl-1.5', className)}
    >
      {/* The round check says « on / off », the ⌄ of list chips « a list ». */}
      <span
        aria-hidden
        className={cn(
          'flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px]',
          on
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/40',
        )}
      >
        {on && <CheckIcon className="size-[13px]" strokeWidth={3} />}
      </span>
      <Icon aria-hidden className="text-muted-foreground size-[17px]" />
      {meta.label}
      {count !== undefined && count > 0 && !on && (
        <CountPill
          value={count}
          label="opérations à revoir"
          className="ml-0.5"
        />
      )}
    </button>
  )
}

/** A's phone sheet: one row per filter, the same icons and lists. */
function SheetA({
  state,
  onClose,
  withReview = true,
}: {
  state: FilterState
  onClose: () => void
  /** « À revoir » among the switches (not when the bar shows it). */
  withReview?: boolean
}) {
  const [list, setList] = React.useState<ListKey | null>(null)
  if (list)
    return (
      <PhoneScreen
        title={LISTS[list].label}
        onClose={onClose}
        onBack={() => setList(null)}
      >
        <OptionsList
          listKey={list}
          value={state.filters[list]}
          onPick={(value) => {
            state.setList(list, value)
            setList(null)
          }}
        />
      </PhoneScreen>
    )
  return (
    <PhoneScreen
      title="Filtres"
      onClose={onClose}
      action={<SheetBarAction label="Voir les opérations" onClick={onClose} />}
    >
      <div className="divide-y border-b">
        {(withReview
          ? (['review', 'oneOff'] as const)
          : (['oneOff'] as const)
        ).map((toggle) => {
          const meta = TOGGLES[toggle]
          return (
            <label
              key={toggle}
              className="flex min-h-[56px] items-center gap-3 px-4"
            >
              <FilterBadge icon={meta.icon} />
              <span className="flex-1 text-[16px]">{meta.label}</span>
              {toggle === 'review' && !state.filters.review && (
                <CountPill value={REVIEW_COUNT} label="opérations à revoir" />
              )}
              <Switch
                checked={state.filters[toggle]}
                onCheckedChange={(on) => state.setToggle(toggle, on)}
              />
            </label>
          )
        })}
        {(['account', 'category', 'kind'] as const).map((key) => {
          const meta = LISTS[key]
          const value = state.filters[key]
          const chosen =
            value === undefined ? undefined : valueOf(key, value, 'md')
          return (
            <button
              key={key}
              type="button"
              onClick={() => setList(key)}
              className="hover:bg-muted/50 flex min-h-[60px] w-full items-center gap-3 px-4 text-left"
            >
              {chosen?.icon ?? <FilterBadge icon={meta.icon} />}
              <span className="min-w-0 flex-1">
                <span className="text-muted-foreground block text-[13px]">
                  {meta.label}
                </span>
                <span
                  className={cn(
                    'block truncate text-[16px]',
                    chosen && 'font-semibold',
                  )}
                >
                  {chosen?.label ?? meta.all}
                </span>
              </span>
              <ChevronRightIcon
                aria-hidden
                className="text-muted-foreground size-[18px]"
              />
            </button>
          )
        })}
      </div>
      {state.count > 0 && (
        <div className="p-4">
          <Button
            variant="secondary"
            outline
            className="w-full"
            onClick={state.clear}
          >
            Effacer les filtres
          </Button>
        </div>
      )}
    </PhoneScreen>
  )
}

function FiltersButton({
  count,
  onClick,
}: {
  count: number
  onClick: () => void
}) {
  return (
    <Button
      variant="secondary"
      outline
      className="rounded-full px-3"
      iconStart={<SlidersHorizontalIcon aria-hidden />}
      onClick={onClick}
    >
      Filtres
      {count > 0 && <CountPill value={count} label="filtres actifs" />}
    </Button>
  )
}

function DirectionA({
  state,
  phone,
  setOverlay,
  openCategory,
}: DirectionProps) {
  const { filters } = state
  const toReview = !filters.review
  return {
    titleEnd: phone ? (
      <FiltersButton
        count={state.count}
        onClick={() => setOverlay({ kind: 'sheet' })}
      />
    ) : undefined,
    body: (
      <>
        <SearchField
          aria-label="Rechercher une opération"
          placeholder="Rechercher un libellé, un marchand…"
          value=""
          onValueChange={() => undefined}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ToggleChipA
            toggle="review"
            state={state}
            count={toReview ? REVIEW_COUNT : undefined}
            className={phone && toReview ? 'w-full justify-center' : undefined}
          />
          <ListChipA listKey="account" state={state} phone={phone} />
          <ListChipA
            listKey="category"
            state={state}
            phone={phone}
            forceOpen={openCategory}
          />
          <ListChipA listKey="kind" state={state} phone={phone} />
          {(!phone || filters.oneOff) && (
            <ToggleChipA toggle="oneOff" state={state} />
          )}
          {state.count > 0 && (
            <Button variant="secondary" ghost onClick={state.clear}>
              Effacer
            </Button>
          )}
        </div>
      </>
    ),
  }
}

/* ---------------------------------------------------------------------------
 * Third round (the owner, 21 Nov: option 1, A's icon chips, but the search
 * and the filters sit badly in the page, and on a computer « À revoir » is
 * not set apart enough from the filters). All three share one toolbar:
 * - the search and every filter are controls of the same family: 44px
 *   high, the same corners, border and card background, on one row on a
 *   computer (search first, filling what the filters leave);
 * - each filter names what it filters and its value (« Compte · Tous ⌄ »);
 *   once set it takes its value's colour and icon (« Livret A », green);
 * - on phones, the search and a filters button side by side, the filters
 *   set on the row under them in the same look.
 * « À revoir » leaves the toolbar, in amber (the colour of the rows to
 * review): 1a at the end of the page title, 1b as tabs over the toolbar,
 * 1c as a callout above it.
 * ------------------------------------------------------------------------ */

/** The colour of a chosen value: the category's, the account type's… */
function valueColor(key: ListKey, value: string): string {
  if (key === 'account') {
    const account = ACCOUNTS.find((item) => item.id === value)!
    return {
      checking: 'var(--chart-1)',
      savings: 'var(--chart-3)',
      meal_voucher: 'var(--chart-6)',
      crypto: 'var(--chart-2)',
    }[account.type]
  }
  if (key === 'kind') return KINDS.find((item) => item.id === value)!.color
  if (value === UNCATEGORIZED) return 'var(--muted-foreground)'
  return CATEGORIES.find((item) => item.id === value)!.color
}

/** One control of the toolbar: the search's height, corners and border. */
const TOOL =
  'relative inline-flex h-[44px] max-w-full items-center gap-2 rounded-lg border text-[15px] whitespace-nowrap shadow-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50'
const TOOL_OFF = 'bg-card hover:bg-muted/60'

function ToolSearch({
  phone,
  end,
}: {
  phone: boolean
  /** Inside the field, at its end (1a·A: the filters, on phones). */
  end?: React.ReactNode
}) {
  return (
    <label
      className={cn(
        TOOL,
        TOOL_OFF,
        'focus-within:border-ring focus-within:ring-ring/50 min-w-0 cursor-text px-3 focus-within:ring-[3px]',
        phone ? 'flex-1' : 'flex-[1_1_320px]',
      )}
    >
      <SearchIcon
        aria-hidden
        className="text-muted-foreground size-[18px] shrink-0"
      />
      <input
        type="search"
        aria-label="Rechercher une opération"
        placeholder={
          phone ? 'Rechercher' : 'Rechercher un libellé, un marchand…'
        }
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[16px] outline-none"
      />
      {end}
    </label>
  )
}

/** « [icon] Compte · Tous ⌄ », or « [value icon] Compte Livret A × » tinted. */
function ToolFilter({
  listKey,
  state,
  phone,
  forceOpen = false,
}: {
  listKey: ListKey
  state: FilterState
  phone: boolean
  forceOpen?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const meta = LISTS[listKey]
  const Icon = meta.icon
  const value = state.filters[listKey]
  if (value === undefined && phone) return null
  if (value === undefined)
    return (
      <OptionsPopover
        listKey={listKey}
        state={state}
        open={open}
        onOpenChange={setOpen}
      >
        <button type="button" className={cn(TOOL, TOOL_OFF, 'pr-2.5 pl-3')}>
          <Icon aria-hidden className="text-muted-foreground size-[17px]" />
          <span className="font-medium">{meta.label}</span>
          <span className="text-muted-foreground">{meta.short}</span>
          <ChevronDownIcon
            aria-hidden
            className="text-muted-foreground size-[16px]"
          />
        </button>
      </OptionsPopover>
    )
  const chosen = valueOf(listKey, value)
  const color = valueColor(listKey, value)
  const control = (
    <span
      className={cn(TOOL, 'pr-1 pl-2')}
      style={{
        borderColor: `color-mix(in srgb, ${color} 60%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 11%, var(--card))`,
      }}
    >
      <OptionsPopover
        listKey={listKey}
        state={state}
        open={open}
        onOpenChange={setOpen}
      >
        <button
          type="button"
          aria-label={`${meta.label} : ${chosen.label}, changer`}
          className="flex h-full min-w-0 items-center gap-2 outline-none"
        >
          {chosen.icon}
          <span className="text-muted-foreground">{meta.label}</span>
          <span className="truncate font-semibold">{chosen.label}</span>
        </button>
      </OptionsPopover>
      <button
        type="button"
        aria-label={`Retirer le filtre ${meta.label}`}
        onClick={() => state.setList(listKey, undefined)}
        className="hover:bg-foreground/10 flex size-8 shrink-0 items-center justify-center rounded-md"
      >
        <XIcon aria-hidden className="size-[15px]" />
      </button>
    </span>
  )
  if (!forceOpen) return control
  return (
    <span className="relative inline-flex max-w-full">
      {control}
      <StaticOptions listKey={listKey} state={state} />
    </span>
  )
}

/** « Ponctuelles »: on / off, a check box in the control. */
function ToolOneOff({ state }: { state: FilterState }) {
  const on = state.filters.oneOff
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => state.setToggle('oneOff', !on)}
      className={cn(
        TOOL,
        'pr-3 pl-2.5',
        on
          ? 'border-primary/60 bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]'
          : TOOL_OFF,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-[20px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]',
          on
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/45',
        )}
      >
        {on && <CheckIcon className="size-[13px]" strokeWidth={3} />}
      </span>
      <SparkleIcon aria-hidden className="text-muted-foreground size-[17px]" />
      <span className={cn(on ? 'font-semibold' : 'font-medium')}>
        Ponctuelles
      </span>
    </button>
  )
}

/** The filters set, each with its value's icon (and how to clear it). */
function activeItems(state: FilterState) {
  const items: {
    key: string
    icon: React.ReactNode
    label: string
    clear: () => void
  }[] = []
  for (const key of ['account', 'category', 'kind'] as const) {
    const value = state.filters[key]
    if (value === undefined) continue
    const chosen = valueOf(key, value)
    items.push({
      key,
      icon: chosen.icon,
      label: chosen.label,
      clear: () => state.setList(key, undefined),
    })
  }
  if (state.filters.oneOff)
    items.push({
      key: 'oneOff',
      icon: <FilterBadge icon={SparkleIcon} size="sm" />,
      label: 'Ponctuelles',
      clear: () => state.setToggle('oneOff', false),
    })
  return items
}

/** The values set, one after the other, each with its icon. */
function ActiveValues({ state }: { state: FilterState }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      {activeItems(state).map((item, index) => (
        <React.Fragment key={item.key}>
          {index > 0 && (
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
          )}
          {item.icon}
          <span className="truncate font-medium">{item.label}</span>
        </React.Fragment>
      ))}
    </span>
  )
}

/** 1a·A·1: one line « [icon] Livret A · [icon] Courses   × ». */
function ActiveLine({
  state,
  setOverlay,
}: {
  state: FilterState
  setOverlay: (overlay: Overlay) => void
}) {
  return (
    <div className="flex min-h-[44px] items-center gap-1">
      <button
        type="button"
        aria-label="Filtres choisis, modifier"
        onClick={() => setOverlay({ kind: 'sheet' })}
        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 pl-1 text-left text-[15px] outline-none"
      >
        <ActiveValues state={state} />
      </button>
      <button
        type="button"
        aria-label="Effacer les filtres"
        onClick={state.clearChips}
        className="text-muted-foreground hover:bg-muted flex size-[40px] shrink-0 items-center justify-center rounded-md"
      >
        <XIcon aria-hidden className="size-[18px]" />
      </button>
    </div>
  )
}

/** 1a·A·2: the first row of the totals, which are those of the filters. */
function ActiveTotalsHead({ state }: { state: FilterState }) {
  if (activeItems(state).length === 0) return null
  return (
    <div className="flex min-h-[44px] items-center gap-2 border-b bg-[color-mix(in_srgb,var(--primary)_6%,var(--card))] pr-1 pl-2.5 text-[15px]">
      <span className="min-w-0 flex-1">
        <ActiveValues state={state} />
      </span>
      <button
        type="button"
        aria-label="Effacer les filtres"
        onClick={state.clearChips}
        className="hover:bg-muted flex size-[40px] shrink-0 items-center justify-center rounded-md"
      >
        <XIcon aria-hidden className="size-[16px]" />
      </button>
    </div>
  )
}

/** 1a·A·3: one row of light tokens, scrolling sideways, never wrapping. */
function ActiveTokens({ state }: { state: FilterState }) {
  return (
    <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
      {activeItems(state).map((item) => (
        <span
          key={item.key}
          className="bg-muted inline-flex h-[36px] shrink-0 items-center gap-1.5 rounded-lg pr-0.5 pl-2 text-[15px]"
        >
          {item.icon}
          <span className="font-medium whitespace-nowrap">{item.label}</span>
          <button
            type="button"
            aria-label={`Retirer ${item.label}`}
            onClick={item.clear}
            className="hover:bg-foreground/10 relative flex size-8 items-center justify-center rounded-md pointer-coarse:touch-hitbox"
          >
            <XIcon aria-hidden className="size-[14px]" />
          </button>
        </span>
      ))}
      <Button
        variant="secondary"
        ghost
        className="h-[36px] shrink-0 px-2"
        onClick={state.clearChips}
      >
        Effacer
      </Button>
    </div>
  )
}

/*
 * The funnel (the owner, 21 Nov: « une liste avec un décompte : on part du
 * total et ça fait un fil conducteur où ça réduit le nombre »): the month's
 * transactions first, then each filter set as a step, with how many are
 * left once it applies and a bar of that share of the total. Synthetic
 * counts; the app would ask `GET /transactions/summary` once per step.
 */
const FUNNEL_TOTAL = 142
const FUNNEL_STEPS = [38, 12, 5, 2]

/** How many are left after each filter set, in order. */
function funnelCount(state: FilterState): number {
  const steps = activeItems(state).length
  return steps === 0 ? FUNNEL_TOTAL : FUNNEL_STEPS[steps - 1]!
}

function Funnel({
  state,
  setOverlay,
  card,
}: {
  state: FilterState
  setOverlay: (overlay: Overlay) => void
  /** In a card of its own, or plain rows under the search. */
  card: boolean
}) {
  const items = activeItems(state)
  const rows = [
    {
      key: 'all',
      icon: <FilterBadge icon={ListIcon} size="sm" />,
      label: 'Tout le mois',
      count: FUNNEL_TOTAL,
      clear: undefined as (() => void) | undefined,
    },
    ...items.map((item, index) => ({
      key: item.key,
      icon: item.icon,
      label: item.label,
      count: FUNNEL_STEPS[index]!,
      clear: item.clear,
    })),
  ]
  return (
    <section
      aria-label="Filtres choisis"
      className={cn(card && 'bg-card overflow-hidden rounded-xl border')}
    >
      <ol>
        {rows.map((row, index) => {
          const last = index === rows.length - 1
          return (
            <li
              key={row.key}
              className={cn(
                'relative flex min-h-[48px] items-center gap-2.5 pr-1',
                card ? 'pl-3' : 'pl-0',
              )}
            >
              {/* The thread: from each step down to the next one. */}
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    'bg-border absolute top-[36px] bottom-[-11px] w-[2px]',
                    card
                      ? 'left-[calc(0.75rem+0.575rem-1px)]'
                      : 'left-[calc(0.575rem-1px)]',
                  )}
                />
              )}
              <span className="relative z-[1] flex shrink-0">{row.icon}</span>
              <button
                type="button"
                onClick={() => setOverlay({ kind: 'sheet' })}
                className="min-w-0 flex-1 py-1.5 text-left outline-none"
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-[15px]',
                      index === 0 ? 'text-muted-foreground' : 'font-medium',
                    )}
                  >
                    {row.label}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-[15px] tabular-nums',
                      last ? 'font-bold' : 'text-muted-foreground',
                    )}
                  >
                    {row.count}
                  </span>
                </span>
                {/* What is left of the total. */}
                <span className="bg-muted mt-1 block h-[4px] overflow-hidden rounded-full">
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      last ? 'bg-primary' : 'bg-muted-foreground/35',
                    )}
                    style={{ width: `${(row.count / FUNNEL_TOTAL) * 100}%` }}
                  />
                </span>
              </button>
              {row.clear ? (
                <button
                  type="button"
                  aria-label={`Retirer ${row.label}`}
                  onClick={row.clear}
                  className="text-muted-foreground hover:bg-muted flex size-[40px] shrink-0 items-center justify-center rounded-md"
                >
                  <XIcon aria-hidden className="size-[16px]" />
                </button>
              ) : (
                <span aria-hidden className="size-[40px] shrink-0" />
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Toolbar({
  state,
  phone,
  setOverlay,
  openCategory,
  filtersInSearch = false,
  phoneReview,
  phoneSet = 'chips',
}: DirectionProps & {
  /**
   * Phones: how the filters set show under the search: the tinted chips,
   * one summary line, nothing (the totals say them), or one row of light
   * tokens scrolling sideways.
   */
  phoneSet?: 'chips' | 'line' | 'totals' | 'scroll' | 'funnel' | 'funnelPlain'
  /** Phones: the filters button inside the search field (1a·A). */
  filtersInSearch?: boolean
  /** Phones: a row of its own under the search (1a·B). */
  phoneReview?: React.ReactNode
}) {
  const { filters } = state
  const set = state.count - (filters.review ? 1 : 0)
  const clear =
    set > 0 ? (
      <Button
        variant="secondary"
        ghost
        className="h-[44px]"
        onClick={state.clearChips}
      >
        Effacer
      </Button>
    ) : null
  if (phone)
    return (
      <div className="space-y-2">
        {filtersInSearch ? (
          <div className="flex">
            <ToolSearch
              phone
              end={
                <>
                  <span aria-hidden className="bg-border h-6 w-px shrink-0" />
                  <button
                    type="button"
                    aria-label={set > 0 ? `Filtres, ${set} actifs` : 'Filtres'}
                    onClick={() => setOverlay({ kind: 'sheet' })}
                    className="text-foreground hover:bg-muted -mr-2 flex h-[40px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[15px] font-medium"
                  >
                    <SlidersHorizontalIcon
                      aria-hidden
                      className="size-[18px]"
                    />
                    {/* Its word from 360px of screen, the search keeping room. */}
                    <span className="hidden @[360px]:inline">Filtres</span>
                    {set > 0 && (
                      <CountPill value={set} label="filtres actifs" />
                    )}
                  </button>
                </>
              }
            />
          </div>
        ) : (
          <div className="flex gap-2">
            <ToolSearch phone />
            <button
              type="button"
              aria-label={set > 0 ? `Filtres, ${set} actifs` : 'Filtres'}
              onClick={() => setOverlay({ kind: 'sheet' })}
              className={cn(TOOL, TOOL_OFF, 'shrink-0 justify-center px-3')}
            >
              <SlidersHorizontalIcon aria-hidden className="size-[18px]" />
              {set > 0 && <CountPill value={set} label="filtres actifs" />}
            </button>
          </div>
        )}
        {phoneReview}
        {set > 0 && phoneSet === 'line' && (
          <ActiveLine state={state} setOverlay={setOverlay} />
        )}
        {set > 0 && phoneSet === 'scroll' && <ActiveTokens state={state} />}
        {set > 0 && phoneSet === 'funnel' && (
          <Funnel state={state} setOverlay={setOverlay} card />
        )}
        {set > 0 && phoneSet === 'funnelPlain' && (
          <Funnel state={state} setOverlay={setOverlay} card={false} />
        )}
        {set > 0 && phoneSet === 'chips' && (
          <div className="flex flex-wrap items-center gap-2">
            <ToolFilter listKey="account" state={state} phone />
            <ToolFilter listKey="category" state={state} phone />
            <ToolFilter listKey="kind" state={state} phone />
            {filters.oneOff && <ToolOneOff state={state} />}
            {clear}
          </div>
        )}
      </div>
    )
  // The search keeps 320px at least; past that the filters go, as one
  // group, to the row under it.
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToolSearch phone={false} />
      <div className="flex flex-wrap items-center gap-2">
        <ToolFilter listKey="account" state={state} phone={false} />
        <ToolFilter
          listKey="category"
          state={state}
          phone={false}
          forceOpen={openCategory}
        />
        <ToolFilter listKey="kind" state={state} phone={false} />
        <ToolOneOff state={state} />
        {clear}
      </div>
    </div>
  )
}

/** The count of the rows to review, in their amber. */
function ReviewCount({ value }: { value: number }) {
  return (
    <span className="bg-warning text-warning-foreground flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[13px] font-bold tabular-nums">
      {value}
    </span>
  )
}

/* 1a. « À revoir » at the end of the page title, an amber button. */

function ReviewButton({
  state,
  phone,
  pill = false,
}: {
  state: FilterState
  phone: boolean
  /** 1a·A: a round pill with its label on every width. */
  pill?: boolean
}) {
  const on = state.filters.review
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => state.setToggle('review', !on)}
      className={cn(
        'border-warning/70 inline-flex h-[44px] shrink-0 items-center gap-2 border px-3 text-[15px] font-semibold whitespace-nowrap outline-none',
        pill ? 'rounded-full pr-2' : 'rounded-lg',
        'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        on
          ? 'bg-warning text-warning-foreground'
          : 'bg-[color-mix(in_srgb,var(--warning)_18%,var(--card))] hover:bg-[color-mix(in_srgb,var(--warning)_28%,var(--card))]',
      )}
    >
      {!(phone && pill) && <InboxIcon aria-hidden className="size-[18px]" />}
      {phone && !on && !pill ? null : 'À revoir'}
      {on ? (
        <XIcon aria-hidden className="size-[16px]" />
      ) : (
        <ReviewCount value={REVIEW_COUNT} />
      )}
      {phone && !on && !pill && <span className="sr-only">À revoir</span>}
    </button>
  )
}

function Direction1a(props: DirectionProps) {
  return {
    titleEnd: <ReviewButton state={props.state} phone={props.phone} />,
    body: <Toolbar {...props} />,
  }
}

/*
 * The owner chose 1a (21 Nov), but on phones « À revoir » (icon + count)
 * sat right above the filters button, both small squares of the same
 * size. Two fixes, phones only (the computer stays 1a):
 * 1a·A the filters inside the search field, « À revoir 7 » a round pill
 *      with its label at the end of the title: two shapes, two places;
 * 1a·B « À revoir » leaves the title for a full-width amber row under
 *      the search (like the full-width chip of #393).
 */

function Direction1aA(props: DirectionProps) {
  return {
    titleEnd: <ReviewButton state={props.state} phone={props.phone} pill />,
    body: <Toolbar {...props} filtersInSearch />,
  }
}

function Direction1aA1(props: DirectionProps) {
  return {
    ...Direction1aA(props),
    body: <Toolbar {...props} filtersInSearch phoneSet="line" />,
  }
}

function Direction1aA2(props: DirectionProps) {
  return {
    ...Direction1aA(props),
    body: <Toolbar {...props} filtersInSearch phoneSet="totals" />,
    totalsHead: props.phone ? (
      <ActiveTotalsHead state={props.state} />
    ) : undefined,
  }
}

function Direction1aA3(props: DirectionProps) {
  return {
    ...Direction1aA(props),
    body: <Toolbar {...props} filtersInSearch phoneSet="scroll" />,
  }
}

function Direction1aA4(props: DirectionProps) {
  return {
    ...Direction1aA(props),
    body: <Toolbar {...props} filtersInSearch phoneSet="funnel" />,
    listCount: props.phone ? funnelCount(props.state) : undefined,
  }
}

function Direction1aA5(props: DirectionProps) {
  return {
    ...Direction1aA(props),
    body: <Toolbar {...props} filtersInSearch phoneSet="funnelPlain" />,
    listCount: props.phone ? funnelCount(props.state) : undefined,
  }
}

function ReviewRow({ state }: { state: FilterState }) {
  const on = state.filters.review
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => state.setToggle('review', !on)}
      className={cn(
        'border-warning/70 flex h-[44px] w-full items-center gap-2.5 rounded-lg border px-3 text-left text-[15px] outline-none',
        'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        on
          ? 'bg-warning text-warning-foreground'
          : 'bg-[color-mix(in_srgb,var(--warning)_16%,var(--card))]',
      )}
    >
      <InboxIcon aria-hidden className="size-[18px] shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">
          {on ? 'À revoir' : `${REVIEW_COUNT} opérations`}
        </span>
        {on ? ' · toutes les dates' : ' à revoir'}
      </span>
      {on ? (
        <XIcon aria-hidden className="size-[16px] shrink-0" />
      ) : (
        <ChevronRightIcon aria-hidden className="size-[18px] shrink-0" />
      )}
    </button>
  )
}

function Direction1aB(props: DirectionProps) {
  const { state, phone } = props
  return {
    titleEnd: phone ? undefined : <ReviewButton state={state} phone={false} />,
    body: (
      <Toolbar
        {...props}
        phoneReview={phone ? <ReviewRow state={state} /> : undefined}
      />
    ),
  }
}

/* 1b. Tabs over the toolbar: « Toutes les opérations » / « À revoir 7 ». */

function Direction1b(props: DirectionProps) {
  const { state, phone } = props
  const on = state.filters.review
  const tab = (selected: boolean) =>
    cn(
      '-mb-px flex min-h-[46px] items-center justify-center gap-2 border-b-[3px] px-3 text-[15px] whitespace-nowrap outline-none',
      phone && 'flex-1',
      selected
        ? 'text-foreground font-semibold'
        : 'text-muted-foreground hover:text-foreground border-transparent font-medium',
    )
  return {
    titleEnd: undefined,
    body: (
      <>
        <div role="tablist" className="flex border-b">
          <button
            type="button"
            role="tab"
            aria-selected={!on}
            onClick={() => state.setToggle('review', false)}
            className={cn(tab(!on), !on && 'border-primary')}
          >
            {phone ? 'Toutes' : 'Toutes les opérations'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => state.setToggle('review', true)}
            className={cn(tab(on), on && 'border-warning')}
          >
            {!phone && (
              <InboxIcon
                aria-hidden
                className={cn('size-[18px]', !on && 'text-warning')}
              />
            )}
            À revoir
            <ReviewCount value={REVIEW_COUNT} />
          </button>
        </div>
        <Toolbar {...props} />
      </>
    ),
  }
}

/* 1c. A callout above the toolbar. */

function Direction1c(props: DirectionProps) {
  const { state, phone } = props
  const on = state.filters.review
  return {
    titleEnd: undefined,
    body: (
      <>
        <div
          className={cn(
            'border-warning/60 flex min-h-[60px] items-center gap-3 rounded-xl border px-3 py-2',
            on
              ? 'bg-[color-mix(in_srgb,var(--warning)_30%,var(--card))]'
              : 'bg-[color-mix(in_srgb,var(--warning)_14%,var(--card))]',
          )}
        >
          <span className="bg-warning text-warning-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
            <InboxIcon aria-hidden className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[15px] font-semibold">
              {on
                ? 'Opérations à revoir'
                : `${REVIEW_COUNT} opérations à revoir`}
            </span>
            {!phone && (
              <span className="text-muted-foreground block text-[13px]">
                {on
                  ? 'Toutes les dates · validez ou classez chaque ligne'
                  : 'Sans catégorie ou à vérifier, toutes dates confondues'}
              </span>
            )}
          </span>
          <Button
            variant={on ? 'secondary' : 'warning'}
            outline={on}
            className="h-[40px] shrink-0 rounded-lg px-3"
            onClick={() => state.setToggle('review', !on)}
          >
            {on ? 'Quitter' : 'Revoir'}
          </Button>
        </div>
        <Toolbar {...props} />
      </>
    ),
  }
}

/* ---------------------------------------------------------------------------
 * Frames and boards
 * ------------------------------------------------------------------------ */

type Direction =
  | 'A'
  | '1a'
  | '1aA'
  | '1aA1'
  | '1aA2'
  | '1aA3'
  | '1aA4'
  | '1aA5'
  | '1aB'
  | '1b'
  | '1c'

interface DirectionProps {
  state: FilterState
  phone: boolean
  setOverlay: (overlay: Overlay) => void
  /** A computer frame with the category list open (screenshots). */
  openCategory: boolean
}

function Frame({
  direction,
  preset,
  width,
  height,
  phone,
  overlay: initialOverlay = null,
  openCategory = false,
}: {
  direction: Direction
  preset: Preset
  width: number
  height?: number
  phone: boolean
  overlay?: Overlay
  openCategory?: boolean
}) {
  const state = useFilters(preset)
  const [overlay, setOverlay] = React.useState<Overlay>(initialOverlay)
  const props = { state, phone, setOverlay, openCategory }
  const view = {
    A: DirectionA,
    '1a': Direction1a,
    '1aA': Direction1aA,
    '1aA1': Direction1aA1,
    '1aA2': Direction1aA2,
    '1aA3': Direction1aA3,
    '1aA4': Direction1aA4,
    '1aA5': Direction1aA5,
    '1aB': Direction1aB,
    '1b': Direction1b,
    '1c': Direction1c,
  }[direction](props)
  const close = () => setOverlay(null)
  let screen: React.ReactNode = null
  if (overlay?.kind === 'sheet')
    screen = (
      <SheetA state={state} onClose={close} withReview={direction === 'A'} />
    )
  if (overlay?.kind === 'list')
    screen = (
      <PhoneScreen title={LISTS[overlay.key].label} onClose={close}>
        <OptionsList
          listKey={overlay.key}
          value={state.filters[overlay.key]}
          onPick={(value) => {
            state.setList(overlay.key, value)
            close()
          }}
        />
      </PhoneScreen>
    )
  return (
    <div
      style={{ width, height }}
      className={cn(
        'bg-background text-foreground @container relative overflow-hidden border shadow-xl',
        phone ? 'rounded-[36px]' : 'rounded-xl',
        height !== undefined && 'overflow-y-auto [scrollbar-width:none]',
      )}
    >
      {phone && <div aria-hidden className="h-[34px]" />}
      <Chrome
        phone={phone}
        review={state.filters.review}
        titleEnd={view.titleEnd}
      >
        {view.body}
        <Totals
          review={state.filters.review}
          head={(view as { totalsHead?: React.ReactNode }).totalsHead}
        />
        <ListPreview
          review={state.filters.review}
          count={(view as { listCount?: number }).listCount}
        />
      </Chrome>
      {screen}
    </div>
  )
}

/** The app's 22px root, while the story is shown. */
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

type Group = 'desktop' | '320' | '390' | 'all'

const STATES: { preset: Preset; label: string }[] = [
  { preset: 'none', label: 'Rien de choisi' },
  { preset: 'two', label: 'Deux filtres : Livret A, Courses' },
  { preset: 'review', label: '« À revoir »' },
]

function Board({
  direction,
  text,
  group = 'all',
}: {
  direction: Direction
  text: string
  group?: Group
}) {
  const frames: { group: Group; label: string; node: React.ReactNode }[] = [
    ...STATES.map(({ preset, label }) => ({
      group: 'desktop' as Group,
      label: `Ordinateur · ${label}`,
      node: (
        <Frame
          direction={direction}
          preset={preset}
          width={1100}
          phone={false}
        />
      ),
    })),
    {
      group: 'desktop',
      label: 'Ordinateur · la liste des catégories ouverte',
      node: (
        <div style={{ height: 760 }}>
          <Frame
            direction={direction}
            preset="two"
            width={1100}
            phone={false}
            openCategory
          />
        </div>
      ),
    },
    ...STATES.map(({ preset, label }) => ({
      group: '320' as Group,
      label: `320 px · ${label}`,
      node: <Frame direction={direction} preset={preset} width={320} phone />,
    })),
    ...STATES.map(({ preset, label }) => ({
      group: '390' as Group,
      label: `390 px · ${label}`,
      node: <Frame direction={direction} preset={preset} width={390} phone />,
    })),
    {
      group: '390',
      label: '390 px · « Filtres » ouvert',
      node: (
        <Frame
          direction={direction}
          preset="two"
          width={390}
          height={780}
          phone
          overlay={{ kind: 'sheet' }}
        />
      ),
    },
  ]
  return (
    <AppRoot>
      <div className="bg-background text-foreground min-h-screen space-y-4 p-6">
        {group === 'all' && (
          <p className="text-muted-foreground max-w-[70ch] text-[15px]">
            {text}
          </p>
        )}
        <div className="flex flex-wrap items-start gap-8">
          {frames
            .filter((frame) => group === 'all' || frame.group === group)
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

function toGroup(value: unknown): Group {
  return value === 'desktop' || value === '320' || value === '390'
    ? value
    : 'all'
}

const meta = {
  title: 'Prototypes/Filtres des opérations (#406)',
  parameters: { layout: 'fullscreen' },
  args: { group: 'all' },
  argTypes: {
    group: { control: 'select', options: ['all', 'desktop', '320', '390'] },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const R1aA4_Decompte: Story = {
  name: '1a·A·4. Filtres choisis : le décompte',
  render: (args) => (
    <Board
      direction="1aA4"
      group={toGroup((args as { group?: unknown }).group)}
      text="1a·A·4 (téléphone). Un décompte : on part de tout le mois (142 opérations), chaque filtre choisi est une marche reliée à la précédente par un fil, avec ce qu’il en reste (38 avec Livret A, puis 12 avec Courses) et une barre de cette part du total. × retire une marche. Dans sa carte."
    />
  ),
}

export const R1aA5_DecompteSansCarte: Story = {
  name: '1a·A·5. Filtres choisis : le décompte, sans carte',
  render: (args) => (
    <Board
      direction="1aA5"
      group={toGroup((args as { group?: unknown }).group)}
      text="1a·A·5 (téléphone). Le même décompte, posé sous la recherche sans carte autour."
    />
  ),
}

export const R1aA1_Ligne: Story = {
  name: '1a·A·1. Filtres choisis : une ligne',
  render: (args) => (
    <Board
      direction="1aA1"
      group={toGroup((args as { group?: unknown }).group)}
      text="1a·A·1 (téléphone). Les filtres choisis ne sont plus des badges : une seule ligne de texte sous la recherche, « [icône] Livret A · [icône] Courses », qui ouvre les filtres, et × au bout pour tout effacer."
    />
  ),
}

export const R1aA2_Totaux: Story = {
  name: '1a·A·2. Filtres choisis : en tête des totaux',
  render: (args) => (
    <Board
      direction="1aA2"
      group={toGroup((args as { group?: unknown }).group)}
      text="1a·A·2 (téléphone). Les filtres choisis ouvrent la carte des totaux, dont ils sont la source : « [icône] Livret A · [icône] Courses × » sur sa première ligne, légèrement teintée. Rien de plus sous la recherche."
    />
  ),
}

export const R1aA3_Defilante: Story = {
  name: '1a·A·3. Filtres choisis : une rangée qui défile',
  render: (args) => (
    <Board
      direction="1aA3"
      group={toGroup((args as { group?: unknown }).group)}
      text="1a·A·3 (téléphone). Des étiquettes légères, grises, sans bordure ni couleur de fond, sur une seule rangée qui défile de côté (jamais sur deux lignes), puis « Effacer »."
    />
  ),
}

export const R1aA_FiltresDansLaRecherche: Story = {
  name: '1a·A. Téléphone : filtres dans la recherche',
  render: (args) => (
    <Board
      direction="1aA"
      group={toGroup((args as { group?: unknown }).group)}
      text="1a·A (téléphone ; l’ordinateur reste 1a). « Filtres » entre dans le champ de recherche, à son bout, après un trait. « À revoir 7 » au bout du titre devient une pastille ronde avec son libellé : deux formes, deux places, plus deux carrés l’un sur l’autre."
    />
  ),
}

export const R1aB_RevoirEnRangee: Story = {
  name: '1a·B. Téléphone : « À revoir » en rangée',
  render: (args) => (
    <Board
      direction="1aB"
      group={toGroup((args as { group?: unknown }).group)}
      text="1a·B (téléphone ; l’ordinateur reste 1a). « À revoir » quitte le titre : une rangée ambre sur toute la largeur sous la recherche, « 7 opérations à revoir › », comme la puce pleine largeur de #393. Le bouton des filtres reste à côté de la recherche."
    />
  ),
}

export const R1a_Titre: Story = {
  name: '1a. « À revoir » à côté du titre',
  render: (args) => (
    <Board
      direction="1a"
      group={toGroup((args as { group?: unknown }).group)}
      text="1a. Une barre d’outils : la recherche et chaque filtre ont la même hauteur, les mêmes coins, le même fond de carte, sur une ligne. Chaque filtre dit ce qu’il filtre et sa valeur ; choisi, il prend la couleur et l’icône de sa valeur. « À revoir » sort des filtres : un bouton ambre au bout du titre de la page, avec son nombre."
    />
  ),
}

export const R1b_Onglets: Story = {
  name: '1b. « À revoir » en onglet',
  render: (args) => (
    <Board
      direction="1b"
      group={toGroup((args as { group?: unknown }).group)}
      text="1b. La même barre d’outils, sous deux onglets : « Toutes les opérations » et « À revoir 7 » (souligné d’ambre quand il est ouvert)."
    />
  ),
}

export const R1c_Encart: Story = {
  name: '1c. « À revoir » en encart',
  render: (args) => (
    <Board
      direction="1c"
      group={toGroup((args as { group?: unknown }).group)}
      text="1c. La même barre d’outils, sous un encart ambre : « 7 opérations à revoir », une ligne qui dit pourquoi, et « Revoir » ; une fois ouvert, « Opérations à revoir » et « Quitter »."
    />
  ),
}

export const A_Puces: Story = {
  name: 'Avant : option 1 de la 1re série',
  render: (args) => (
    <Board
      direction="A"
      group={toGroup((args as { group?: unknown }).group)}
      text="A. Les puces d’aujourd’hui, chacune avec son icône. Une puce qui ouvre une liste finit par ⌄ ; une puce oui / non commence par une case ronde. Choisie, la puce montre l’icône de la valeur (le badge du compte, l’icône de la catégorie). « À revoir » porte son nombre dans la puce. Sur téléphone, « Filtres » ouvre une page : une ligne par filtre avec les mêmes icônes, chaque liste sur son écran."
    />
  ),
}
