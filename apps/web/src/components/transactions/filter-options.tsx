import {
  CategoryIcon,
  cn,
  OptionGroup,
  OptionRow,
  SearchField,
} from '@finances/ui'
import type { FilterValue } from '@finances/ui'
import {
  ArrowDownLeftIcon,
  ArrowDownUpIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  CircleHelpIcon,
  LandmarkIcon,
  TagIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type {
  AccountDto,
  AccountType,
  CategoryDto,
  TransactionKind,
} from '#/api/types.gen'
import { ACCOUNT_TYPE_ICONS } from '#/components/accounts/labels'
import { KIND_TILES } from '#/components/categories/CategoryPicker'
import { KIND_GROUP_LABELS, TRANSACTION_KINDS } from './labels'
import { UNCATEGORIZED } from './search'

/*
 * The lists of Opérations' filters (#406): the same rows in a computer's
 * popover and on the phone's « Filtres » page, each value with its own
 * icon (the account's type badge, the category's icon, the kind's arrow).
 */

/** The filters that open a list, by their search param. */
export type ListFilter = 'account' | 'category' | 'kind'

/** What each list filter is: its name, its icon, « all ». */
export const LIST_FILTERS: Record<
  ListFilter,
  { label: string; icon: LucideIcon; all: string; empty: string }
> = {
  account: {
    label: 'Compte',
    icon: LandmarkIcon,
    all: 'Tous les comptes',
    empty: 'Tous',
  },
  category: {
    label: 'Catégorie',
    icon: TagIcon,
    all: 'Toutes les catégories',
    empty: 'Toutes',
  },
  kind: {
    label: 'Type',
    icon: ArrowDownUpIcon,
    all: 'Tous les types',
    empty: 'Tous',
  },
}

const KIND_ICONS: Record<TransactionKind, LucideIcon> = {
  expense: ArrowUpRightIcon,
  income: ArrowDownLeftIcon,
  transfer: ArrowLeftRightIcon,
}

/** Sizes of the badges: small in a control, a row's in a list. */
const BADGE = {
  sm: { tile: 'size-[1.15rem]', glyph: 'size-[0.7rem]' },
  md: { tile: 'size-7', glyph: 'size-[0.85rem]' },
} as const

/** An account's type badge (the account lists' icon and colour). */
export function AccountTypeBadge({
  type,
  size = 'md',
}: {
  type: AccountType
  size?: 'sm' | 'md'
}) {
  const { icon: Icon, className } = ACCOUNT_TYPE_ICONS[type]
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        BADGE[size].tile,
        className,
      )}
    >
      <Icon className={BADGE[size].glyph} />
    </span>
  )
}

/** A kind's arrow on a tile of its #396 colour. */
export function KindBadge({
  kind,
  size = 'md',
}: {
  kind: TransactionKind
  size?: 'sm' | 'md'
}) {
  const Icon = KIND_ICONS[kind]
  const color = KIND_TILES[kind].color ?? 'var(--primary)'
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        BADGE[size].tile,
        size === 'sm' ? 'rounded-[0.3rem]' : 'rounded-lg',
      )}
      style={{
        color: `color-mix(in oklab, ${color} 82%, var(--foreground))`,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
    >
      <Icon className={BADGE[size].glyph} />
    </span>
  )
}

/** A filter's own icon on a neutral tile (« Tous les comptes »). */
export function FilterBadge({
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
        BADGE[size].tile,
        size === 'sm' ? 'rounded-[0.3rem]' : 'rounded-lg',
      )}
    >
      <Icon className={BADGE[size].glyph} />
    </span>
  )
}

/** A category's name in the filters, archived ones said so. */
function categoryName(category: CategoryDto): string {
  return category.archivedAt ? `${category.name} (archivée)` : category.name
}

/**
 * The chosen value of a list filter: its name, its own icon and colour;
 * none when the value is unknown (an account no longer listed).
 */
export function filterValue(
  key: ListFilter,
  value: string | undefined,
  accounts: readonly AccountDto[],
  categories: readonly CategoryDto[],
  size: 'sm' | 'md' = 'sm',
): FilterValue | undefined {
  if (value === undefined || value === '') return undefined
  if (key === 'account') {
    const account = accounts.find((item) => item.id === value)
    if (!account) return undefined
    return {
      label: account.name,
      icon: <AccountTypeBadge type={account.type} size={size} />,
      color: ACCOUNT_TYPE_ICONS[account.type].color,
    }
  }
  if (key === 'kind') {
    if (!TRANSACTION_KINDS.includes(value as TransactionKind)) return undefined
    const kind = value as TransactionKind
    return {
      label: KIND_GROUP_LABELS[kind],
      icon: <KindBadge kind={kind} size={size} />,
      color: KIND_TILES[kind].color,
    }
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
  const category = categories.find((item) => item.id === value)
  if (!category) return undefined
  return {
    label: categoryName(category),
    icon: (
      <CategoryIcon icon={category.icon} color={category.color} size={size} />
    ),
    color: category.color ?? undefined,
  }
}

/** Ignores case and accents ("energie" finds « Énergie »). */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * The options of a list filter, as `OptionRow`s: « Tous … » first, then
 * the accounts with their badge, the kinds with their arrow, or the
 * categories grouped by kind with their icon, under a search.
 */
export function FilterOptionsList({
  filter,
  value,
  onPick,
  accounts,
  categories,
}: {
  filter: ListFilter
  value: string | undefined
  onPick: (value: string | undefined) => void
  accounts: readonly AccountDto[]
  categories: readonly CategoryDto[]
}) {
  const [query, setQuery] = useState('')
  const meta = LIST_FILTERS[filter]
  const all = (
    <OptionRow
      selected={value === undefined}
      leading={<FilterBadge icon={meta.icon} />}
      label={meta.all}
      onClick={() => onPick(undefined)}
    />
  )
  if (filter === 'account')
    return (
      <div
        role="radiogroup"
        aria-label={`Choix : ${meta.label}`}
        className="divide-y"
      >
        {all}
        {accounts.map((account) => (
          <OptionRow
            key={account.id}
            selected={value === account.id}
            leading={<AccountTypeBadge type={account.type} />}
            label={account.name}
            onClick={() => onPick(account.id)}
          />
        ))}
      </div>
    )
  if (filter === 'kind')
    return (
      <div
        role="radiogroup"
        aria-label={`Choix : ${meta.label}`}
        className="divide-y"
      >
        {all}
        {TRANSACTION_KINDS.map((kind) => (
          <OptionRow
            key={kind}
            selected={value === kind}
            leading={<KindBadge kind={kind} />}
            label={KIND_GROUP_LABELS[kind]}
            onClick={() => onPick(kind)}
          />
        ))}
      </div>
    )
  const needle = fold(query.trim())
  const groups = TRANSACTION_KINDS.map((kind) => ({
    kind,
    rows: categories.filter(
      (category) =>
        category.kind === kind &&
        (needle === '' || fold(category.name).includes(needle)),
    ),
  })).filter((group) => group.rows.length > 0)
  const uncategorizedShown =
    needle === '' || fold('Sans catégorie').includes(needle)
  return (
    <div role="radiogroup" aria-label={`Choix : ${meta.label}`}>
      <div className="px-3 pt-3 pb-1">
        <SearchField
          aria-label="Rechercher une catégorie"
          placeholder="Rechercher"
          value={query}
          onValueChange={setQuery}
          autoComplete="off"
        />
      </div>
      <div className="divide-y">
        {needle === '' && all}
        {uncategorizedShown && (
          <OptionRow
            selected={value === UNCATEGORIZED}
            leading={
              <CategoryIcon
                icon={null}
                color={null}
                fallback={CircleHelpIcon}
              />
            }
            label="Sans catégorie"
            onClick={() => onPick(UNCATEGORIZED)}
          />
        )}
      </div>
      {groups.map((group) => (
        <OptionGroup key={group.kind} title={KIND_GROUP_LABELS[group.kind]}>
          {group.rows.map((category) => (
            <OptionRow
              key={category.id}
              selected={value === category.id}
              leading={
                <CategoryIcon icon={category.icon} color={category.color} />
              }
              label={categoryName(category)}
              onClick={() => onPick(category.id)}
            />
          ))}
        </OptionGroup>
      ))}
      {groups.length === 0 && !uncategorizedShown && (
        <p className="text-muted-foreground px-4 py-3 text-[15px]">
          Aucune catégorie ne correspond.
        </p>
      )}
    </div>
  )
}
