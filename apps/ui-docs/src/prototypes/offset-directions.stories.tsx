import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckIcon,
  RotateCcwIcon,
  XIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { Button, Card, CardContent, Switch, cn } from '@capi/ui'

/**
 * Prototypes for #484: three ways to show « Compenser » with as little text
 * as possible, for the owner to choose. Synthetic figures: Sam owes 10 €,
 * the owner owes Sam 30 €. Deleted by the PR that builds the chosen one.
 */
const meta = {
  title: 'Prototypes/#484 Compenser',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const IN = 'text-emerald-700 dark:text-emerald-400'
const IN_BG = 'bg-emerald-100 dark:bg-emerald-950'
const OUT = 'text-orange-700 dark:text-orange-400'
const OUT_BG = 'bg-orange-100 dark:bg-orange-950'

function Phone({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-background flex w-[390px] flex-col gap-3 p-4">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
      </p>
      {children}
    </div>
  )
}

function Avatar({
  name,
  size = 'md',
  auto = false,
}: {
  name: string
  size?: 'sm' | 'md' | 'lg'
  auto?: boolean
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full font-semibold text-white',
          name === 'Moi' ? 'bg-primary' : 'bg-rose-500',
          size === 'sm' && 'size-8 text-xs',
          size === 'md' && 'size-11 text-sm',
          size === 'lg' && 'size-16 text-lg',
        )}
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
      {auto && (
        <span className="bg-primary text-primary-foreground ring-background absolute -right-1 -bottom-1 inline-flex size-5 items-center justify-center rounded-full ring-2">
          <ArrowLeftRightIcon className="size-3" />
        </span>
      )}
    </span>
  )
}

function Amount({
  cents,
  dir,
  big = false,
}: {
  cents: number
  dir: 'in' | 'out'
  big?: boolean
}) {
  const Icon = dir === 'in' ? ArrowDownLeftIcon : ArrowUpRightIcon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap tabular-nums',
        dir === 'in' ? `${IN} ${IN_BG}` : `${OUT} ${OUT_BG}`,
        big ? 'px-3 py-1.5 text-lg' : 'px-2 py-0.5 text-sm',
      )}
    >
      <Icon className={big ? 'size-5' : 'size-4'} />
      {cents / 100} €
    </span>
  )
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <ArrowLeftRightIcon className="text-muted-foreground size-4" />
      <span className="flex-1">Toujours compenser</span>
      <Switch checked={on} />
    </div>
  )
}

function Done() {
  return (
    <div className="flex items-center gap-2 text-sm">
      <CheckIcon className={cn('size-4', IN)} />
      <span className="flex-1 tabular-nums">10 € compensés</span>
      <Button
        size="sm"
        ghost
        variant="secondary"
        iconOnly
        aria-label="Annuler"
        iconStart={<RotateCcwIcon />}
      />
    </div>
  )
}

// --- A. Les pastilles ------------------------------------------------------

function ChipsOffer() {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar name="Sam" />
          <div className="flex flex-1 items-center gap-1.5">
            <Amount cents={1000} dir="in" />
            <ArrowLeftRightIcon className="text-muted-foreground size-4" />
            <Amount cents={3000} dir="out" />
          </div>
          <Button
            size="sm"
            ghost
            variant="secondary"
            iconOnly
            aria-label="Ignorer"
            iconStart={<XIcon />}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button className="flex-1" iconStart={<ArrowLeftRightIcon />}>
            Compenser
          </Button>
          <ArrowRightIcon className="text-muted-foreground size-4" />
          <Amount cents={2000} dir="out" />
        </div>
      </CardContent>
    </Card>
  )
}

export const A_Pastilles: Story = {
  name: 'A. Les pastilles',
  render: () => (
    <div className="flex flex-wrap gap-6">
      <Phone title="Dans la liste">
        <ChipsOffer />
      </Phone>
      <Phone title="Page de Sam">
        <Card size="sm">
          <CardContent className="flex flex-col items-center gap-3 py-2">
            <Avatar name="Sam" size="lg" />
            <Amount cents={2000} dir="out" big />
            <div className="flex items-center gap-2">
              <Amount cents={1000} dir="in" />
              <ArrowLeftRightIcon className="text-muted-foreground size-4" />
              <Amount cents={3000} dir="out" />
            </div>
            <Button className="w-full" iconStart={<ArrowLeftRightIcon />}>
              Compenser
            </Button>
          </CardContent>
        </Card>
      </Phone>
      <Phone title="Toujours compenser">
        <Card size="sm">
          <CardContent className="flex flex-col items-center gap-3 py-2">
            <Avatar name="Sam" size="lg" auto />
            <Amount cents={2000} dir="out" big />
            <div className="w-full space-y-2 border-t pt-2">
              <Toggle on />
              <Done />
            </div>
          </CardContent>
        </Card>
      </Phone>
    </div>
  ),
}

// --- B. Les flèches entre vous deux -----------------------------------------

/** Moi ⇆ Sam with one arrow per direction, each with its amount. */
function Arrows({ owed, owe }: { owed: number; owe: number }) {
  const row = (dir: 'in' | 'out', cents: number) => (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'h-1 flex-1 rounded-full',
          dir === 'in' ? 'bg-emerald-500' : 'bg-orange-500',
          cents === 0 && 'opacity-20',
        )}
      />
      <span
        className={cn(
          'inline-flex items-center gap-1 text-sm font-semibold tabular-nums',
          dir === 'in' ? IN : OUT,
          cents === 0 && 'opacity-30',
        )}
      >
        {dir === 'in' && (
          <ArrowDownLeftIcon className="size-4 -scale-x-100 rotate-45" />
        )}
        {cents / 100} €{dir === 'out' && <ArrowRightIcon className="size-4" />}
      </span>
      <div
        className={cn(
          'h-1 flex-1 rounded-full',
          dir === 'in' ? 'bg-emerald-500' : 'bg-orange-500',
          cents === 0 && 'opacity-20',
        )}
      />
    </div>
  )
  return (
    <div className="flex items-center gap-2">
      <Avatar name="Moi" />
      <div className="flex flex-1 flex-col gap-2">
        {row('in', owed)}
        {row('out', owe)}
      </div>
      <Avatar name="Sam" />
    </div>
  )
}

export const B_Fleches: Story = {
  name: 'B. Les flèches entre vous deux',
  render: () => (
    <div className="flex flex-wrap gap-6">
      <Phone title="Dans la liste">
        <Card size="sm">
          <CardContent className="flex flex-col gap-3">
            <Arrows owed={1000} owe={3000} />
            <div className="flex items-center gap-2">
              <Button className="flex-1" iconStart={<ArrowLeftRightIcon />}>
                Compenser
              </Button>
              <Button
                variant="secondary"
                iconOnly
                aria-label="Ignorer"
                iconStart={<XIcon />}
              />
            </div>
          </CardContent>
        </Card>
      </Phone>
      <Phone title="Avant → après">
        <Card size="sm">
          <CardContent className="flex flex-col gap-3">
            <Arrows owed={1000} owe={3000} />
            <div className="text-muted-foreground flex justify-center">
              <ArrowLeftRightIcon className="size-5 rotate-90" />
            </div>
            <Arrows owed={0} owe={2000} />
          </CardContent>
        </Card>
      </Phone>
      <Phone title="Toujours compenser">
        <Card size="sm">
          <CardContent className="flex flex-col gap-3">
            <Arrows owed={0} owe={2000} />
            <div className="space-y-2 border-t pt-2">
              <Toggle on />
              <Done />
            </div>
          </CardContent>
        </Card>
      </Phone>
    </div>
  ),
}

// --- C. La balance -----------------------------------------------------------

/**
 * One line from Moi to Sam, the point on the side of who owes: on Sam's side
 * when the owner owes Sam. The two debts below, the part that cancels hatched.
 */
function Balance({ net, max = 3000 }: { net: number; max?: number }) {
  // net > 0: Sam owes the owner (point towards Moi).
  const position = 50 - (net / max) * 45
  return (
    <div className="flex items-center gap-2">
      <Avatar name="Moi" size="sm" />
      <div className="relative h-8 flex-1">
        <div className="bg-muted absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" />
        <div className="bg-border absolute top-1/2 left-1/2 h-4 w-0.5 -translate-1/2" />
        <div
          className={cn(
            'absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full',
            net >= 0 ? 'bg-emerald-500' : 'bg-orange-500',
          )}
          style={
            net >= 0
              ? { left: `${position}%`, right: '50%' }
              : { left: '50%', right: `${100 - position}%` }
          }
        />
        <span
          className={cn(
            'ring-background absolute top-1/2 size-4 -translate-1/2 rounded-full ring-2',
            net >= 0 ? 'bg-emerald-500' : 'bg-orange-500',
          )}
          style={{ left: `${position}%` }}
        />
      </div>
      <Avatar name="Sam" size="sm" />
    </div>
  )
}

function Cancels() {
  return (
    <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
      <div className="w-1/4 bg-[repeating-linear-gradient(45deg,var(--color-emerald-500)_0_4px,transparent_4px_8px)]" />
      <div className="w-1/4 bg-[repeating-linear-gradient(45deg,var(--color-orange-500)_0_4px,transparent_4px_8px)]" />
      <div className="flex-1 bg-orange-500" />
    </div>
  )
}

export const C_Balance: Story = {
  name: 'C. La balance',
  render: () => (
    <div className="flex flex-wrap gap-6">
      <Phone title="Dans la liste">
        <Card size="sm">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Amount cents={1000} dir="in" />
              <Amount cents={3000} dir="out" />
            </div>
            <Cancels />
            <div className="flex items-center gap-2">
              <Button className="flex-1" iconStart={<ArrowLeftRightIcon />}>
                Compenser
              </Button>
              <ArrowRightIcon className="text-muted-foreground size-4" />
              <Amount cents={2000} dir="out" />
            </div>
          </CardContent>
        </Card>
      </Phone>
      <Phone title="Page de Sam">
        <Card size="sm">
          <CardContent className="flex flex-col gap-3">
            <Balance net={-2000} />
            <p
              className={cn(
                'text-center text-2xl font-semibold tabular-nums',
                OUT,
              )}
            >
              20 €
            </p>
            <div className="flex justify-center gap-2">
              <Amount cents={1000} dir="in" />
              <Amount cents={3000} dir="out" />
            </div>
          </CardContent>
        </Card>
      </Phone>
      <Phone title="Toujours compenser">
        <Card size="sm">
          <CardContent className="flex flex-col gap-3">
            <Balance net={-2000} />
            <p
              className={cn(
                'text-center text-2xl font-semibold tabular-nums',
                OUT,
              )}
            >
              20 €
            </p>
            <div className="space-y-2 border-t pt-2">
              <Toggle on />
              <Done />
            </div>
          </CardContent>
        </Card>
      </Phone>
    </div>
  ),
}
