/*
 * #406 prototypes: Opérations' filters, clearer and with icons, drawn in
 * the app's frame (header, month bar, title, search, filters, totals, the
 * start of the list) on a computer and on phones of 320 and 390 px. The
 * owner kept A (icon chips) from a first round of three; A1–A3 are its
 * second round. Deleted by the PR that builds the chosen one. Synthetic
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

function Totals({ review }: { review: boolean }) {
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

function ListPreview({ review }: { review: boolean }) {
  const rows = review ? REVIEW_ROWS : ROWS
  return (
    <section className="bg-card overflow-hidden rounded-xl border">
      <div className="text-muted-foreground flex min-h-11 items-center justify-between border-b px-3 text-[14px]">
        <span>{review ? `${REVIEW_COUNT} à revoir` : '42 opérations'}</span>
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
 * Second round (the owner, 21 Nov: A's icon chips, but the chips and the
 * search are badly fitted into the page, a small icon is not enough, and
 * « À revoir » needs something more distinct on a computer). Three variants
 * of A, all with:
 * - the search and the filters in one bar (one card), the search inside it;
 * - each chip naming what it filters and its value (« Compte · Tous »);
 * - a chip once set tinted with its value's own colour (the category's, the
 *   account type's, the kind's), with its icon;
 * - « À revoir » in amber, the colour of the rows to review, never like a
 *   filter chip: A1 a pill set apart, A2 tabs, A3 a strip at the bar's end.
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

const BAR_CHIP =
  'relative inline-flex min-h-[38px] max-w-full items-center gap-1.5 rounded-full border text-[15px] whitespace-nowrap outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:touch-hitbox'

/** « [icon] Compte · Tous ⌄ », or « [value icon] Compte Livret A × » tinted. */
function BarChip({
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
        <button
          type="button"
          className={cn(
            BAR_CHIP,
            'bg-background hover:bg-muted pr-2.5 pl-3 font-medium',
          )}
        >
          <Icon aria-hidden className="text-muted-foreground size-[17px]" />
          {meta.label}
          <span className="text-muted-foreground font-normal">
            · {meta.short}
          </span>
          <ChevronDownIcon aria-hidden className="size-[16px] opacity-60" />
        </button>
      </OptionsPopover>
    )
  const chosen = valueOf(listKey, value)
  const color = valueColor(listKey, value)
  const chip = (
    <span
      className={cn(BAR_CHIP, 'pr-1 pl-1.5')}
      style={{
        borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, var(--card))`,
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
          className="flex min-w-0 items-center gap-1.5 outline-none"
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
        className="hover:bg-foreground/10 flex size-7 shrink-0 items-center justify-center rounded-full"
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

/** « Ponctuelles »: on / off, its round check like A. */
function OneOffChip({ state }: { state: FilterState }) {
  const on = state.filters.oneOff
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => state.setToggle('oneOff', !on)}
      className={cn(
        BAR_CHIP,
        'pr-3 pl-1.5 font-medium',
        on
          ? 'border-primary/60 bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]'
          : 'bg-background hover:bg-muted',
      )}
    >
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
      <SparkleIcon aria-hidden className="text-muted-foreground size-[17px]" />
      Ponctuelles
    </button>
  )
}

/** The count of the rows to review, in their amber. */
function ReviewCount({ value }: { value: number }) {
  return (
    <span className="bg-warning text-warning-foreground flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[12px] font-bold tabular-nums">
      {value}
    </span>
  )
}

/** The search, inside the bar: no box of its own. */
function BarSearch({
  phone,
  state,
  setOverlay,
}: {
  phone: boolean
  state: FilterState
  setOverlay: (overlay: Overlay) => void
}) {
  const panelCount = state.count - (state.filters.review ? 1 : 0)
  return (
    <div className="flex min-h-[52px] items-center gap-2 pr-2 pl-3.5">
      <SearchIcon aria-hidden className="text-muted-foreground size-[19px]" />
      <input
        type="search"
        aria-label="Rechercher une opération"
        placeholder={
          phone ? 'Rechercher' : 'Rechercher un libellé, un marchand…'
        }
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[16px] outline-none"
      />
      {phone && (
        // On a phone, sized to its icon and count so the search keeps room.
        <Button
          variant="secondary"
          outline
          aria-label={
            panelCount > 0 ? `Filtres, ${panelCount} actifs` : 'Filtres'
          }
          className="h-[40px] shrink-0 gap-1.5 rounded-full px-2.5"
          onClick={() => setOverlay({ kind: 'sheet' })}
        >
          <SlidersHorizontalIcon aria-hidden />
          {panelCount > 0 && (
            <CountPill value={panelCount} label="filtres actifs" />
          )}
        </Button>
      )}
    </div>
  )
}

/** The chips under the search; on phones only those that are set. */
function BarChips({
  state,
  phone,
  openCategory,
  lead,
}: {
  state: FilterState
  phone: boolean
  openCategory: boolean
  /** Before the chips (A1's « À revoir »). */
  lead?: React.ReactNode
}) {
  const { filters } = state
  const set = state.count - (filters.review ? 1 : 0)
  if (phone && set === 0 && !lead) return null
  return (
    <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
      {lead}
      <BarChip listKey="account" state={state} phone={phone} />
      <BarChip
        listKey="category"
        state={state}
        phone={phone}
        forceOpen={openCategory}
      />
      <BarChip listKey="kind" state={state} phone={phone} />
      {(!phone || filters.oneOff) && <OneOffChip state={state} />}
      {set > 0 && (
        <Button variant="secondary" ghost onClick={state.clearChips}>
          Effacer
        </Button>
      )}
    </div>
  )
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card overflow-visible rounded-xl border shadow-xs">
      {children}
    </div>
  )
}

/* A1. Une barre: « À revoir » an amber pill first, a rule after it. */

function ReviewPill({
  state,
  className,
}: {
  state: FilterState
  className?: string
}) {
  const on = state.filters.review
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => state.setToggle('review', !on)}
      className={cn(
        BAR_CHIP,
        'border-warning/60 gap-2 pr-2 pl-3 font-semibold',
        on
          ? 'bg-warning text-warning-foreground'
          : 'bg-[color-mix(in_srgb,var(--warning)_16%,var(--card))]',
        className,
      )}
    >
      <InboxIcon aria-hidden className="size-[17px]" />À revoir
      {on ? (
        <XIcon aria-hidden className="size-[16px]" />
      ) : (
        <ReviewCount value={REVIEW_COUNT} />
      )}
    </button>
  )
}

function DirectionA1({
  state,
  phone,
  setOverlay,
  openCategory,
}: DirectionProps) {
  return {
    titleEnd: undefined,
    body: (
      <Bar>
        <BarSearch phone={phone} state={state} setOverlay={setOverlay} />
        <BarChips
          state={state}
          phone={phone}
          openCategory={openCategory}
          lead={
            <>
              <ReviewPill state={state} />
              {!phone && (
                <span aria-hidden className="bg-border mx-1 h-7 w-px" />
              )}
            </>
          }
        />
      </Bar>
    ),
  }
}

/* A2. Onglets: « Toutes » / « À revoir 7 » on top of the bar. */

function DirectionA2({
  state,
  phone,
  setOverlay,
  openCategory,
}: DirectionProps) {
  const on = state.filters.review
  const tab = (selected: boolean) =>
    cn(
      '-mb-px flex min-h-[48px] items-center justify-center gap-2 border-b-[3px] px-4 text-[15px] outline-none',
      phone && 'flex-1',
      selected
        ? 'text-foreground font-semibold'
        : 'text-muted-foreground border-transparent font-medium hover:text-foreground',
    )
  return {
    titleEnd: undefined,
    body: (
      <Bar>
        <div role="tablist" className="flex border-b px-1">
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
            <InboxIcon
              aria-hidden
              className={cn('size-[17px]', !on && 'text-warning')}
            />
            À revoir
            <ReviewCount value={REVIEW_COUNT} />
          </button>
        </div>
        <BarSearch phone={phone} state={state} setOverlay={setOverlay} />
        <BarChips state={state} phone={phone} openCategory={openCategory} />
      </Bar>
    ),
  }
}

/* A3. Bandeau: « À revoir » a strip at the end of the bar. */

function DirectionA3({
  state,
  phone,
  setOverlay,
  openCategory,
}: DirectionProps) {
  const on = state.filters.review
  return {
    titleEnd: undefined,
    body: (
      <Bar>
        <BarSearch phone={phone} state={state} setOverlay={setOverlay} />
        <BarChips state={state} phone={phone} openCategory={openCategory} />
        <button
          type="button"
          aria-pressed={on}
          onClick={() => state.setToggle('review', !on)}
          className={cn(
            'flex min-h-[48px] w-full items-center gap-2.5 rounded-b-xl border-t px-3.5 text-left text-[15px] outline-none',
            on
              ? 'bg-warning text-warning-foreground'
              : 'bg-[color-mix(in_srgb,var(--warning)_14%,var(--card))]',
          )}
        >
          <InboxIcon
            aria-hidden
            className={cn('size-[18px] shrink-0', !on && 'text-warning')}
          />
          <span className="min-w-0 flex-1">
            {on ? (
              <>
                <span className="font-semibold">À revoir</span>
                {!phone && ' · toutes les dates'}
              </>
            ) : (
              <>
                <span className="font-semibold">
                  {phone ? REVIEW_COUNT : `${REVIEW_COUNT} opérations`}
                </span>{' '}
                à revoir
              </>
            )}
          </span>
          <span className="flex items-center gap-1 text-[14px] font-semibold">
            {on ? 'Quitter' : 'Revoir'}
            {on ? (
              <XIcon aria-hidden className="size-[16px]" />
            ) : (
              <ChevronRightIcon aria-hidden className="size-[16px]" />
            )}
          </span>
        </button>
      </Bar>
    ),
  }
}

/* ---------------------------------------------------------------------------
 * Frames and boards
 * ------------------------------------------------------------------------ */

type Direction = 'A' | 'A1' | 'A2' | 'A3'

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
    A1: DirectionA1,
    A2: DirectionA2,
    A3: DirectionA3,
  }[direction](props)
  const close = () => setOverlay(null)
  let screen: React.ReactNode = null
  if (overlay?.kind === 'sheet')
    screen = (
      <SheetA
        state={state}
        onClose={close}
        withReview={direction === 'A' || direction === 'A1'}
      />
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
        <Totals review={state.filters.review} />
        <ListPreview review={state.filters.review} />
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

export const A1_Barre: Story = {
  name: 'A1. Une barre, « À revoir » en ambre',
  render: (args) => (
    <Board
      direction="A1"
      group={toGroup((args as { group?: unknown }).group)}
      text="A1. La recherche et les puces dans une seule barre (une carte), la recherche sans cadre à elle. Chaque puce dit ce qu’elle filtre et sa valeur (« Compte · Tous ⌄ ») ; choisie, elle prend la couleur de sa valeur (la catégorie, le type de compte) avec son icône. « À revoir » ouvre la rangée, en ambre (la couleur des opérations à revoir), son nombre dedans, séparé des filtres par un trait. Sur téléphone, « Filtres » est au bout de la recherche."
    />
  ),
}

export const A2_Onglets: Story = {
  name: 'A2. Une barre avec onglets',
  render: (args) => (
    <Board
      direction="A2"
      group={toGroup((args as { group?: unknown }).group)}
      text="A2. La même barre, coiffée de deux onglets : « Toutes les opérations » et « À revoir 7 » (souligné en ambre quand il est ouvert). « À revoir » devient une vue, comme une boîte de réception, plus un filtre parmi d’autres."
    />
  ),
}

export const A3_Bandeau: Story = {
  name: 'A3. Une barre avec bandeau',
  render: (args) => (
    <Board
      direction="A3"
      group={toGroup((args as { group?: unknown }).group)}
      text="A3. La même barre, fermée par un bandeau ambre sur toute sa largeur : « 7 opérations à revoir · Revoir › », puis « À revoir · toutes les dates · Quitter × » une fois ouvert."
    />
  ),
}

export const A_Puces: Story = {
  name: 'A. Puces à icônes (1re série)',
  render: (args) => (
    <Board
      direction="A"
      group={toGroup((args as { group?: unknown }).group)}
      text="A. Les puces d’aujourd’hui, chacune avec son icône. Une puce qui ouvre une liste finit par ⌄ ; une puce oui / non commence par une case ronde. Choisie, la puce montre l’icône de la valeur (le badge du compte, l’icône de la catégorie). « À revoir » porte son nombre dans la puce. Sur téléphone, « Filtres » ouvre une page : une ligne par filtre avec les mêmes icônes, chaque liste sur son écran."
    />
  ),
}
