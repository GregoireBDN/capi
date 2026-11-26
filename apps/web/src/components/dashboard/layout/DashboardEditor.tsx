import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  SegmentedControl,
  SegmentedControlItem,
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
  EyeIcon,
  EyeOffIcon,
  ColumnsIcon,
  ListIcon,
  GripVerticalIcon,
  PlusIcon,
  RotateCcwIcon,
  SettingsIcon,
  SquareIcon,
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
        'bg-card flex min-h-[3.2rem] items-center gap-1.5 rounded-xl border px-1 shadow-xs transition-shadow',
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
          'text-muted-foreground hover:text-foreground focus-visible:ring-ring grid h-11 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-md outline-none focus-visible:ring-2 [&_svg]:size-[20px]',
          sortable.dragging && 'text-primary cursor-grabbing',
        )}
      >
        <GripVerticalIcon aria-hidden />
      </button>
      {/* The name opens the settings too; ⚙ is the button that says so. */}
      <div
        onClick={onOpen}
        className={cn(
          'flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5 pl-1',
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
        className="text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:ring-ring grid size-11 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 [&_svg]:size-[20px]"
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
        'focus-visible:ring-ring grid size-11 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 [&_svg]:size-[20px]',
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
  return (
    <>
      {widget.type === 'balances' && (
        <SegmentedControl
          aria-label="Ordre"
          value={widget.settings.balancesSort ?? 'order'}
          onValueChange={(value) =>
            onChange({ settings: { ...widget.settings, balancesSort: value } })
          }
        >
          <SegmentedControlItem value="order">
            <ListIcon aria-hidden className="size-4" />
            Mon ordre
          </SegmentedControlItem>
          <SegmentedControlItem value="amount">
            <ArrowDownWideNarrowIcon aria-hidden className="size-4" />
            Montant
          </SegmentedControlItem>
        </SegmentedControl>
      )}
      {widget.type === 'upcoming_debits' && (
        <SegmentedControl
          aria-label="Jours"
          value={String(widget.settings.upcomingDays ?? 7)}
          onValueChange={(value) =>
            onChange({
              settings: {
                ...widget.settings,
                upcomingDays: Number(value) as 7 | 30,
              },
            })
          }
        >
          <SegmentedControlItem value="7">7 jours</SegmentedControlItem>
          <SegmentedControlItem value="30">30 jours</SegmentedControlItem>
        </SegmentedControl>
      )}
      {widget.type === 'owed' && (
        <SegmentedControl
          aria-label="Côté"
          value={widget.settings.owedSide ?? 'both'}
          onValueChange={(value) =>
            onChange({ settings: { ...widget.settings, owedSide: value } })
          }
        >
          <SegmentedControlItem value="both">Les deux</SegmentedControlItem>
          <SegmentedControlItem value="owed_to_me">
            On me doit
          </SegmentedControlItem>
          <SegmentedControlItem value="i_owe">Je dois</SegmentedControlItem>
        </SegmentedControl>
      )}
      {info.accountTypes && (
        <AccountChoice
          types={info.accountTypes}
          value={widget.accountIds}
          onChange={(accountIds) => onChange({ accountIds })}
        />
      )}
      {info.envelopes && (
        <EnvelopeChoice
          value={widget.envelopeIds}
          onChange={(envelopeIds) => onChange({ envelopeIds })}
        />
      )}
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground flex-1 text-sm">
          Sur ordinateur
        </span>
        <SegmentedControl
          aria-label="Taille sur ordinateur"
          value={widget.size}
          onValueChange={(size) => onChange({ size })}
        >
          <SegmentedControlItem value="small" aria-label="Petit">
            <SquareIcon aria-hidden className="size-4" />
          </SegmentedControlItem>
          <SegmentedControlItem value="large" aria-label="Large">
            <ColumnsIcon aria-hidden className="size-4" />
          </SegmentedControlItem>
        </SegmentedControl>
      </div>
    </>
  )
}

/** « Tous les comptes » or the ones ticked, with their type icons. */
function AccountChoice({
  types,
  value,
  onChange,
}: {
  types: readonly string[]
  value: string[] | null
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
      allLabel="Tous les comptes"
      value={value}
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
      allLabel="Toutes"
      value={value}
      onChange={onChange}
      items={envelopes.map((envelope) => ({
        id: envelope.id,
        name: envelope.name,
        badge: (
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{ background: envelope.color ?? 'var(--primary)' }}
          />
        ),
      }))}
    />
  )
}

function Choice({
  allLabel,
  value,
  onChange,
  items,
}: {
  allLabel: string
  value: string[] | null
  onChange: (value: string[] | null) => void
  items: { id: string; name: string; badge: ReactNode }[]
}) {
  const all = value === null
  return (
    <div className="space-y-1">
      <SegmentedControl
        aria-label={allLabel}
        value={all ? 'all' : 'chosen'}
        onValueChange={(mode) =>
          // Choosing starts from what is shown now: every item.
          onChange(mode === 'all' ? null : items.map((item) => item.id))
        }
      >
        <SegmentedControlItem value="all">{allLabel}</SegmentedControlItem>
        <SegmentedControlItem value="chosen">Choisis</SegmentedControlItem>
      </SegmentedControl>
      <ul className={cn('pt-1', all && 'opacity-45')}>
        {items.map((item) => {
          const checked = all || value.includes(item.id)
          return (
            <li key={item.id}>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                {item.badge}
                <span className="min-w-0 flex-1 truncate font-medium">
                  {item.name}
                </span>
                <Checkbox
                  checked={checked}
                  disabled={all}
                  onCheckedChange={(on) =>
                    onChange(
                      on
                        ? [...(value ?? []), item.id]
                        : (value ?? []).filter((id) => id !== item.id),
                    )
                  }
                />
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
