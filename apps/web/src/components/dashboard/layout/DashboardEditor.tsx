import {
  Button,
  Card,
  ConfirmDialog,
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetContent,
  cn,
  useIsMobile,
} from '@capi/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  EyeIcon,
  EyeOffIcon,
  CalendarIcon,
  GripVerticalIcon,
  PlusIcon,
  RotateCcwIcon,
  SettingsIcon,
  MonitorIcon,
  PiggyBankIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import type {
  DashboardLayoutDto,
  DashboardWidgetDto,
  DashboardWidgetType,
} from '#/api/types.gen'
import { SheetScroll, editorSide } from '#/components/sheets/form-sheet'
import { AccountTypeBadge } from '#/components/transactions/filter-options'
import { envelopesQuery } from '#/components/envelopes/queries'
import { accountsQuery } from '#/lib/queries'
import { CATALOGUE_ORDER, ELEMENTS, newElement } from './catalogue'
import { resetDashboardLayout, saveDashboardLayout } from './queries'
import { reorder, useSortable } from './sortable'

/** An element's badge: its icon on its tone. */
export function ElementBadge({ type }: { type: DashboardWidgetType }) {
  const { icon: Icon, tone } = ELEMENTS[type]
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-[32px] shrink-0 items-center justify-center rounded-full [&_svg]:size-[16px]',
        tone,
      )}
    >
      <Icon />
    </span>
  )
}

/**
 * « Personnaliser » (#495, the owner's direction « B. Une liste »): one row
 * per element in its order, dragged by its handle to move it (↑ ↓ from
 * the keyboard), a switch to show it, its
 * accounts as icons; a tap opens its settings. « Ajouter » lists the
 * elements not placed, « Par défaut » brings today's dashboard back. Like
 * every editor, it edits one draft and ✓ saves it all at once; ✕ with
 * changes asks first.
 */
export function DashboardEditor({
  open,
  onOpenChange,
  layout,
  initialType,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  layout: DashboardLayoutDto
  /** Opens straight on this element's settings. */
  initialType?: DashboardWidgetType
}) {
  const isMobile = useIsMobile()
  // The open editor says whether it may close (no changes, else it asks).
  const mayClose = useRef<() => boolean>(() => true)
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next || mayClose.current()) onOpenChange(next)
      }}
    >
      <SheetContent
        side={editorSide(isMobile)}
        className="flex flex-col gap-0 overflow-hidden data-[side=center]:h-[min(44rem,calc(100svh-2rem))]"
        showCloseButton={false}
      >
        {open && (
          <Editor
            layout={layout}
            initialType={initialType}
            mayClose={mayClose}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function Editor({
  layout,
  initialType,
  mayClose,
  onClose,
}: {
  layout: DashboardLayoutDto
  initialType?: DashboardWidgetType
  mayClose: { current: () => boolean }
  onClose: () => void
}) {
  const client = useQueryClient()
  const [draft, setDraft] = useState(layout.widgets)
  const [reset, setReset] = useState(false)
  const [editing, setEditing] = useState<DashboardWidgetType | null>(
    initialType ?? null,
  )
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [moved, setMoved] = useState('')
  const sortable = useSortable({
    count: draft.length,
    onMove: (from, to) => {
      setReset(false)
      setMoved(
        `${ELEMENTS[draft[from].type].name} : position ${to + 1} sur ${draft.length}`,
      )
      setDraft((list) => reorder(list, from, to))
    },
  })
  const changed =
    reset || JSON.stringify(draft) !== JSON.stringify(layout.widgets)
  useEffect(() => {
    mayClose.current = () => {
      if (!changed) return true
      setConfirming(true)
      return false
    }
  })
  const current = editing
    ? draft.find((widget) => widget.type === editing)
    : undefined

  function update(
    type: DashboardWidgetType,
    values: Partial<DashboardWidgetDto>,
  ) {
    setReset(false)
    setDraft((list) =>
      list.map((widget) =>
        widget.type === type ? { ...widget, ...values } : widget,
      ),
    )
  }

  async function save() {
    if (!changed) return onClose()
    setSaving(true)
    try {
      await (reset
        ? resetDashboardLayout(client)
        : saveDashboardLayout(client, draft))
      onClose()
    } catch {
      toast.error('Impossible d’enregistrer le tableau de bord.')
    } finally {
      setSaving(false)
    }
  }

  const saveAction = (
    <SheetBarAction
      label="Enregistrer"
      loading={saving}
      onClick={() => void save()}
    />
  )

  if (current) {
    return (
      <>
        <SheetBar
          title={ELEMENTS[current.type].name}
          onBack={() => setEditing(null)}
          backLabel="Personnaliser"
          action={saveAction}
        />
        <SheetScroll className="space-y-5 px-4 pb-6">
          <ElementSettings
            widget={current}
            onChange={(values) => update(current.type, values)}
          />
        </SheetScroll>
      </>
    )
  }

  const placed = new Set(draft.map((widget) => widget.type))
  const missing = CATALOGUE_ORDER.filter((type) => !placed.has(type))

  return (
    <>
      <SheetBar title="Personnaliser" closeLabel="Fermer" action={saveAction} />
      <SheetScroll className="space-y-3 px-3 pb-6">
        <p
          id="dashboard-drag-help"
          className="text-muted-foreground flex items-center gap-1 px-1 text-xs"
        >
          <GripVerticalIcon aria-hidden className="size-3.5" />
          Glissez pour changer l’ordre
          <span className="sr-only">, ou flèches haut et bas</span>
        </p>
        <ul
          className={cn('space-y-2', sortable.dragging && 'select-none')}
          aria-label="Éléments affichés"
        >
          {draft.map((widget, index) => (
            <ElementRow
              key={widget.type}
              widget={widget}
              sortable={sortable.item(index)}
              handle={sortable.handle(index)}
              onShow={(shown) => update(widget.type, { hidden: !shown })}
              onOpen={() => setEditing(widget.type)}
            />
          ))}
        </ul>
        <p className="sr-only" aria-live="polite">
          {moved}
        </p>
        {missing.length > 0 && (
          <>
            <h3 className="text-muted-foreground px-1 pt-1 text-xs font-normal">
              Ajouter
            </h3>
            <Card className="gap-0 px-1 py-1">
              <ul className="divide-y">
                {missing.map((type) => (
                  <li key={type}>
                    <button
                      type="button"
                      aria-label={`Ajouter ${ELEMENTS[type].name}`}
                      onClick={() => {
                        setReset(false)
                        setDraft((list) => [...list, newElement(type)])
                      }}
                      className="hover:bg-muted/50 focus-visible:ring-ring flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left outline-none focus-visible:ring-2"
                    >
                      <ElementBadge type={type} />
                      <span className="flex-1 text-sm font-medium">
                        {ELEMENTS[type].name}
                      </span>
                      <span className="bg-primary/10 text-primary grid size-8 place-items-center rounded-full">
                        <PlusIcon className="size-4" aria-hidden />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
        <div className="flex justify-center pt-1">
          <Button
            variant="secondary"
            ghost
            disabled={!layout.custom && !changed}
            onClick={() => {
              setDraft(defaultLayout())
              setReset(true)
            }}
          >
            <RotateCcwIcon aria-hidden />
            Par défaut
          </Button>
        </div>
      </SheetScroll>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => {
          setConfirming(false)
          onClose()
        }}
        title="Abandonner les modifications ?"
        confirmLabel="Abandonner"
        cancelLabel="Continuer"
        variant="danger"
      />
    </>
  )
}

/** Today's dashboard, as « Par défaut » shows it before saving. */
function defaultLayout(): DashboardWidgetDto[] {
  return (
    [
      ['todo', 'large'],
      ['left_to_spend', 'large'],
      ['forecast', 'small'],
      ['net_worth', 'small'],
      ['tracked_budgets', 'large'],
    ] as const
  ).map(([type, size]) => ({ ...newElement(type), size }))
}

function ElementRow({
  widget,
  sortable,
  handle,
  onShow,
  onOpen,
}: {
  widget: DashboardWidgetDto
  sortable: ReturnType<ReturnType<typeof useSortable>['item']>
  handle: ReturnType<ReturnType<typeof useSortable>['handle']>
  onShow: (shown: boolean) => void
  onOpen: () => void
}) {
  const { name } = ELEMENTS[widget.type]
  return (
    <li
      ref={sortable.ref}
      style={sortable.style}
      className={cn(
        // One tile per element, so each line stands apart (#495).
        'bg-card flex min-h-[3.2rem] items-center gap-0.5 rounded-xl border px-1 shadow-xs transition-shadow',
        sortable.dragging &&
          'border-primary/50 shadow-[0_12px_18px_-8px_rgb(0_0_0/0.3)]',
      )}
    >
      <button
        type="button"
        aria-label={`Déplacer ${name}`}
        aria-describedby="dashboard-drag-help"
        {...handle}
        className={cn(
          'text-muted-foreground hover:text-foreground focus-visible:ring-ring grid h-[44px] w-[28px] shrink-0 cursor-grab touch-none place-items-center rounded-md outline-none focus-visible:ring-2 [&_svg]:size-[20px]',
          sortable.dragging && 'text-primary cursor-grabbing',
        )}
      >
        <GripVerticalIcon aria-hidden />
      </button>
      {/* The name opens the settings too; ⚙ is the button that says so. */}
      <div
        onClick={onOpen}
        className={cn(
          'flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5',
          widget.hidden && 'opacity-45',
        )}
      >
        <ElementBadge type={widget.type} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <ChosenAccounts ids={widget.accountIds} />
        </span>
      </div>
      <IconToggle
        label={`Afficher ${name}`}
        checked={!widget.hidden}
        onClick={() => onShow(widget.hidden)}
      >
        {widget.hidden ? <EyeOffIcon /> : <EyeIcon />}
      </IconToggle>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Réglages de ${name}`}
        className="text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:ring-ring grid size-[44px] shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 [&_svg]:size-[20px]"
      >
        <SettingsIcon aria-hidden />
      </button>
    </li>
  )
}

/** Shown or hidden: an eye, open in the primary colour, crossed out greyed. */
function IconToggle({
  label,
  checked,
  onClick,
  children,
}: {
  label: string
  checked: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'focus-visible:ring-ring grid size-[44px] shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 [&_svg]:size-[20px]',
        checked
          ? 'text-primary hover:bg-primary/10'
          : 'text-muted-foreground/60 hover:bg-muted/60',
      )}
    >
      {children}
    </button>
  )
}

/** The chosen accounts of an element, as their type icons. */
function ChosenAccounts({ ids }: { ids: string[] | null }) {
  const { data } = useQuery(accountsQuery)
  if (ids === null || !data) return null
  const accounts = data.filter((account) => ids.includes(account.id))
  return (
    <span className="mt-0.5 flex flex-wrap gap-1" aria-label="Comptes choisis">
      {accounts.map((account) => (
        <AccountTypeBadge key={account.id} type={account.type} size="sm" />
      ))}
      {accounts.length === 0 && (
        <span className="text-warning-foreground dark:text-warning text-xs">
          Aucun compte
        </span>
      )}
    </span>
  )
}

/* ---------------------------------------------------------------------------
 * One element's settings
 * ------------------------------------------------------------------------- */

function ElementSettings({
  widget,
  onChange,
}: {
  widget: DashboardWidgetDto
  onChange: (values: Partial<DashboardWidgetDto>) => void
}) {
  const info = ELEMENTS[widget.type]
  const setting = (values: DashboardWidgetDto['settings']) =>
    onChange({ settings: { ...widget.settings, ...values } })
  const sort = widget.settings.balancesSort ?? 'order'
  // How it shows first, then what it shows.
  return (
    <>
      {widget.type === 'balances' && (
        <Section icon={<ArrowDownWideNarrowIcon />} title="Ordre">
          <ChoiceCards
            label="Ordre"
            value={sort}
            onChange={(balancesSort) => setting({ balancesSort })}
            options={[
              {
                value: 'order',
                label: 'Mon ordre',
                icon: <GripVerticalIcon />,
              },
              {
                value: 'desc',
                label: 'Décroissant',
                icon: <ArrowDownWideNarrowIcon />,
              },
              {
                value: 'asc',
                label: 'Croissant',
                icon: <ArrowUpNarrowWideIcon />,
              },
            ]}
          />
        </Section>
      )}
      {widget.type === 'upcoming_debits' && (
        <Section icon={<CalendarIcon />} title="Période">
          <ChoiceCards
            label="Jours"
            value={String(widget.settings.upcomingDays ?? 7)}
            onChange={(days) =>
              setting({ upcomingDays: Number(days) as 7 | 30 })
            }
            options={[
              { value: '7', label: '7 jours', icon: <Big>7</Big> },
              { value: '30', label: '30 jours', icon: <Big>30</Big> },
            ]}
          />
        </Section>
      )}
      {widget.type === 'owed' && (
        <Section icon={<UsersIcon />} title="Côté">
          <ChoiceCards
            label="Côté"
            value={widget.settings.owedSide ?? 'both'}
            onChange={(owedSide) => setting({ owedSide })}
            options={[
              {
                value: 'both',
                label: 'Les deux',
                icon: <Dots colors={['bg-success', 'bg-warning']} />,
              },
              {
                value: 'owed_to_me',
                label: 'On me doit',
                icon: <Dots colors={['bg-success']} />,
              },
              {
                value: 'i_owe',
                label: 'Je dois',
                icon: <Dots colors={['bg-warning']} />,
              },
            ]}
          />
        </Section>
      )}
      <Section icon={<MonitorIcon />} title="Sur ordinateur">
        <ChoiceCards
          label="Taille sur ordinateur"
          value={widget.size}
          onChange={(size) => onChange({ size })}
          options={[
            { value: 'small', label: 'Moitié', icon: <SizePicture half /> },
            { value: 'large', label: 'Pleine largeur', icon: <SizePicture /> },
          ]}
        />
      </Section>
      {info.accountTypes && (
        <Section icon={<WalletIcon />} title="Comptes">
          <AccountChoice
            types={info.accountTypes}
            value={widget.accountIds}
            // « Mon ordre » on Soldes: the accounts are dragged in order.
            sortable={widget.type === 'balances' && sort === 'order'}
            onChange={(accountIds) => onChange({ accountIds })}
          />
        </Section>
      )}
      {info.envelopes && (
        <Section icon={<PiggyBankIcon />} title="Enveloppes">
          <EnvelopeChoice
            value={widget.envelopeIds}
            onChange={(envelopeIds) => onChange({ envelopeIds })}
          />
        </Section>
      )}
    </>
  )
}

/** A group of settings: a small icon and a word above it. */
function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground flex items-center gap-1.5 px-1 text-xs font-medium [&_svg]:size-3.5">
        <span aria-hidden>{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

/** One choice among a few, as big cards: a picture and a word. */
function ChoiceCards<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; icon: ReactNode }[]
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'grid gap-2',
        options.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'bg-card focus-visible:ring-ring flex min-h-[4.2rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2.5 text-center text-xs leading-tight font-medium outline-none focus-visible:ring-2 [&_svg]:size-[22px]',
              selected
                ? 'border-primary bg-primary/5 text-primary ring-primary/20 ring-2'
                : 'text-muted-foreground hover:bg-muted/50',
            )}
          >
            <span aria-hidden className="grid h-[26px] place-items-center">
              {option.icon}
            </span>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function Big({ children }: { children: ReactNode }) {
  return <span className="text-lg leading-none font-semibold">{children}</span>
}

function Dots({ colors }: { colors: string[] }) {
  return (
    <span className="flex gap-1">
      {colors.map((color) => (
        <span key={color} className={cn('size-3.5 rounded-full', color)} />
      ))}
    </span>
  )
}

/** A screen with the element on half of it or across it. */
function SizePicture({ half = false }: { half?: boolean }) {
  return (
    <span className="grid h-[22px] w-[40px] grid-cols-2 gap-[3px] rounded-[4px] border border-current p-[3px] opacity-90">
      <span className={cn('rounded-[2px] bg-current', !half && 'col-span-2')} />
      {half && <span className="rounded-[2px] bg-current opacity-25" />}
    </span>
  )
}

/** The accounts an element may show, each with its eye. */
function AccountChoice({
  types,
  value,
  sortable = false,
  onChange,
}: {
  types: readonly string[]
  value: string[] | null
  sortable?: boolean
  onChange: (value: string[] | null) => void
}) {
  const { data } = useQuery(accountsQuery)
  // An archived account is not offered, unless it is still chosen.
  const accounts = (data ?? []).filter(
    (account) =>
      types.includes(account.type) &&
      (account.archivedAt === null || value?.includes(account.id)),
  )
  return (
    <Choice
      value={value}
      sortable={sortable}
      onChange={onChange}
      items={accounts.map((account) => ({
        id: account.id,
        name: account.name,
        badge: <AccountTypeBadge type={account.type} />,
      }))}
    />
  )
}

function EnvelopeChoice({
  value,
  onChange,
}: {
  value: string[] | null
  onChange: (value: string[] | null) => void
}) {
  const { data } = useQuery(envelopesQuery())
  const envelopes = (data ?? []).filter((envelope) => !envelope.archived)
  return (
    <Choice
      value={value}
      onChange={onChange}
      items={envelopes.map((envelope) => ({
        id: envelope.id,
        name: envelope.name,
        badge: (
          <span
            aria-hidden
            className="grid size-[32px] shrink-0 place-items-center"
          >
            <span
              className="size-3.5 rounded-full"
              style={{ background: envelope.color ?? 'var(--primary)' }}
            />
          </span>
        ),
      }))}
    />
  )
}

/**
 * Every item as a tile with an eye. All eyes open in the usual order is
 * « all » (`null`, so a new account shows by itself); closing one, or
 * dragging one elsewhere (`sortable`), keeps the shown ones chosen, in the
 * order of the list.
 */
function Choice({
  value,
  sortable = false,
  onChange,
  items,
}: {
  value: string[] | null
  sortable?: boolean
  onChange: (value: string[] | null) => void
  items: { id: string; name: string; badge: ReactNode }[]
}) {
  const shown = (id: string) => value === null || value.includes(id)
  // The chosen ones in their order, then the hidden ones.
  const ordered =
    value === null
      ? items
      : [
          ...value.flatMap((id) => items.find((item) => item.id === id) ?? []),
          ...items.filter((item) => !value.includes(item.id)),
        ]
  function save(list: typeof items, isShown: (id: string) => boolean) {
    const ids = list.map((item) => item.id).filter(isShown)
    const usual = items.map((item) => item.id).join()
    onChange(ids.length === items.length && ids.join() === usual ? null : ids)
  }
  const drag = useSortable({
    count: ordered.length,
    onMove: (from, to) => save(reorder(ordered, from, to), shown),
  })
  function toggle(id: string) {
    save(ordered, (itemId) => (itemId === id ? !shown(id) : shown(itemId)))
  }
  return (
    <ul className={cn('space-y-1.5', drag.dragging && 'select-none')}>
      {ordered.map((item, index) => {
        const on = shown(item.id)
        const row = drag.item(index)
        return (
          <li
            key={item.id}
            ref={sortable ? row.ref : undefined}
            style={sortable ? row.style : undefined}
            onClick={() => toggle(item.id)}
            className={cn(
              'bg-card flex min-h-[3.2rem] cursor-pointer items-center gap-2 rounded-xl border py-1 pr-0.5 pl-2.5 transition-opacity',
              sortable && 'pl-0.5',
              !on && 'bg-card/60 border-dashed',
              sortable &&
                row.dragging &&
                'border-primary/60 ring-primary/20 shadow-lg ring-2',
            )}
          >
            {sortable && (
              <button
                type="button"
                aria-label={`Déplacer ${item.name}`}
                {...drag.handle(index)}
                onClick={(event) => event.stopPropagation()}
                className={cn(
                  'text-muted-foreground hover:text-foreground focus-visible:ring-ring grid h-[44px] w-[28px] shrink-0 cursor-grab touch-none place-items-center rounded-md outline-none focus-visible:ring-2 [&_svg]:size-[20px]',
                  row.dragging && 'text-primary cursor-grabbing',
                )}
              >
                <GripVerticalIcon aria-hidden />
              </button>
            )}
            <span
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2.5',
                !on && 'opacity-45',
              )}
            >
              {item.badge}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {item.name}
              </span>
            </span>
            <span onClick={(event) => event.stopPropagation()}>
              <IconToggle
                label={`Afficher ${item.name}`}
                checked={on}
                onClick={() => toggle(item.id)}
              >
                {on ? <EyeIcon /> : <EyeOffIcon />}
              </IconToggle>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
