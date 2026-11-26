import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, Card, Switch, cn } from '@capi/ui'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  RotateCcwIcon,
  Settings2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { OptionsSheet } from './options'
import {
  ACCOUNT,
  Badge,
  CATALOGUE,
  Dashboard,
  ElementView,
  Frame,
  MY_LAYOUT,
  WIDTH_ARG,
  euros,
  missing,
  type ElementType,
  type Placed,
  type Width,
} from './shared'

/**
 * #495, how the owner sets his dashboard. Three directions, clickable
 * mockups with synthetic data, not app code:
 *
 * A. Sur place: « ⋮ → Personnaliser » turns the dashboard itself into the
 *    editor; each card gets ↑ ↓ 👁 ⚙ above it, « + » at the end.
 * B. Une liste: a « Tableau de bord » screen (from ⋮ or Réglages), one row
 *    per element: ↑ ↓, icon, the accounts it shows as icons, a switch.
 * C. Un catalogue: every element as a tile; tap to show it, its number is
 *    its place; ⚙ on a tile moves it and sets it.
 */
const meta: Meta<Args> = {
  title: 'Prototypes/Tableau de bord (#495)',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
  argTypes: { width: WIDTH_ARG },
  args: { width: 390 },
}

export default meta

interface Args {
  width: Width
  /** Open an element's options sheet. */
  options?: ElementType
}

type Story = StoryObj<Args>

function move(layout: Placed[], index: number, by: -1 | 1): Placed[] {
  const next = [...layout]
  const target = index + by
  if (target < 0 || target >= next.length) return layout
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function IconButton({
  label,
  children,
  onClick,
  disabled,
  active,
}: {
  label: string
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-[2rem] place-items-center rounded-full [&_svg]:size-[18px]',
        active ? 'bg-primary text-primary-foreground' : 'bg-muted',
        disabled && 'opacity-30',
      )}
    >
      {children}
    </button>
  )
}

/** The accounts an element shows, as their icons. */
function AccountIcons({ ids }: { ids?: string[] }) {
  if (!ids) return null
  return (
    <span className="flex gap-1">
      {ids.map((id) => (
        <span key={id} title={ACCOUNT[id].name}>
          <Badge icon={ACCOUNT[id].icon} tone={ACCOUNT[id].tone} size={20} />
        </span>
      ))}
    </span>
  )
}

/* ---------------------------------------------------------------------------
 * A. Sur place
 * ------------------------------------------------------------------------- */

function OnTheSpot({ width, options }: Args) {
  const [layout, setLayout] = useState(MY_LAYOUT)
  const [open, setOpen] = useState<ElementType | undefined>(options)
  const computer = width >= 768
  const element = layout.find((item) => item.type === open)
  return (
    <Frame
      width={width}
      actions={
        computer ? (
          <span className="flex gap-2">
            <Button outline variant="secondary">
              <RotateCcwIcon aria-hidden />
            </Button>
            <Button>
              <CheckIcon aria-hidden /> Terminé
            </Button>
          </span>
        ) : undefined
      }
      description={null}
      bottom={
        computer ? undefined : (
          <div className="bg-background/95 absolute inset-x-0 bottom-0 z-10 flex gap-2 border-t px-3 py-2 backdrop-blur">
            <Button
              outline
              variant="secondary"
              aria-label="Rétablir par défaut"
            >
              <RotateCcwIcon aria-hidden />
            </Button>
            <Button className="flex-1">
              <CheckIcon aria-hidden /> Terminé
            </Button>
          </div>
        )
      }
      height={options ? 844 : undefined}
      overlay={element && <OptionsSheet width={width} element={element} />}
    >
      <div
        className={cn(
          'grid grid-cols-[minmax(0,1fr)] items-start gap-3',
          computer && 'grid-cols-2',
        )}
      >
        {layout.map((item, index) => {
          const info = CATALOGUE[item.type]
          return (
            <div
              key={item.type}
              className={cn(
                'border-primary/40 rounded-[1.1rem] border-2 border-dashed p-1.5',
                item.hidden && 'border-muted-foreground/30',
                computer && item.size === 'large' && 'col-span-2',
              )}
            >
              <div className="flex items-center gap-1.5 pb-1.5 pl-1">
                <button
                  type="button"
                  onClick={() => setOpen(item.type)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <Badge icon={info.icon} tone={info.tone} size={24} />
                  <span
                    className={cn(
                      'min-w-0 truncate text-sm font-medium',
                      item.hidden && 'text-muted-foreground line-through',
                    )}
                  >
                    {info.name}
                  </span>
                  <Settings2Icon
                    aria-label="Réglages"
                    className="text-primary size-4 shrink-0"
                  />
                </button>
                <IconButton
                  label="Monter"
                  disabled={index === 0}
                  onClick={() => setLayout(move(layout, index, -1))}
                >
                  <ArrowUpIcon />
                </IconButton>
                <IconButton
                  label="Descendre"
                  disabled={index === layout.length - 1}
                  onClick={() => setLayout(move(layout, index, 1))}
                >
                  <ArrowDownIcon />
                </IconButton>
                <IconButton
                  label={item.hidden ? 'Afficher' : 'Masquer'}
                  onClick={() =>
                    setLayout(
                      layout.map((other) =>
                        other === item
                          ? { ...other, hidden: !other.hidden }
                          : other,
                      ),
                    )
                  }
                >
                  {item.hidden ? <EyeOffIcon /> : <EyeIcon />}
                </IconButton>
              </div>
              {!item.hidden && (
                <div className="pointer-events-none relative max-h-[7.5rem] overflow-hidden">
                  <ElementView element={item} />
                  <span className="from-background absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t to-transparent" />
                </div>
              )}
            </div>
          )
        })}
        <button
          type="button"
          className={cn(
            'text-primary flex min-h-14 items-center justify-center gap-2 rounded-[1.1rem] border-2 border-dashed text-sm font-medium',
            computer && 'col-span-2',
          )}
        >
          <PlusIcon className="size-5" aria-hidden /> Ajouter
        </button>
        {!computer && <div className="h-14" />}
      </div>
    </Frame>
  )
}

export const A_SurPlace: Story = {
  name: 'A. Sur place',
  render: (args) => <OnTheSpot {...args} />,
}

export const A_Reglages: Story = {
  name: 'A. Sur place · réglages',
  args: { options: 'balances' },
  render: (args) => <OnTheSpot {...args} />,
}

/* ---------------------------------------------------------------------------
 * B. Une liste
 * ------------------------------------------------------------------------- */

function List({ width, options }: Args) {
  const [layout, setLayout] = useState(MY_LAYOUT)
  const [open, setOpen] = useState<ElementType | undefined>(options)
  const element = layout.find((item) => item.type === open)
  const computer = width >= 768
  return (
    <Frame
      width={width}
      back="Tableau de bord"
      title="Personnaliser"
      description={null}
      height={options ? 844 : undefined}
      overlay={element && <OptionsSheet width={width} element={element} />}
    >
      <div className={cn('space-y-3', computer && 'max-w-lg')}>
        <Card className="gap-0 px-1 py-1">
          <ul className="divide-y">
            {layout.map((item, index) => {
              const info = CATALOGUE[item.type]
              return (
                <li
                  key={item.type}
                  className="flex min-h-14 items-center gap-2 px-1.5"
                >
                  <span className="flex flex-col">
                    <button
                      type="button"
                      aria-label="Monter"
                      disabled={index === 0}
                      onClick={() => setLayout(move(layout, index, -1))}
                      className="text-muted-foreground grid h-[1.1rem] w-8 place-items-center disabled:opacity-25"
                    >
                      <ArrowUpIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Descendre"
                      disabled={index === layout.length - 1}
                      onClick={() => setLayout(move(layout, index, 1))}
                      className="text-muted-foreground grid h-[1.1rem] w-8 place-items-center disabled:opacity-25"
                    >
                      <ArrowDownIcon className="size-4" />
                    </button>
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(item.type)}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-3 py-2 text-left',
                      item.hidden && 'opacity-45',
                    )}
                  >
                    <Badge icon={info.icon} tone={info.tone} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {info.name}
                      </span>
                      {item.accounts && (
                        <span className="mt-0.5 block">
                          <AccountIcons ids={item.accounts} />
                        </span>
                      )}
                    </span>
                  </button>
                  <Switch
                    aria-label={`Afficher ${info.name}`}
                    checked={!item.hidden}
                    onCheckedChange={(checked) =>
                      setLayout(
                        layout.map((other) =>
                          other === item
                            ? { ...other, hidden: !checked }
                            : other,
                        ),
                      )
                    }
                  />
                </li>
              )
            })}
          </ul>
        </Card>
        <p className="text-muted-foreground px-1 pt-1 text-xs">Ajouter</p>
        <Card className="gap-0 px-1 py-1">
          <ul className="divide-y">
            {missing(layout).map((info) => (
              <li
                key={info.type}
                className="flex min-h-12 items-center gap-3 px-3"
              >
                <Badge icon={info.icon} tone={info.tone} />
                <span className="flex-1 text-sm font-medium">{info.name}</span>
                <span className="bg-primary/10 text-primary grid size-8 place-items-center rounded-full">
                  <PlusIcon className="size-4" aria-label="Ajouter" />
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <button
          type="button"
          className="text-muted-foreground mx-auto flex min-h-11 items-center gap-2 text-sm"
        >
          <RotateCcwIcon className="size-4" aria-hidden /> Par défaut
        </button>
      </div>
    </Frame>
  )
}

export const B_Liste: Story = {
  name: 'B. Une liste',
  render: (args) => <List {...args} />,
}

export const B_Reglages: Story = {
  name: 'B. Une liste · réglages',
  args: { options: 'upcoming' },
  render: (args) => <List {...args} />,
}

/* ---------------------------------------------------------------------------
 * C. Un catalogue
 * ------------------------------------------------------------------------- */

/** A tile's tiny preview: the element's figure in a few pixels. */
function Preview({ type }: { type: ElementType }) {
  switch (type) {
    case 'left':
      return (
        <span className="block space-y-1">
          <span className="block text-base font-semibold tabular-nums">
            {euros(52_400)}
          </span>
          <span className="bg-muted block h-1.5 rounded-full">
            <span className="bg-primary block h-1.5 w-3/4 rounded-full" />
          </span>
        </span>
      )
    case 'balances':
      return (
        <span className="flex gap-1">
          {['courant', 'livret', 'tickets'].map((id) => (
            <Badge
              key={id}
              icon={ACCOUNT[id].icon}
              tone={ACCOUNT[id].tone}
              size={20}
            />
          ))}
        </span>
      )
    case 'owed':
      return (
        <span className="flex gap-1 text-xs font-semibold tabular-nums">
          <span className="bg-chart-delta-good/15 text-chart-delta-good rounded px-1">
            +{euros(6_050)}
          </span>
          <span className="bg-warning/20 text-warning-foreground dark:text-warning rounded px-1">
            −{euros(3_000)}
          </span>
        </span>
      )
    case 'upcoming':
      return (
        <span className="flex gap-1">
          {['28', '1', '3'].map((day) => (
            <span
              key={day}
              className="bg-info/15 text-info-foreground dark:text-info grid size-5 place-items-center rounded text-[0.5rem] font-bold"
            >
              {day}
            </span>
          ))}
        </span>
      )
    case 'forecast':
      return (
        <span className="text-sm font-semibold tabular-nums">
          {euros(161_800)}
        </span>
      )
    case 'netWorth':
      return (
        <span className="text-sm font-semibold tabular-nums">
          {euros(5_091_100)}
        </span>
      )
    case 'tracked':
      return (
        <span className="block space-y-1">
          <span className="bg-muted block h-1.5 rounded-full">
            <span className="bg-primary block h-1.5 w-2/3 rounded-full" />
          </span>
          <span className="bg-muted block h-1.5 rounded-full">
            <span className="bg-chart-warning block h-1.5 w-11/12 rounded-full" />
          </span>
        </span>
      )
    case 'todo':
      return (
        <span className="bg-warning/20 text-warning-foreground dark:text-warning rounded px-1 text-xs font-semibold">
          2
        </span>
      )
    default:
      return <span className="bg-muted block h-3 w-2/3 rounded" />
  }
}

function Catalogue({ width, options }: Args) {
  const [layout, setLayout] = useState(MY_LAYOUT)
  const [open, setOpen] = useState<ElementType | undefined>(options)
  const element = layout.find((item) => item.type === open)
  const computer = width >= 768
  const shown = layout.filter((item) => !item.hidden).map((item) => item.type)
  const all = [
    ...layout.map((item) => CATALOGUE[item.type]),
    ...missing(layout),
  ]
  return (
    <Frame
      width={width}
      back="Tableau de bord"
      title="Personnaliser"
      description={null}
      height={options ? 844 : undefined}
      overlay={element && <OptionsSheet width={width} element={element} />}
    >
      <div
        className={cn('grid gap-2', computer ? 'grid-cols-4' : 'grid-cols-2')}
      >
        {all.map((info) => {
          const place = shown.indexOf(info.type)
          const on = place >= 0
          return (
            <div
              key={info.type}
              onClick={() =>
                setLayout((current) =>
                  current.some((item) => item.type === info.type)
                    ? current.map((item) =>
                        item.type === info.type
                          ? { ...item, hidden: !item.hidden }
                          : item,
                      )
                    : [...current, { type: info.type, size: 'small' }],
                )
              }
              className={cn(
                'relative flex min-h-[5.5rem] flex-col gap-2 rounded-2xl border-2 p-2.5',
                on ? 'border-primary bg-primary/5' : 'border-border opacity-60',
              )}
            >
              <span className="flex items-center gap-2">
                <Badge icon={info.icon} tone={info.tone} size={26} />
                <span
                  className={cn(
                    'ml-auto grid size-6 place-items-center rounded-full text-xs font-bold',
                    on
                      ? 'bg-primary text-primary-foreground'
                      : 'border-muted-foreground/40 border-2',
                  )}
                >
                  {on ? place + 1 : ''}
                </span>
              </span>
              <span className="text-sm leading-tight font-medium">
                {info.name}
              </span>
              <span className="mt-auto pr-8">
                <Preview type={info.type} />
              </span>
              {on && (
                <button
                  type="button"
                  aria-label="Réglages"
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpen(info.type)
                  }}
                  className="bg-muted absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full"
                >
                  <Settings2Icon className="size-3.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="text-muted-foreground mx-auto flex min-h-11 items-center gap-2 text-sm"
      >
        <RotateCcwIcon className="size-4" aria-hidden /> Par défaut
      </button>
    </Frame>
  )
}

export const C_Catalogue: Story = {
  name: 'C. Un catalogue',
  render: (args) => <Catalogue {...args} />,
}

export const C_Reglages: Story = {
  name: 'C. Un catalogue · réglages',
  args: { options: 'balances' },
  render: (args) => <Catalogue {...args} />,
}

/* ---------------------------------------------------------------------------
 * The result, whatever the direction
 * ------------------------------------------------------------------------- */

export const Resultat: Story = {
  name: 'Résultat',
  render: ({ width }) => (
    <Frame width={width}>
      <Dashboard layout={MY_LAYOUT} width={width} />
    </Frame>
  ),
}

export const ParDefaut: Story = {
  name: 'Par défaut (aujourd’hui)',
  render: ({ width }) => (
    <Frame width={width}>
      <Dashboard
        layout={[
          { type: 'todo', size: 'large' },
          { type: 'left', size: 'large' },
          { type: 'forecast', size: 'small' },
          { type: 'netWorth', size: 'small' },
          { type: 'tracked', size: 'large' },
        ]}
        width={width}
      />
    </Frame>
  ),
}
