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
  Switch,
  cn,
  useIsMobile,
} from '@capi/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ColumnsIcon,
  PlusIcon,
  RotateCcwIcon,
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
import { accountsQuery } from '#/lib/queries'
import { CATALOGUE_ORDER, ELEMENTS, newElement } from './catalogue'
import { envelopeSummariesQuery } from './elements'
import { resetDashboardLayout, saveDashboardLayout } from './queries'

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

function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const target = index + by
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/**
 * « Personnaliser » (#495, the owner's direction « B. Une liste »): one row
 * per element in its order, ↑ ↓ to move it, a switch to show it, its
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
        <Card className="gap-0 px-1 py-1">
          <ul className="divide-y" aria-label="Éléments affichés">
            {draft.map((widget, index) => (
              <ElementRow
                key={widget.type}
                widget={widget}
                first={index === 0}
                last={index === draft.length - 1}
                onMove={(by) => {
                  setReset(false)
                  setDraft((list) => move(list, index, by))
                }}
                onShow={(shown) => update(widget.type, { hidden: !shown })}
                onOpen={() => setEditing(widget.type)}
              />
            ))}
          </ul>
        </Card>
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
  first,
  last,
  onMove,
  onShow,
  onOpen,
}: {
  widget: DashboardWidgetDto
  first: boolean
  last: boolean
  onMove: (by: -1 | 1) => void
  onShow: (shown: boolean) => void
  onOpen: () => void
}) {
  const { name } = ELEMENTS[widget.type]
  return (
    <li className="flex min-h-[3.2rem] items-center gap-1.5 px-1">
      <span className="flex flex-col">
        <MoveButton
          label={`Monter ${name}`}
          disabled={first}
          onClick={() => onMove(-1)}
        >
          <ArrowUpIcon />
        </MoveButton>
        <MoveButton
          label={`Descendre ${name}`}
          disabled={last}
          onClick={() => onMove(1)}
        >
          <ArrowDownIcon />
        </MoveButton>
      </span>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Réglages de ${name}`}
        className={cn(
          'hover:bg-muted/50 focus-visible:ring-ring flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-1.5 py-1.5 text-left outline-none focus-visible:ring-2',
          widget.hidden && 'opacity-45',
        )}
      >
        <ElementBadge type={widget.type} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <ChosenAccounts ids={widget.accountIds} />
        </span>
      </button>
      <Switch
        aria-label={`Afficher ${name}`}
        checked={!widget.hidden}
        onCheckedChange={onShow}
      />
    </li>
  )
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring grid h-[1.6rem] w-[2rem] place-items-center rounded-md outline-none focus-visible:ring-2 disabled:opacity-25 [&_svg]:size-[18px]"
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
  const { data } = useQuery(envelopeSummariesQuery)
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
