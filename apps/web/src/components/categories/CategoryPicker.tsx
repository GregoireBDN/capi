import {
  CategoryIcon,
  ChoiceTiles,
  cn,
  OptionGroup,
  OptionRow,
  SearchField,
  Sheet,
  SheetBar,
  SheetContent,
  useIsMobile,
} from '@finances/ui'
import type { ChoiceTileOption } from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  PlusIcon,
  TagIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { CategoryDto, TransactionKind } from '#/api/types.gen'
import { manualSuggestionsQuery } from '#/components/expenses/queries'
import {
  EDITOR_STEADY_HEIGHT,
  editorSide,
} from '#/components/sheets/form-sheet'
import {
  KIND_LABELS,
  TRANSACTION_KINDS,
} from '#/components/transactions/labels'
import { pickableCategories } from '#/lib/categories'

/*
 * The kind and category picker (#396, the owner's « A. Tuiles »): the kinds
 * as tiles and a search, fixed at the top; under them the list that
 * scrolls: « Habituels » (usual labels with their category), « Les plus
 * utilisées », then every category of the kind, A–Z, one row each. A picker
 * for one kind has no tiles (#368: a categorized row has its category's
 * kind). Archived categories never show (`pickableCategories`), but the one
 * already chosen.
 */

/** A kind's tile, pastel like a category's: expense orange, income green, transfer blue. */
export const KIND_TILES: Record<
  TransactionKind,
  ChoiceTileOption<TransactionKind>
> = {
  expense: {
    value: 'expense',
    label: 'Dépense',
    icon: <ArrowUpRightIcon />,
    color: '#d97706',
  },
  income: {
    value: 'income',
    label: 'Revenu',
    icon: <ArrowDownLeftIcon />,
    color: '#16a34a',
  },
  transfer: {
    value: 'transfer',
    label: 'Virement',
    icon: <ArrowLeftRightIcon />,
    color: '#0284c7',
  },
}

/** A usual label and the category it is usually filed in. */
export interface CategoryHabit {
  label: string
  categoryId?: string | null
}

/** Habits shown at most, so the categories stay in view. */
const HABITS_MAX = 5
/** « Les plus utilisées » at most. */
const MOST_USED_MAX = 4

/** Lowercase, without accents, for the search. */
function searchable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export interface CategoryPickerProps {
  categories: readonly CategoryDto[]
  /** The chosen category, or null. */
  value: string | null
  /** A category tapped (also one already chosen). */
  onPick: (categoryId: string) => void
  /** The kinds offered: one hides the tiles. All three by default. */
  kinds?: readonly TransactionKind[]
  /**
   * The kind shown, when the caller keeps it (the quick entry); otherwise
   * the picker starts on the chosen category's kind, else the first.
   */
  kind?: TransactionKind
  onKindChange?: (kind: TransactionKind) => void
  /** Under the tiles, fixed too (a transfer's « Sortie / Entrée »). */
  headerExtra?: ReactNode
  /** « Habituels »: usual labels with their category (the quick entry). */
  habits?: readonly CategoryHabit[]
  /** The label of the habit chosen, drawn chosen. */
  habitChosen?: string
  onPickHabit?: (habit: CategoryHabit) => void
  /** Shown first in « Les plus utilisées » (the envelopes). */
  preferred?: readonly string[]
  /** A row leaving it without a category (« Sans catégorie »). */
  none?: {
    label: string
    detail?: string
    selected: boolean
    onPick: () => void
  }
  /** Categories left out (the one being deleted). */
  exclude?: readonly string[]
  /**
   * « Nouvelle catégorie « … » » under a search that names no category
   * (#394): creates it with that name, in the kind shown.
   */
  onCreate?: (name: string, kind: TransactionKind) => void
  /** The category being created: its row waits. */
  creating?: boolean
  /** Focus the search at once (a computer; never on a phone). */
  autoFocusSearch?: boolean
  headerClassName?: string
  listClassName?: string
}

/**
 * The picker: a fixed top (tiles, search) and the list that scrolls, as two
 * siblings: put it in a flex column of bounded height (a sheet), where the
 * list takes the rest (`data-sheet-scroll`: room for the keyboard).
 */
export function CategoryPicker({
  categories,
  value,
  onPick,
  kinds = TRANSACTION_KINDS,
  kind: kindProp,
  onKindChange,
  headerExtra,
  habits = [],
  habitChosen,
  onPickHabit,
  preferred = [],
  none,
  exclude = [],
  onCreate,
  creating = false,
  autoFocusSearch = false,
  headerClassName,
  listClassName,
}: CategoryPickerProps) {
  const pickable = pickableCategories(categories, value).filter(
    (category) =>
      kinds.includes(category.kind) && !exclude.includes(category.id),
  )
  const chosen = pickable.find((category) => category.id === value)
  const [ownKind, setOwnKind] = useState<TransactionKind>(
    chosen?.kind ?? kinds[0],
  )
  const kind = kindProp ?? ownKind
  const setKind = (next: TransactionKind) => {
    setOwnKind(next)
    onKindChange?.(next)
  }
  const [query, setQuery] = useState('')
  const wanted = searchable(query)
  const searching = wanted !== ''
  const suggestions = useQuery({
    ...manualSuggestionsQuery(kind),
    enabled: !searching,
  })

  const byName = (a: CategoryDto, b: CategoryDto) =>
    a.name.localeCompare(b.name, 'fr')
  const ofKind = pickable.filter((category) => category.kind === kind)
  const byId = new Map(pickable.map((category) => [category.id, category]))
  const matches = (category: CategoryDto) =>
    searchable(category.name).includes(wanted)

  // Searching looks in every kind offered, the one shown first.
  const results = searching
    ? [
        ...ofKind.filter(matches).sort(byName),
        ...pickable
          .filter((category) => category.kind !== kind && matches(category))
          .sort(byName),
      ]
    : [...ofKind].sort(byName)

  // A name no category of the kind has yet (case and accents ignored).
  const newName = query.trim().replace(/\s+/g, ' ')
  const canCreate =
    onCreate !== undefined &&
    searching &&
    !ofKind.some((category) => searchable(category.name) === wanted)
  const create = () => {
    if (canCreate && !creating) onCreate(newName, kind)
  }

  const shownHabits = habits
    .filter((habit) => {
      const usual = habit.categoryId ? byId.get(habit.categoryId) : undefined
      if (usual && usual.kind !== kind) return false
      return (
        !searching ||
        searchable(habit.label).includes(wanted) ||
        (usual !== undefined && matches(usual))
      )
    })
    .slice(0, HABITS_MAX)
  const habitSelected = shownHabits.some(
    (habit) =>
      habitChosen !== undefined &&
      searchable(habit.label) === searchable(habitChosen),
  )

  const mostUsed = searching
    ? []
    : [...new Set([...preferred, ...(suggestions.data?.categoryIds ?? [])])]
        .map((id) => byId.get(id))
        .filter((category): category is CategoryDto => category?.kind === kind)
        .slice(0, MOST_USED_MAX)

  function pick(category: CategoryDto) {
    if (category.kind !== kind) setKind(category.kind)
    onPick(category.id)
  }

  const row = (category: CategoryDto, key: string) => (
    <OptionRow
      key={key}
      selected={!habitSelected && category.id === value}
      leading={<CategoryIcon icon={category.icon} color={category.color} />}
      label={category.name}
      detail={category.kind !== kind ? KIND_LABELS[category.kind] : undefined}
      onClick={() => pick(category)}
    />
  )

  return (
    <>
      <div
        data-slot="category-picker-top"
        className={cn(
          'shrink-0 space-y-3 border-b px-4 pt-3 pb-3',
          headerClassName,
        )}
      >
        {kinds.length > 1 && (
          <ChoiceTiles
            aria-label="Type"
            options={kinds.map((option) => KIND_TILES[option])}
            value={kind}
            onValueChange={setKind}
          />
        )}
        {headerExtra}
        <SearchField
          aria-label="Rechercher une catégorie"
          placeholder="Rechercher"
          autoFocus={autoFocusSearch}
          value={query}
          onValueChange={setQuery}
          onKeyDown={(event) => {
            // Enter takes the first result, never submits the form.
            if (event.key !== 'Enter') return
            event.preventDefault()
            if (searching && results.length > 0) pick(results[0])
            else create()
          }}
        />
      </div>
      <div
        data-sheet-scroll=""
        className={cn(
          'min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-6',
          listClassName,
        )}
      >
        <div role="radiogroup" aria-label="Catégorie">
          {shownHabits.length > 0 && (
            <OptionGroup title="Habituels">
              {shownHabits.map((habit) => {
                const usual = habit.categoryId
                  ? byId.get(habit.categoryId)
                  : undefined
                return (
                  <OptionRow
                    key={habit.label}
                    selected={
                      habitChosen !== undefined &&
                      searchable(habit.label) === searchable(habitChosen)
                    }
                    leading={
                      <CategoryIcon
                        icon={usual?.icon ?? null}
                        color={usual?.color ?? null}
                      />
                    }
                    label={habit.label}
                    detail={usual?.name}
                    onClick={() => onPickHabit?.(habit)}
                  />
                )
              })}
            </OptionGroup>
          )}
          {mostUsed.length > 0 && (
            <OptionGroup title="Les plus utilisées">
              {mostUsed.map((category) => row(category, `used-${category.id}`))}
            </OptionGroup>
          )}
          <OptionGroup
            title={searching ? 'Résultats' : 'Toutes les catégories'}
          >
            {results.map((category) => row(category, category.id))}
            {!searching && none && (
              <OptionRow
                selected={none.selected}
                leading={<CategoryIcon icon={null} color={null} />}
                label={none.label}
                detail={none.detail}
                onClick={none.onPick}
              />
            )}
          </OptionGroup>
          {searching && results.length === 0 && !canCreate && (
            <p className="text-muted-foreground px-4 py-3 text-[15px]">
              Aucune catégorie « {query.trim()} ».
            </p>
          )}
        </div>
        {canCreate && (
          <OptionRow
            role="button"
            disabled={creating}
            leading={
              <span
                aria-hidden
                className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[0.85rem]"
              >
                <PlusIcon />
              </span>
            }
            label={`Nouvelle catégorie « ${newName} »`}
            detail={KIND_LABELS[kind]}
            onClick={create}
          />
        )}
      </div>
    </>
  )
}

type PickerSheetProps = Omit<CategoryPickerProps, 'autoFocusSearch'> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
}

/**
 * The picker in its own panel (a field's), the whole screen on a phone, a
 * centred modal elsewhere: a tap picks and closes it.
 */
export function CategoryPickerSheet({
  open,
  onOpenChange,
  title,
  description,
  onPick,
  none,
  ...props
}: PickerSheetProps) {
  const isMobile = useIsMobile()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className={cn('gap-0', EDITOR_STEADY_HEIGHT)}
      >
        <SheetBar title={title} description={description} />
        <CategoryPicker
          {...props}
          autoFocusSearch={!isMobile}
          onPick={(categoryId) => {
            onOpenChange(false)
            onPick(categoryId)
          }}
          none={
            none && {
              ...none,
              onPick: () => {
                onOpenChange(false)
                none.onPick()
              },
            }
          }
        />
      </SheetContent>
    </Sheet>
  )
}

/**
 * A category as a field: the chosen one (icon and name) or the placeholder,
 * opening the picker in its own panel.
 */
export function CategoryField({
  categories,
  value,
  onPick,
  label,
  placeholder = 'Choisir une catégorie',
  sheetTitle,
  sheetDescription,
  kinds,
  exclude,
  preferred,
  none,
  id,
  disabled,
  invalid,
  className,
}: {
  categories: readonly CategoryDto[]
  value: string | null
  onPick: (categoryId: string) => void
  /** Accessible name (« Catégorie de la part 1 »), also the panel's title. */
  label: string
  placeholder?: string
  sheetTitle?: string
  sheetDescription?: string
  kinds?: readonly TransactionKind[]
  exclude?: readonly string[]
  /** Shown first in « Les plus utilisées ». */
  preferred?: readonly string[]
  /** « Sans catégorie »: its row in the panel, and the field's text. */
  none?: {
    label: string
    detail?: string
    selected: boolean
    onPick: () => void
  }
  id?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const chosen = categories.find((category) => category.id === value)
  const text = chosen?.name ?? (none?.selected ? none.label : placeholder)
  return (
    <>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-label={`${label} : ${text}`}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          'border-input flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border bg-transparent px-2.5 text-left text-base outline-none md:text-sm',
          'hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
          'dark:bg-input/30 disabled:pointer-events-none disabled:opacity-50',
          'aria-invalid:border-destructive',
          className,
        )}
      >
        {chosen ? (
          <CategoryIcon icon={chosen.icon} color={chosen.color} size="sm" />
        ) : (
          <TagIcon
            aria-hidden
            className="text-muted-foreground size-4 shrink-0"
          />
        )}
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            !chosen && !none?.selected && 'text-muted-foreground',
          )}
        >
          {text}
        </span>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </button>
      <CategoryPickerSheet
        open={open}
        onOpenChange={setOpen}
        title={sheetTitle ?? label}
        description={sheetDescription}
        categories={categories}
        value={value}
        onPick={onPick}
        kinds={kinds}
        exclude={exclude}
        preferred={preferred}
        none={none}
      />
    </>
  )
}
