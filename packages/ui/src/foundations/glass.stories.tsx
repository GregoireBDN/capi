import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  MenuIcon,
  SearchIcon,
  ShoppingCartIcon,
  TrainFrontIcon,
  UtensilsIcon,
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

import { cn } from '../lib/utils'

/**
 * The glass foundations (#504, recipe « A · Givré » chosen in #503): each
 * surface over a busy page (black, white, mid-grey, colours and amounts
 * scrolled under it), in the theme of the toolbar.
 *
 * - `glass-chrome`: header, month bar, sidebar. Translucent (90 %), blurred,
 *   a soft shadow below, no line.
 * - `glass-panel`: sheets, dialogs, popovers, menus, toasts. Translucent
 *   (94 %), blurred, sheen on top, large shadow.
 * - `glass-card`, `glass-well`: cards and fields on the page. Opaque, sheen,
 *   soft shadow, no blur, no ring.
 * - `bg-glass-fill`: secondary and icon buttons, a segmented track.
 * - `shadow-glass-primary`: the solid primary button.
 * - `glass-overlay`: behind a sheet or a dialog.
 *
 * One blurred layer at a time: nothing inside a panel blurs again. Muted text
 * on the chrome and on panels is `text-glass-muted-foreground`.
 */
const meta: Meta = {
  title: 'Foundations/Verre',
  parameters: { layout: 'fullscreen' },
  tags: ['!autodocs'],
}

export default meta

type Story = StoryObj

/* ------------------------------------------------------- the busy page */

const ROWS = [
  {
    icon: ShoppingCartIcon,
    tone: 'bg-[#eb6834]',
    label: 'Supermarché du coin',
    amount: '−42,18 €',
  },
  {
    icon: TrainFrontIcon,
    tone: 'bg-[#3b82f6]',
    label: 'Passe navigo',
    amount: '−86,40 €',
  },
  {
    icon: UtensilsIcon,
    tone: 'bg-[#16a34a]',
    label: 'Boulangerie test',
    amount: '−6,90 €',
  },
] as const

/**
 * The worst things to scroll under glass, side by side so every part of a
 * surface crosses each of them: black, white, mid-grey, colours, text.
 */
function BusyStrip({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('relative overflow-hidden', className)}>
      <div className="absolute inset-0 grid grid-cols-4">
        <div className="bg-black" />
        <div className="bg-white" />
        <div className="bg-[#808080]" />
        <div className="bg-[linear-gradient(180deg,#eb6834,#3b82f6,#16a34a,#f9d544)]" />
      </div>
      <div className="relative space-y-6 p-3 pt-6">
        {Array.from({ length: 4 }, (_, i) => (
          <p
            key={i}
            className="text-lg leading-tight font-semibold whitespace-nowrap text-[#e11d48]"
          >
            Sous le verre −1 234,56 € · 42,00 €
          </p>
        ))}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- surfaces */

function Round({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'bg-glass-fill text-foreground grid size-11 shrink-0 place-items-center rounded-full',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** The app chrome: header + #502's month bar with its folder tabs. */
function Chrome({ staging = false }: { staging?: boolean }) {
  return (
    <div>
      <div
        className={cn(
          'bg-glass-chrome relative z-20 flex h-12 items-center gap-2 px-2 backdrop-blur-(--glass-blur)',
          staging && 'env-banner',
        )}
      >
        <span className="text-foreground grid size-11 place-items-center">
          <MenuIcon className="size-[1.1rem]" />
        </span>
        <span className="text-primary text-xl font-extrabold tracking-tight">
          Capi
        </span>
        <span className="text-glass-muted-foreground text-sm">Mouvements</span>
        <Round className="ml-auto">
          <EllipsisVerticalIcon className="size-[1rem]" />
        </Round>
      </div>
      <div className="glass-chrome relative z-10">
        <div className="grid grid-cols-2 gap-[6px] px-2 pt-[12px]">
          <span className="bg-primary/9 text-foreground flex h-[60px] items-center justify-center rounded-t-2xl text-sm font-semibold">
            Résumé
          </span>
          <span className="text-glass-muted-foreground flex h-[60px] items-center justify-center gap-2 text-sm font-medium">
            Opérations
            <span className="bg-primary text-primary-foreground grid size-[24px] place-items-center rounded-full text-[12px] font-semibold">
              12
            </span>
          </span>
        </div>
        <div className="bg-primary/9 flex h-12 items-center gap-2 px-2">
          <Round>
            <ChevronLeftIcon className="size-[1rem]" />
          </Round>
          <span className="flex flex-1 items-center justify-center gap-2 text-base font-semibold">
            <CalendarIcon className="size-[0.9rem]" />
            Novembre 2026
          </span>
          <Round>
            <ChevronRightIcon className="size-[1rem]" />
          </Round>
        </div>
      </div>
    </div>
  )
}

function Samples() {
  return (
    <div className="space-y-4 p-3">
      <label className="glass-well rounded-control text-glass-muted-foreground flex h-11 items-center gap-2 px-3 text-sm">
        <SearchIcon className="size-[0.9rem]" />
        Rechercher une opération
      </label>
      <div className="bg-glass-fill rounded-control grid grid-cols-2 p-[3px] text-sm font-medium">
        <span className="glass-well rounded-[calc(var(--radius-control)-3px)] py-2 text-center">
          Dépenses
        </span>
        <span className="text-muted-foreground py-2 text-center">Revenus</span>
      </div>
      <section className="glass-card rounded-card space-y-3 p-4">
        <h3 className="text-sm font-semibold">Carte · opaque, sans ligne</h3>
        {ROWS.map(({ icon: Icon, tone, label, amount }) => (
          <div key={label} className="flex items-center gap-3">
            <span
              className={cn(
                'grid size-9 place-items-center rounded-full text-white',
                tone,
              )}
            >
              <Icon className="size-[0.85rem]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{label}</span>
              <span className="text-muted-foreground block text-xs">
                Courses
              </span>
            </span>
            <span className="text-destructive text-sm font-semibold whitespace-nowrap">
              {amount}
            </span>
          </div>
        ))}
      </section>
      <div className="flex gap-3">
        <span className="bg-glass-fill rounded-control flex h-11 flex-1 items-center justify-center text-sm font-medium">
          Annuler
        </span>
        <span className="bg-primary text-primary-foreground shadow-glass-primary rounded-control flex h-11 flex-1 items-center justify-center text-sm font-semibold">
          Enregistrer
        </span>
      </div>
    </div>
  )
}

/** A sheet over the page, its overlay behind it. */
function Sheet() {
  return (
    <>
      <div className="glass-overlay absolute inset-0 z-30" />
      <div className="glass-panel rounded-t-sheet absolute inset-x-0 bottom-0 z-40 space-y-3 p-4 pb-6">
        <div className="bg-foreground/20 mx-auto h-1 w-10 rounded-full" />
        <h3 className="text-base font-semibold">Panneau · flottant, flouté</h3>
        <p className="text-glass-muted-foreground text-sm">
          Texte secondaire sur le verre
        </p>
        <div className="glass-well rounded-control flex h-11 items-center px-3 text-sm">
          Compte courant
        </div>
        <span className="bg-primary text-primary-foreground shadow-glass-primary rounded-control flex h-11 items-center justify-center text-sm font-semibold">
          Valider
        </span>
      </div>
    </>
  )
}

/** A 390px phone frame: the chrome over a busy page, cards, a sheet. */
function Phone({
  title,
  sheet = false,
  staging = false,
}: {
  title: string
  sheet?: boolean
  staging?: boolean
}) {
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-muted-foreground px-1 text-xs">
        {title}
      </figcaption>
      <div
        data-glass-frame
        className="bg-background text-foreground relative w-[390px] overflow-hidden rounded-[1.6rem] shadow-[0_0_0_1px_rgb(0_0_0/8%)]"
      >
        <div className="absolute inset-x-0 top-0 z-20">
          <Chrome staging={staging} />
        </div>
        {/* The page as if scrolled: its busiest parts under the chrome and
            under the sheet. */}
        <BusyStrip className="h-[240px]" />
        <Samples />
        <BusyStrip className="h-[300px]" />
        {sheet && <Sheet />}
      </div>
    </figure>
  )
}

function Board({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-svh flex-wrap items-start gap-6 p-6">
      {children}
    </div>
  )
}

/** Each surface over the busy page; switch light / dark in the toolbar. */
export const Surfaces: Story = {
  render: () => (
    <Board>
      <Phone title="Chrome, carte, champ, boutons" />
      <Phone title="Panneau et voile" sheet />
      <Phone title="Staging : le jaune reste opaque" staging />
    </Board>
  ),
}

/**
 * The fallback: without `backdrop-filter`, or with « Réduire la
 * transparence », the chrome and the panels are opaque, the same colours.
 */
export const Fallback: Story = {
  render: () => <FallbackBoard />,
}

function FallbackBoard() {
  useEffect(() => {
    // The alphas are read where the tokens are declared (`:root`).
    const root = document.documentElement
    root.style.setProperty('--glass-chrome-alpha', '100%')
    root.style.setProperty('--glass-panel-alpha', '100%')
    root.style.setProperty('--glass-blur', '0px')
    root.style.setProperty('--glass-overlay-blur', '0px')
    return () => {
      for (const name of [
        '--glass-chrome-alpha',
        '--glass-panel-alpha',
        '--glass-blur',
        '--glass-overlay-blur',
      ])
        root.style.removeProperty(name)
    }
  }, [])
  return (
    <Board>
      <Phone title="Sans transparence" />
      <Phone title="Sans transparence, panneau" sheet />
    </Board>
  )
}
