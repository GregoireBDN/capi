import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, Input, ToggleGroup, ToggleGroupItem, cn } from '@finances/ui'
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DeleteIcon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

/**
 * Prototypes of the quick expense entry redesign (#245): the three
 * directions shown to the owner before one is built in `apps/web`. They are
 * clickable mockups with synthetic data, not app code: nothing is saved.
 *
 * 1. Built-in keypad, no system keyboard.
 * 2. Two steps: the amount docked on the system keyboard, then the details.
 * 3. Usuals first: pick a usual expense, then type its amount.
 */
const meta: Meta = {
  title: 'Prototypes/Quick entry (#245)',
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile' },
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

/* ---------------------------------------------------------------------------
 * Synthetic data
 * ------------------------------------------------------------------------- */

const CATEGORIES = [
  { id: 'groceries', name: 'Courses', color: '#22c55e' },
  { id: 'restaurants', name: 'Restaurants', color: '#f97316' },
  { id: 'transport', name: 'Transports', color: '#3b82f6' },
  { id: 'outings', name: 'Sorties', color: '#a855f7' },
  { id: 'health', name: 'Santé', color: '#ef4444' },
  { id: 'home', name: 'Maison', color: '#eab308' },
  { id: 'clothes', name: 'Vêtements', color: '#ec4899' },
  { id: 'gifts', name: 'Cadeaux', color: '#14b8a6' },
]

const USUALS = [
  { label: 'Boulangerie test', categoryId: 'groceries', last: '4,20' },
  { label: 'Café test', categoryId: 'restaurants', last: '3,50' },
  { label: 'Métro test', categoryId: 'transport', last: '2,15' },
  { label: 'Cinéma test', categoryId: 'outings', last: '11,90' },
  { label: 'Marché test', categoryId: 'groceries', last: '18,00' },
  { label: 'Pharmacie test', categoryId: 'health', last: '7,80' },
]

const category = (id: string) => CATEGORIES.find((item) => item.id === id)!

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------- */

/** A dimmed page with a bottom sheet over it, like the app on a phone. */
function PhoneSheet({
  children,
  full = false,
}: {
  children: ReactNode
  full?: boolean
}) {
  return (
    <div className="bg-background relative flex h-svh flex-col justify-end overflow-hidden">
      <div
        aria-hidden
        className="text-muted-foreground absolute inset-x-0 top-0 space-y-2 p-4 text-sm"
      >
        <div className="bg-muted h-6 w-1/2 rounded" />
        <div className="bg-muted h-20 rounded" />
        <div className="bg-muted h-20 rounded" />
      </div>
      <div aria-hidden className="absolute inset-0 bg-black/20" />
      <div
        role="dialog"
        aria-label="Prototype"
        className={cn(
          'bg-popover text-popover-foreground relative flex flex-col rounded-t-xl border-t shadow-lg',
          full ? 'h-[calc(100svh-0.5rem)]' : 'max-h-[90svh]',
        )}
      >
        {children}
      </div>
    </div>
  )
}

const CHIP = cn(
  'border-input inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3',
  'text-sm font-medium whitespace-nowrap transition-colors',
  'data-[on=true]:border-primary data-[on=true]:bg-primary/10 data-[on=true]:text-primary',
)

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  )
}

function KindToggle({
  value,
  onChange,
}: {
  value: string
  onChange: (kind: string) => void
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label="Type"
      value={value}
      onValueChange={(next) => next && onChange(next)}
    >
      <ToggleGroupItem value="expense">Dépense</ToggleGroupItem>
      <ToggleGroupItem value="income">Revenu</ToggleGroupItem>
      <ToggleGroupItem value="transfer">Virement</ToggleGroupItem>
    </ToggleGroup>
  )
}

function DateRow() {
  const [day, setDay] = useState('today')
  return (
    <div role="radiogroup" aria-label="Jour" className="flex flex-wrap gap-1.5">
      {[
        ['today', 'Aujourd’hui'],
        ['yesterday', 'Hier'],
      ].map(([value, text]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={day === value}
          data-on={day === value}
          className={CHIP}
          onClick={() => setDay(value)}
        >
          {text}
        </button>
      ))}
      <button type="button" className={CHIP}>
        <CalendarIcon aria-hidden className="size-4" />
        Autre
      </button>
    </div>
  )
}

/** Appends a key to an amount typed on a keypad: "12,5" + "0" → "12,50". */
function pressKey(amount: string, key: string): string {
  if (key === 'back') return amount.slice(0, -1)
  if (key === ',') return amount.includes(',') ? amount : `${amount || '0'},`
  const [, decimals] = amount.split(',')
  if (decimals !== undefined && decimals.length >= 2) return amount
  if (amount === '0') return key
  return amount.length >= 9 ? amount : amount + key
}

function AmountDisplay({
  amount,
  sign = '−',
  caption,
}: {
  amount: string
  sign?: string
  caption?: ReactNode
}) {
  return (
    <div className="px-4 py-2 text-center">
      <p
        aria-label="Montant"
        className={cn(
          'text-[2rem] leading-tight font-semibold tabular-nums',
          amount === '' && 'text-muted-foreground',
        )}
      >
        {sign} {amount || '0'} €
      </p>
      {caption && (
        <p className="text-muted-foreground truncate text-sm">{caption}</p>
      )}
    </div>
  )
}

/** A stand-in for the iOS decimal keyboard and its accessory bar. */
function FakeIosKeyboard({ onKey }: { onKey: (key: string) => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back']
  return (
    <div
      aria-label="Clavier iOS (simulé)"
      className="bg-[#d1d3d9] dark:bg-[#2b2b2d]"
    >
      <div className="flex h-11 items-center justify-end gap-4 px-3 text-sm">
        <span className="rounded-full bg-white/70 px-3 py-1 dark:bg-white/15">
          ⌃ ⌄
        </span>
        <span className="rounded-full bg-white/70 px-3 py-1 dark:bg-white/15">
          ✓
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 px-1.5 pb-8">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            className={cn(
              'h-[2.4rem] rounded-md text-xl text-black dark:text-white',
              key === 'back' || key === ','
                ? 'bg-transparent'
                : 'bg-white shadow-sm dark:bg-[#6b6b6e]',
            )}
            onClick={() => onKey(key)}
          >
            {key === 'back' ? (
              <DeleteIcon aria-label="Effacer" className="mx-auto size-6" />
            ) : (
              key
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Option 1: built-in keypad
 * ------------------------------------------------------------------------- */

function KeypadPrototype({
  initialAmount = '12,5',
}: {
  initialAmount?: string
}) {
  const [kind, setKind] = useState('expense')
  const [amount, setAmount] = useState(initialAmount)
  const [usual, setUsual] = useState<string | null>('Boulangerie test')
  const [categoryId, setCategoryId] = useState('groceries')
  const [allCategories, setAllCategories] = useState(false)
  const shown = allCategories ? CATEGORIES : CATEGORIES.slice(0, 5)
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back']
  return (
    <PhoneSheet>
      <div className="flex items-center gap-2 px-3 pt-3">
        <KindToggle value={kind} onChange={setKind} />
        <Button
          ghost
          iconOnly
          size="sm"
          className="ml-auto"
          aria-label="Fermer"
        >
          <XIcon />
        </Button>
      </div>
      <AmountDisplay
        amount={amount}
        sign={kind === 'income' ? '+' : '−'}
        caption={[usual, category(categoryId).name, 'Aujourd’hui']
          .filter(Boolean)
          .join(' · ')}
      />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto border-t px-4 py-3">
        <section aria-label="Habituels" className="space-y-1.5">
          <h3 className="text-muted-foreground text-xs font-medium uppercase">
            Habituels
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {USUALS.slice(0, 4).map((item) => (
              <button
                key={item.label}
                type="button"
                data-on={usual === item.label}
                className="border-input data-[on=true]:border-primary data-[on=true]:bg-primary/10 flex min-h-11 min-w-0 flex-col items-start justify-center rounded-lg border px-2.5 py-1 text-left"
                onClick={() => {
                  setUsual(item.label)
                  setCategoryId(item.categoryId)
                }}
              >
                <span className="w-full truncate text-sm font-medium">
                  {item.label}
                </span>
                <span className="text-muted-foreground flex w-full items-center gap-1 truncate text-xs">
                  <Dot color={category(item.categoryId).color} />
                  {category(item.categoryId).name}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section aria-label="Catégorie" className="space-y-1.5">
          <h3 className="text-muted-foreground text-xs font-medium uppercase">
            Catégorie
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((item) => (
              <button
                key={item.id}
                type="button"
                data-on={categoryId === item.id}
                className={CHIP}
                onClick={() => setCategoryId(item.id)}
              >
                <Dot color={item.color} />
                {item.name}
              </button>
            ))}
            {!allCategories && (
              <button
                type="button"
                className={CHIP}
                onClick={() => setAllCategories(true)}
              >
                Toutes…
              </button>
            )}
          </div>
        </section>
        <DateRow />
        <button
          type="button"
          className="text-muted-foreground flex min-h-11 items-center gap-1.5 text-sm"
        >
          <PencilIcon aria-hidden className="size-4" />
          Ajouter un libellé · Plus d’options
        </button>
      </div>
      <div className="bg-muted/50 grid grid-cols-4 gap-1.5 border-t p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {keys.map((key, index) => (
          <button
            key={key}
            type="button"
            style={{
              gridColumn: (index % 3) + 1,
              gridRow: Math.floor(index / 3) + 1,
            }}
            className="bg-background h-[2.2rem] rounded-lg text-xl font-medium shadow-xs active:bg-muted"
            onClick={() => setAmount((current) => pressKey(current, key))}
          >
            {key === 'back' ? (
              <DeleteIcon aria-label="Effacer" className="mx-auto size-6" />
            ) : (
              key
            )}
          </button>
        ))}
        <button
          type="button"
          style={{ gridColumn: 4, gridRow: '1 / span 4' }}
          className="bg-primary text-primary-foreground flex flex-col items-center justify-center gap-1 rounded-lg font-semibold"
        >
          <CheckIcon aria-hidden className="size-7" />
          Ajouter
        </button>
      </div>
    </PhoneSheet>
  )
}

export const Option1Keypad: StoryObj = {
  name: '1 · Built-in keypad',
  render: () => <KeypadPrototype />,
}

/* ---------------------------------------------------------------------------
 * Option 2: two steps
 * ------------------------------------------------------------------------- */

function TwoStepPrototype({ initialStep }: { initialStep: 1 | 2 }) {
  const [step, setStep] = useState(initialStep)
  const [amount, setAmount] = useState('12,5')
  const [categoryId, setCategoryId] = useState('groceries')
  if (step === 1) {
    return (
      <PhoneSheet full>
        <div className="flex items-center gap-2 px-3 pt-3">
          <h2 className="text-base font-semibold">Ajouter une dépense</h2>
          <Button
            ghost
            iconOnly
            size="sm"
            className="ml-auto"
            aria-label="Fermer"
          >
            <XIcon />
          </Button>
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <AmountDisplay amount={amount} caption="Étape 1 sur 2 · le montant" />
        </div>
        {/* Docked right on the keyboard: no gap. */}
        <div className="flex gap-2 border-t px-3 py-2">
          <Button
            className="h-8 flex-1"
            disabled={amount === ''}
            onClick={() => setStep(2)}
          >
            Suivant
            <ChevronRightIcon />
          </Button>
        </div>
        <FakeIosKeyboard
          onKey={(key) => setAmount((current) => pressKey(current, key))}
        />
      </PhoneSheet>
    )
  }
  return (
    <PhoneSheet>
      <div className="flex items-center gap-2 px-3 pt-3">
        <Button ghost size="sm" onClick={() => setStep(1)}>
          <ChevronLeftIcon />− {amount} €
        </Button>
        <span className="text-muted-foreground text-sm">Étape 2 sur 2</span>
        <Button
          ghost
          iconOnly
          size="sm"
          className="ml-auto"
          aria-label="Fermer"
        >
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <section className="space-y-1.5">
          <h3 className="text-muted-foreground text-xs font-medium uppercase">
            Habituels
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {USUALS.slice(0, 4).map((item) => (
              <button
                key={item.label}
                type="button"
                className={CHIP}
                onClick={() => setCategoryId(item.categoryId)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
        <section className="space-y-1.5">
          <h3 className="text-muted-foreground text-xs font-medium uppercase">
            Catégorie
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                data-on={categoryId === item.id}
                className={CHIP}
                onClick={() => setCategoryId(item.id)}
              >
                <Dot color={item.color} />
                {item.name}
              </button>
            ))}
          </div>
        </section>
        <DateRow />
        <Input className="h-8" placeholder="Libellé (facultatif)" />
      </div>
      <div className="border-t px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <Button className="h-8 w-full">Ajouter</Button>
      </div>
    </PhoneSheet>
  )
}

export const Option2AmountStep: StoryObj = {
  name: '2 · Two steps — amount on the keyboard',
  render: () => <TwoStepPrototype initialStep={1} />,
}

export const Option2DetailsStep: StoryObj = {
  name: '2 · Two steps — details',
  render: () => <TwoStepPrototype initialStep={2} />,
}

/* ---------------------------------------------------------------------------
 * Option 3: usuals first
 * ------------------------------------------------------------------------- */

function UsualsFirstPrototype() {
  const [picked, setPicked] = useState<(typeof USUALS)[number] | null>(null)
  const [amount, setAmount] = useState('')
  if (picked) {
    return (
      <PhoneSheet full>
        <div className="flex items-center gap-2 px-3 pt-3">
          <Button ghost size="sm" onClick={() => setPicked(null)}>
            <ChevronLeftIcon />
            Habituels
          </Button>
          <Button
            ghost
            iconOnly
            size="sm"
            className="ml-auto"
            aria-label="Fermer"
          >
            <XIcon />
          </Button>
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <AmountDisplay
            amount={amount}
            caption={`${picked.label} · ${category(picked.categoryId).name} · Aujourd’hui`}
          />
        </div>
        <div className="flex gap-2 border-t px-3 py-2">
          <Button className="h-8 flex-1" disabled={amount === ''}>
            Ajouter
          </Button>
        </div>
        <FakeIosKeyboard
          onKey={(key) => setAmount((current) => pressKey(current, key))}
        />
      </PhoneSheet>
    )
  }
  return (
    <PhoneSheet>
      <div className="flex items-center gap-2 px-4 pt-3">
        <h2 className="text-base font-semibold">Ajouter une dépense</h2>
        <Button
          ghost
          iconOnly
          size="sm"
          className="ml-auto"
          aria-label="Fermer"
        >
          <XIcon />
        </Button>
      </div>
      <p className="text-muted-foreground px-4 text-sm">
        Une dépense habituelle ? Touchez-la, puis le montant.
      </p>
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto px-4 py-1">
        {USUALS.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              className="flex min-h-12 w-full items-center gap-3 py-2 text-left"
              onClick={() => setPicked(item)}
            >
              <Dot color={category(item.categoryId).color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {item.label}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {category(item.categoryId).name}
                </span>
              </span>
              <span className="text-muted-foreground text-sm tabular-nums whitespace-nowrap">
                dernière : {item.last} €
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <Button outline variant="secondary" className="h-8 w-full">
          <PlusIcon />
          Autre dépense
        </Button>
      </div>
    </PhoneSheet>
  )
}

export const Option3UsualsFirst: StoryObj = {
  name: '3 · Usuals first',
  render: () => <UsualsFirstPrototype />,
}
