import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, Input, cn } from '@finances/ui'
import {
  BikeIcon,
  CheckIcon,
  ChevronRightIcon,
  GiftIcon,
  HouseIcon,
  MinusIcon,
  PlaneIcon,
  PlusIcon,
  ShieldIcon,
  SparklesIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import {
  ACCOUNTS,
  EnvelopeIcon,
  euros,
  Frame,
  freeCents,
  percent,
  Screen,
  SideBySide,
  WIDTH_ARG,
  type Width,
} from './shared'

/**
 * Prototypes of creating an envelope (#428), one decision per screen, with
 * Suivant / Retour (like the quick entry). Clickable mockups with synthetic
 * data, not app code.
 *
 * A. Pas à pas : Nom (and its icon) → Montant → Date → Catégories →
 *    Départ (what to take from « libre » now, per account) → Clé (its share
 *    of each new saving, per account) → Récapitulatif. The optional steps
 *    have « Passer ».
 * B. Modèle d’abord : « Pour quoi ? » in big tiles (Voyage, Achat, Apport,
 *    Imprévus, Cadeau, Autre) fills in the name, icon, colour and
 *    categories; then Nom (already filled in) → Montant → Date → Départ →
 *    Récapitulatif, where the categories and the key can still be changed.
 *    One screen fewer, and the key left to the account page.
 * C. Récap qui se remplit : A's steps, with the answers so far in a short
 *    summary above the question; tapping an answer goes back to it.
 */
const meta: Meta<FlowArgs> = {
  title: 'Prototypes/Enveloppes (#428)/4. Créer une enveloppe',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
}

export default meta

type Direction = 'A' | 'B' | 'C'

type StepId =
  | 'modele'
  | 'nom'
  | 'montant'
  | 'date'
  | 'categories'
  | 'depart'
  | 'cle'
  | 'recap'

const STEPS: Record<Direction, StepId[]> = {
  A: ['nom', 'montant', 'date', 'categories', 'depart', 'cle', 'recap'],
  B: ['modele', 'nom', 'montant', 'date', 'depart', 'recap'],
  C: ['nom', 'montant', 'date', 'categories', 'depart', 'cle', 'recap'],
}

const OPTIONAL: StepId[] = ['categories', 'depart', 'cle']

interface FlowArgs {
  direction: Direction
  width: Width
  /** The screen shown first (0 = the first). */
  etape: number
}

interface Template {
  id: string
  label: string
  name: string
  icon: LucideIcon
  color: string
  categories: string[]
}

const TEMPLATES: Template[] = [
  {
    id: 'voyage',
    label: 'Voyage',
    name: 'Voyage',
    icon: PlaneIcon,
    color: 'var(--chart-5)',
    categories: ['Voyages', 'Restaurants'],
  },
  {
    id: 'achat',
    label: 'Un achat',
    name: 'Nouveau vélo',
    icon: BikeIcon,
    color: 'var(--chart-3)',
    categories: ['Sport'],
  },
  {
    id: 'apport',
    label: 'Un apport',
    name: 'Apport',
    icon: HouseIcon,
    color: 'var(--chart-1)',
    categories: [],
  },
  {
    id: 'imprevus',
    label: 'Imprévus',
    name: 'Imprévus',
    icon: ShieldIcon,
    color: 'var(--chart-4)',
    categories: [],
  },
  {
    id: 'cadeau',
    label: 'Cadeaux',
    name: 'Cadeaux de Noël',
    icon: GiftIcon,
    color: 'var(--chart-2)',
    categories: ['Cadeaux'],
  },
  {
    id: 'autre',
    label: 'Autre',
    name: '',
    icon: SparklesIcon,
    color: 'var(--chart-7)',
    categories: [],
  },
]

const CATEGORIES = [
  'Voyages',
  'Restaurants',
  'Loisirs',
  'Sport',
  'Cadeaux',
  'Maison',
  'Santé',
  'Transport',
]

const DATES = [
  { id: '3', label: 'Dans 3 mois', detail: 'fin févr. 2027', months: 3 },
  { id: '6', label: 'Dans 6 mois', detail: 'fin mai 2027', months: 6 },
  { id: '12', label: 'Dans un an', detail: 'fin nov. 2027', months: 12 },
  { id: 'date', label: 'Une date…', detail: '', months: 8 },
  { id: 'none', label: 'Pas de date', detail: '', months: 0 },
]

interface Answers {
  name: string
  icon: LucideIcon
  color: string
  template?: string
  targetCents?: number
  date?: string
  categories: string[]
  start: Record<string, number>
  key: Record<string, number>
}

const INITIAL: Answers = {
  name: 'Voyage au Japon',
  icon: PlaneIcon,
  color: 'var(--chart-5)',
  targetCents: 400000,
  date: '6',
  categories: ['Voyages'],
  start: { livret: 50000 },
  key: { livret: 2000 },
}

function monthsOf(answers: Answers) {
  return DATES.find((d) => d.id === answers.date)?.months ?? 0
}

function need(answers: Answers) {
  const months = monthsOf(answers)
  if (!answers.targetCents || !months) return undefined
  const start = Object.values(answers.start).reduce((s, c) => s + c, 0)
  return Math.ceil((answers.targetCents - start) / months)
}

/* ---------------------------------------------------------------------------
 * Small inputs
 * ------------------------------------------------------------------------- */

function Choice({
  selected,
  onClick,
  children,
  detail,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  detail?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left',
        selected ? 'border-primary bg-primary/10' : 'hover:bg-muted/60',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{children}</span>
        {detail && (
          <span className="text-muted-foreground block text-sm">{detail}</span>
        )}
      </span>
      {selected && <CheckIcon className="text-primary size-5" aria-hidden />}
    </button>
  )
}

function Stepper({
  label,
  sub,
  value,
  onChange,
  step,
  format,
  max,
}: {
  label: string
  sub?: string
  value: number
  onChange: (value: number) => void
  step: number
  format: (value: number) => string
  max: number
}) {
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <div className="min-w-[7rem] flex-1">
        <p className="break-normal">{label}</p>
        {sub && <p className="text-muted-foreground text-sm">{sub}</p>}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button
          iconOnly
          variant="secondary"
          aria-label={`Moins sur ${label}`}
          disabled={value <= 0}
          onClick={() => onChange(Math.max(0, value - step))}
        >
          <MinusIcon />
        </Button>
        <span className="w-20 text-center font-medium whitespace-nowrap tabular-nums">
          {format(value)}
        </span>
        <Button
          iconOnly
          variant="secondary"
          aria-label={`Plus sur ${label}`}
          disabled={value + step > max}
          onClick={() => onChange(value + step)}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * The steps
 * ------------------------------------------------------------------------- */

const QUESTIONS: Record<StepId, string> = {
  modele: 'Pour quoi ?',
  nom: 'Son nom',
  montant: 'Combien ?',
  date: 'Pour quand ?',
  categories: 'Elle paiera…',
  depart: 'Pour commencer',
  cle: 'Chaque mois',
  recap: 'C’est bon ?',
}

const ICONS: { icon: LucideIcon; color: string }[] = [
  { icon: PlaneIcon, color: 'var(--chart-5)' },
  { icon: HouseIcon, color: 'var(--chart-1)' },
  { icon: BikeIcon, color: 'var(--chart-3)' },
  { icon: ShieldIcon, color: 'var(--chart-4)' },
  { icon: GiftIcon, color: 'var(--chart-2)' },
  { icon: SparklesIcon, color: 'var(--chart-7)' },
]

function StepBody({
  step,
  answers,
  set,
}: {
  step: StepId
  answers: Answers
  set: (patch: Partial<Answers>) => void
}) {
  switch (step) {
    case 'modele':
      return (
        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map((t) => {
            const selected = answers.template === t.id
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  set({
                    template: t.id,
                    name: t.name,
                    icon: t.icon,
                    color: t.color,
                    categories: t.categories,
                  })
                }
                className={cn(
                  'flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl p-3',
                  selected && 'ring-primary ring-2',
                )}
                style={{
                  background: `color-mix(in oklch, ${t.color} ${selected ? 26 : 10}%, transparent)`,
                }}
              >
                <t.icon
                  className="size-7"
                  style={{ color: t.color }}
                  aria-hidden
                />
                <span className="text-sm font-medium">{t.label}</span>
              </button>
            )
          })}
        </div>
      )
    case 'nom':
      return (
        <>
          <Input
            aria-label="Nom"
            value={answers.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Voyage, vélo, apport…"
          />
          <div className="flex flex-wrap gap-2">
            {ICONS.map((choice, i) => {
              const selected = answers.icon === choice.icon
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Icône ${i + 1}`}
                  onClick={() => set(choice)}
                  className={cn(
                    'rounded-full p-0.5',
                    selected && 'ring-primary ring-2',
                  )}
                >
                  <EnvelopeIcon envelope={choice} />
                </button>
              )
            })}
          </div>
        </>
      )
    case 'montant':
      return (
        <>
          <div className="flex items-baseline gap-2">
            <Input
              aria-label="Montant"
              inputMode="decimal"
              className="h-14 text-3xl font-semibold tabular-nums"
              value={
                answers.targetCents
                  ? String(answers.targetCents / 100).replace('.', ',')
                  : ''
              }
              onChange={(e) =>
                set({
                  targetCents:
                    Math.round(
                      Number(e.target.value.replace(',', '.')) * 100,
                    ) || undefined,
                })
              }
              placeholder="0"
            />
            <span className="text-2xl">€</span>
          </div>
          <Choice
            selected={answers.targetCents === undefined}
            onClick={() => set({ targetCents: undefined })}
            detail="Mettre de côté sans but chiffré"
          >
            Pas de montant
          </Choice>
        </>
      )
    case 'date': {
      const monthly = need(answers)
      return (
        <>
          <div className="space-y-2">
            {DATES.map((d) => (
              <Choice
                key={d.id}
                selected={answers.date === d.id}
                onClick={() => set({ date: d.id })}
                detail={d.detail}
              >
                {d.label}
              </Choice>
            ))}
          </div>
          {monthly !== undefined && (
            <p className="bg-muted/60 rounded-md p-3 text-sm">
              Soit <span className="font-semibold">{euros(monthly, true)}</span>{' '}
              par mois.
            </p>
          )}
        </>
      )
    }
    case 'categories':
      return (
        <>
          <p className="text-muted-foreground text-sm">
            Ses dépenses dans ces catégories vous seront proposées pour elle.
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => {
              const selected = answers.categories.includes(category)
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    set({
                      categories: selected
                        ? answers.categories.filter((c) => c !== category)
                        : [...answers.categories, category],
                    })
                  }
                  className={cn(
                    'min-h-11 rounded-full border px-4 text-sm',
                    selected
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'hover:bg-muted/60',
                  )}
                >
                  {category}
                </button>
              )
            })}
          </div>
        </>
      )
    case 'depart':
      return (
        <>
          <p className="text-muted-foreground text-sm">
            Pris sur « libre ». L’argent ne bouge pas.
          </p>
          <div className="divide-y">
            {ACCOUNTS.map((account) => (
              <Stepper
                key={account.id}
                label={account.name}
                sub={`${euros(freeCents(account), true)} libres`}
                value={answers.start[account.id] ?? 0}
                step={5000}
                max={freeCents(account)}
                format={(v) => euros(v, true)}
                onChange={(v) =>
                  set({ start: { ...answers.start, [account.id]: v } })
                }
              />
            ))}
          </div>
        </>
      )
    case 'cle':
      return (
        <>
          <p className="text-muted-foreground text-sm">
            Sa part de chaque nouvelle épargne, sur chaque compte. Modifiable
            sur la page du compte.
          </p>
          <div className="divide-y">
            {ACCOUNTS.map((account) => {
              const used = account.key.reduce((s, k) => s + k.basisPoints, 0)
              return (
                <Stepper
                  key={account.id}
                  label={account.name}
                  sub={`${percent(10000 - used)} libres dans la clé`}
                  value={answers.key[account.id] ?? 0}
                  step={500}
                  max={10000 - used}
                  format={percent}
                  onChange={(v) =>
                    set({ key: { ...answers.key, [account.id]: v } })
                  }
                />
              )
            })}
          </div>
        </>
      )
    case 'recap':
      return null
  }
}

function summaryLines(answers: Answers) {
  const start = Object.values(answers.start).reduce((s, c) => s + c, 0)
  const date = DATES.find((d) => d.id === answers.date)
  const monthly = need(answers)
  return [
    { step: 'nom' as const, label: 'Nom', value: answers.name || '—' },
    {
      step: 'montant' as const,
      label: 'Montant',
      value: answers.targetCents ? euros(answers.targetCents, true) : 'Aucun',
    },
    {
      step: 'date' as const,
      label: 'Date',
      value: date
        ? `${date.detail || date.label}${monthly ? ` · ${euros(monthly, true)}/mois` : ''}`
        : '—',
    },
    {
      step: 'categories' as const,
      label: 'Paie',
      value: answers.categories.join(', ') || 'Rien',
    },
    {
      step: 'depart' as const,
      label: 'Départ',
      value: start ? euros(start, true) : '0 €',
    },
    {
      step: 'cle' as const,
      label: 'Clé',
      value:
        Object.entries(answers.key)
          .filter(([, bp]) => bp > 0)
          .map(
            ([id, bp]) =>
              `${ACCOUNTS.find((a) => a.id === id)!.name} ${percent(bp)}`,
          )
          .join(', ') || 'Aucune',
    },
  ]
}

function Summary({
  answers,
  upTo,
  onGo,
}: {
  answers: Answers
  /** Only the lines of these steps. */
  upTo?: StepId[]
  onGo: (step: StepId) => void
}) {
  const lines = summaryLines(answers).filter(
    (line) => !upTo || upTo.includes(line.step),
  )
  if (lines.length === 0) return null
  return (
    <ul className="bg-muted/60 divide-border divide-y overflow-hidden rounded-md">
      {lines.map((line) => (
        <li key={line.step}>
          <button
            type="button"
            onClick={() => onGo(line.step)}
            className="hover:bg-muted flex min-h-11 w-full flex-wrap items-center gap-x-3 px-3 py-1.5 text-left text-sm"
          >
            <span className="text-muted-foreground w-16 shrink-0">
              {line.label}
            </span>
            <span className="min-w-0 flex-1 font-medium">{line.value}</span>
            <ChevronRightIcon
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden
            />
          </button>
        </li>
      ))}
    </ul>
  )
}

/* ---------------------------------------------------------------------------
 * The flow
 * ------------------------------------------------------------------------- */

function Flow({ direction, width, etape }: FlowArgs) {
  const steps = STEPS[direction]
  const [index, setIndex] = useState(Math.min(etape, steps.length - 1))
  const [answers, setAnswers] = useState<Answers>({
    ...INITIAL,
    template: direction === 'B' ? 'voyage' : undefined,
  })
  useEffect(
    () => setIndex(Math.min(etape, steps.length - 1)),
    [etape, direction, steps.length],
  )
  const step = steps[index]
  const set = (patch: Partial<Answers>) => setAnswers({ ...answers, ...patch })
  const go = (target: StepId) => {
    const i = steps.indexOf(target)
    if (i >= 0) setIndex(i)
  }
  const last = index === steps.length - 1
  const optional = OPTIONAL.includes(step)

  return (
    <Screen
      width={width}
      title="Nouvelle enveloppe"
      footer={
        <>
          {index > 0 && (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIndex(index - 1)}
            >
              Retour
            </Button>
          )}
          {optional && (
            <Button
              variant="secondary"
              ghost
              className="flex-1"
              onClick={() => setIndex(index + 1)}
            >
              Passer
            </Button>
          )}
          <Button
            className="flex-1"
            disabled={step === 'nom' && !answers.name}
            onClick={() => !last && setIndex(index + 1)}
          >
            {last ? 'Créer' : 'Suivant'}
          </Button>
        </>
      }
    >
      <div
        className="flex gap-1"
        aria-label={`Étape ${index + 1} sur ${steps.length}`}
      >
        {steps.map((s, i) => (
          <span
            key={s}
            className={cn(
              'h-1 flex-1 rounded-full',
              i <= index ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>
      {direction === 'C' && step !== 'recap' && (
        <Summary answers={answers} upTo={steps.slice(0, index)} onGo={go} />
      )}
      {step === 'recap' ? (
        <>
          <div className="flex items-center gap-3">
            <EnvelopeIcon envelope={answers} size="lg" />
            <p className="text-xl font-semibold">{answers.name}</p>
          </div>
          <Summary answers={answers} onGo={go} />
          {direction === 'B' && (
            <p className="text-muted-foreground text-sm">
              Les catégories viennent du modèle « Voyage », la clé reste à
              régler sur la page de chaque compte.
            </p>
          )}
        </>
      ) : (
        <>
          <h2 className="text-2xl font-semibold">{QUESTIONS[step]}</h2>
          <StepBody step={step} answers={answers} set={set} />
        </>
      )}
    </Screen>
  )
}

function CreatePage(args: FlowArgs) {
  return (
    <Frame
      width={args.width}
      crumbs={['Enveloppes']}
      active="Enveloppes"
      title="Enveloppes"
      height={720}
      overlay={<Flow {...args} />}
    >
      <p className="text-muted-foreground text-sm">(la liste derrière)</p>
    </Frame>
  )
}

export const UnFlux: StoryObj<FlowArgs> = {
  name: 'Un parcours',
  args: { direction: 'A', width: 390, etape: 0 },
  argTypes: {
    direction: { control: 'inline-radio', options: ['A', 'B', 'C'] },
    width: WIDTH_ARG,
    etape: { control: { type: 'range', min: 0, max: 6, step: 1 } },
  },
  render: (args) => <CreatePage {...args} />,
}

const LABELS: Record<Direction, string> = {
  A: 'A. Pas à pas (7 écrans)',
  B: 'B. Modèle d’abord (6 écrans)',
  C: 'C. Récap qui se remplit (7 écrans)',
}

/** The three at the same step (the recap is the last one). */
export const CoteACote: StoryObj<FlowArgs> = {
  name: 'Côte à côte',
  args: { width: 390, etape: 2 },
  argTypes: {
    width: { control: 'inline-radio', options: [320, 390] },
    etape: { control: { type: 'range', min: 0, max: 6, step: 1 } },
  },
  render: ({ width, etape }) => (
    <SideBySide
      items={(['A', 'B', 'C'] as const).map((direction) => ({
        label: LABELS[direction],
        node: <CreatePage direction={direction} width={width} etape={etape} />,
      }))}
    />
  ),
}
