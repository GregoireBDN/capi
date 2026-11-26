import type { Meta, StoryObj } from '@storybook/react-vite'
import { cn } from '@capi/ui'
import {
  CalendarDaysIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  LandmarkIcon,
  MenuIcon,
  SearchIcon,
  ShoppingCartIcon,
  SlidersHorizontalIcon,
  TrainFrontIcon,
  UtensilsIcon,
  WalletIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import './glass.css'

/**
 * #503, the « verre » look of #502's month bar spread to the whole design
 * system. Three recipes on one sample screen (header + month bar, a field,
 * a segmented control, cards, a list, buttons, a sheet), synthetic data,
 * not app code:
 *
 * A. Givré: #502 extended. Near-opaque, blur on the chrome only, thin bright
 *    top edge, soft shadow, no lines.
 * B. Cristal: real glass. Colour behind the page, translucent cards that
 *    blur it, a bright edge all round, a sheen, pill controls.
 * C. Relief: opaque and raised. Two-layer shadows, buttons with a sheen,
 *    fields pressed in; blur on the chrome only.
 *
 * Deleted by the PR that builds the chosen recipe (#504).
 */
const meta: Meta<Args> = {
  title: 'Prototypes/Verre (#503)',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
  args: { recipe: 'a' },
  argTypes: {
    recipe: {
      control: 'inline-radio',
      options: ['a', 'b', 'c'],
    },
  },
}

export default meta

type Recipe = 'a' | 'b' | 'c'

interface Args {
  recipe: Recipe
}

type Story = StoryObj<Args>

const NAMES: Record<Recipe, string> = {
  a: 'A · Givré',
  b: 'B · Cristal',
  c: 'C · Relief',
}

/* ------------------------------------------------------------ the screen */

function Chrome() {
  return (
    <div className="g-chrome sticky top-0 z-20">
      <div className="flex h-12 items-center gap-2 px-2">
        <span className="text-foreground grid size-11 place-items-center">
          <MenuIcon className="size-[1.1rem]" />
        </span>
        <span className="text-primary text-xl font-extrabold tracking-tight">
          Capi
        </span>
        <span className="g-icon text-foreground ml-auto grid size-11 place-items-center">
          <EllipsisVerticalIcon className="size-[1rem]" />
        </span>
        <span className="bg-primary text-primary-foreground grid size-11 place-items-center rounded-full text-xs font-semibold">
          CD
        </span>
      </div>
      {/* #502's folder tabs: the current one is a rounded tab that runs
          into the month's band, the app's light blue, dark text. */}
      <div className="grid grid-cols-2 px-2 pt-1">
        <span className="g-tab text-foreground flex h-10 items-center justify-center rounded-t-[0.9rem] text-sm font-semibold">
          Résumé
        </span>
        <span className="text-muted-foreground flex h-10 items-center justify-center gap-2 text-sm font-medium">
          Opérations
          <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[0.55rem] leading-4 font-semibold">
            12
          </span>
        </span>
      </div>
      <div className="g-tab mx-2 mb-2 flex h-14 items-center gap-2 rounded-[0.9rem] rounded-tl-none px-1.5">
        <span className="g-icon text-foreground grid size-11 place-items-center">
          <ChevronLeftIcon className="size-[1rem]" />
        </span>
        <span className="flex flex-1 items-center justify-center gap-2 text-base font-semibold">
          <CalendarIcon className="text-muted-foreground size-[0.9rem]" />
          Novembre 2026
        </span>
        <span className="g-icon text-muted-foreground grid size-11 place-items-center">
          <ChevronRightIcon className="size-[1rem]" />
        </span>
      </div>
    </div>
  )
}

const ROWS = [
  {
    icon: ShoppingCartIcon,
    tone: 'bg-[#eb6834]',
    label: 'Supermarché du coin',
    sub: 'Courses',
    amount: '−42,80 €',
  },
  {
    icon: TrainFrontIcon,
    tone: 'bg-[#2a78d6]',
    label: 'Pass transport',
    sub: 'Transports',
    amount: '−86,40 €',
  },
  {
    icon: UtensilsIcon,
    tone: 'bg-[#e87ba4]',
    label: 'Boulangerie',
    sub: 'Restaurants',
    amount: '−6,30 €',
  },
  {
    icon: LandmarkIcon,
    tone: 'bg-[#1baf7a]',
    label: 'Salaire ACME',
    sub: 'Salaire',
    amount: '+2 450,00 €',
    income: true,
  },
]

function Screen() {
  return (
    <>
      <Chrome />
      <main className="flex flex-col gap-4 px-4 pt-5 pb-8">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl leading-tight font-bold">Mouvements</h1>
            <p className="text-muted-foreground text-sm">
              Où est passé l’argent ?
            </p>
          </div>
          <span className="g-btn text-muted-foreground flex h-11 shrink-0 items-center gap-1.5 px-3 text-sm">
            <LandmarkIcon className="size-[0.85rem]" />
            Compte
            <ChevronDownIcon className="size-[0.8rem]" />
          </span>
        </div>

        <div className="g-well flex h-11 items-center gap-2 pr-1 pl-3 text-sm">
          <SearchIcon className="text-muted-foreground size-[0.9rem]" />
          <span className="text-muted-foreground flex-1 truncate">
            Rechercher un libellé…
          </span>
          <span className="g-btn flex h-9 items-center gap-1.5 px-3 font-medium">
            <SlidersHorizontalIcon className="size-[0.8rem]" />
            Filtres
          </span>
        </div>

        <div className="g-well grid h-11 grid-cols-3 p-[3px] text-sm font-medium">
          <span className="g-thumb text-foreground grid place-items-center">
            Tout
          </span>
          <span className="text-muted-foreground grid place-items-center">
            Dépenses
          </span>
          <span className="text-muted-foreground grid place-items-center">
            Revenus
          </span>
        </div>

        <section className="g-card flex items-center gap-4 p-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#c0392b] text-white">
            <WalletIcon className="size-[1.1rem]" />
          </span>
          <div className="min-w-0">
            <p className="text-muted-foreground text-sm">
              Pris sur le compte courant à ce jour
            </p>
            <p className="text-destructive text-3xl font-bold tracking-tight">
              −975 €
            </p>
          </div>
        </section>

        <section className="g-card flex flex-col gap-1 p-2">
          <h2 className="text-muted-foreground px-2 pt-1 text-xs font-medium">
            Aujourd’hui
          </h2>
          {ROWS.map((row) => (
            <div
              key={row.label}
              className="flex min-h-12 items-center gap-3 rounded-[0.8rem] px-2"
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-full text-white',
                  row.tone,
                )}
              >
                <row.icon className="size-[0.8rem]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {row.label}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {row.sub}
                </span>
              </span>
              <span
                className={cn(
                  'text-sm font-semibold whitespace-nowrap',
                  row.income && 'text-[#006300] dark:text-[#4ade80]',
                )}
              >
                {row.amount}
              </span>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <span className="g-btn grid h-11 place-items-center text-sm font-medium">
            Annuler
          </span>
          <span className="g-primary grid h-11 place-items-center text-sm font-semibold">
            Enregistrer
          </span>
        </div>
      </main>
    </>
  )
}

function Sheet() {
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <div className="g-overlay absolute inset-0" />
      <div className="g-sheet relative flex flex-col gap-3 px-4 pt-2 pb-6">
        <span className="bg-muted-foreground/30 mx-auto h-1 w-10 rounded-full" />
        <div className="flex items-center">
          <h2 className="flex-1 text-base font-semibold">Modifier</h2>
          <span className="g-icon grid size-11 place-items-center">
            <XIcon className="size-[0.9rem]" />
          </span>
        </div>
        <label className="text-muted-foreground text-xs font-medium">
          Libellé
        </label>
        <div className="g-well flex h-11 items-center px-3 text-sm">
          Supermarché du coin
        </div>
        <label className="text-muted-foreground text-xs font-medium">
          Date
        </label>
        <div className="g-well flex h-11 items-center gap-2 px-3 text-sm">
          <CalendarDaysIcon className="text-muted-foreground size-[0.9rem]" />
          26/11/2026
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <span className="g-btn grid h-11 place-items-center text-sm font-medium">
            Annuler
          </span>
          <span className="g-primary grid h-11 place-items-center text-sm font-semibold">
            Enregistrer
          </span>
        </div>
      </div>
    </div>
  )
}

/** One phone, 390 × 844, its page scrolled by `scroll` px. */
function Phone({
  recipe,
  dark,
  scroll = 0,
  sheet,
  caption,
}: {
  recipe: Recipe
  dark?: boolean
  scroll?: number
  sheet?: boolean
  caption: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = scroll
  }, [scroll])
  return (
    <figure className="flex flex-col items-center gap-2">
      <div
        data-recipe={recipe}
        className={cn(
          dark ? 'dark' : 'light',
          'bg-background text-foreground relative h-[844px] w-[390px] overflow-hidden',
        )}
      >
        <div
          ref={ref}
          className="g-page h-full overflow-y-auto [scrollbar-width:none]"
        >
          <Screen />
        </div>
        {sheet && <Sheet />}
      </div>
      <figcaption className="text-muted-foreground font-sans text-[13px]">
        {caption}
      </figcaption>
    </figure>
  )
}

function Board({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div
      data-glass-proto
      data-board
      className="light inline-flex flex-col gap-3 bg-white p-6 font-sans"
    >
      <h1 className="text-[20px] font-bold text-neutral-800">{title}</h1>
      <div className="flex gap-6">{children}</div>
    </div>
  )
}

/** Light, light scrolled under the glass, dark. */
export const Recette: Story = {
  render: ({ recipe }) => (
    <Board title={NAMES[recipe]}>
      <Phone recipe={recipe} caption="Clair" />
      <Phone recipe={recipe} scroll={190} caption="En défilant" />
      <Phone recipe={recipe} dark caption="Sombre" />
    </Board>
  ),
}

/** A sheet over the page, light and dark. */
export const Feuille: Story = {
  render: ({ recipe }) => (
    <Board title={`${NAMES[recipe]} · feuille`}>
      <Phone recipe={recipe} sheet caption="Clair" />
      <Phone recipe={recipe} sheet dark caption="Sombre" />
    </Board>
  ),
}

/** The three recipes side by side, light. */
export const Comparaison: Story = {
  render: () => (
    <Board title="Trois recettes · clair">
      <Phone recipe="a" caption={NAMES.a} />
      <Phone recipe="b" caption={NAMES.b} />
      <Phone recipe="c" caption={NAMES.c} />
    </Board>
  ),
}

/** The three recipes side by side, dark. */
export const ComparaisonSombre: Story = {
  render: () => (
    <Board title="Trois recettes · sombre">
      <Phone recipe="a" dark caption={NAMES.a} />
      <Phone recipe="b" dark caption={NAMES.b} />
      <Phone recipe="c" dark caption={NAMES.c} />
    </Board>
  ),
}
