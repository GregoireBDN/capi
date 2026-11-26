import type { Meta, StoryObj } from '@storybook/react-vite'
import { cn } from '@capi/ui'
import { FlaskConicalIcon, MenuIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import mark from '../../../../web/public/brand/capi-mark.svg?url'
import wordmark from '../../../../web/public/brand/capi-nom.svg?url'

/**
 * Staging's badge beside the name (#454), the owner finds today's outlined
 * « STAGING » tag ugly: four ways to show it in the yellow header, at 390
 * and 320px. Prototype only, deleted by the PR that builds the chosen one.
 */
const meta: Meta = {
  title: 'Prototypes/Badge staging',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
}

export default meta

type Variant = 'today' | 'a' | 'b' | 'c' | 'd'

const NAMES: Record<Variant, string> = {
  today: "Aujourd'hui",
  a: 'A · Pastille foncée',
  b: 'B · Fiole',
  c: 'C · En exposant',
  d: 'D · Point et mot',
}

function Brand({ variant, narrow }: { variant: Variant; narrow: boolean }) {
  const full = <img src={wordmark} alt="" className="h-8 translate-y-[9%]" />
  switch (variant) {
    case 'today':
      return (
        <>
          {narrow ? <img src={mark} alt="" className="h-8" /> : full}
          <span className="shrink-0 rounded-md border border-current/30 px-1.5 py-0.5 text-[0.6rem] leading-none font-semibold tracking-wide whitespace-nowrap uppercase">
            Staging
          </span>
        </>
      )
    case 'a':
      return (
        <>
          {narrow ? <img src={mark} alt="" className="h-8" /> : full}
          <span className="bg-env-banner-foreground text-env-banner shrink-0 rounded-full px-2 py-1 text-[0.6rem] leading-none font-semibold whitespace-nowrap">
            Staging
          </span>
        </>
      )
    case 'b':
      return (
        <>
          {full}
          <span
            aria-label="Staging"
            className="bg-env-banner-foreground text-env-banner grid size-7 shrink-0 place-items-center rounded-full"
          >
            <FlaskConicalIcon className="size-[0.8rem]" strokeWidth={2.4} />
          </span>
        </>
      )
    case 'c':
      return (
        <span className="relative inline-flex">
          {full}
          <span className="bg-env-banner-foreground text-env-banner absolute -top-1 -right-2 translate-x-full rounded-full px-1.5 py-[3px] text-[0.5rem] leading-none font-bold whitespace-nowrap">
            test
          </span>
        </span>
      )
    case 'd':
      return (
        <>
          {narrow ? <img src={mark} alt="" className="h-8" /> : full}
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold whitespace-nowrap">
            <span className="size-2 rounded-full bg-[oklch(0.6_0.2_30)] shadow-[0_0_0_3px_oklch(0.6_0.2_30/25%)]" />
            Staging
          </span>
        </>
      )
  }
}

function Header({ variant, width }: { variant: Variant; width: number }) {
  return (
    <div
      style={{ width }}
      className="bg-background overflow-hidden rounded-xl shadow-[0_0_0_1px_rgb(0_0_0/8%)]"
    >
      <div className="env-banner flex h-12 items-center gap-1 px-2">
        <span className="text-foreground grid size-11 shrink-0 place-items-center">
          <MenuIcon className="size-[1.1rem]" />
        </span>
        <span className="flex h-11 min-w-0 items-center gap-2 px-1">
          <Brand variant={variant} narrow={width < 390} />
        </span>
        <span className="bg-primary text-primary-foreground ml-auto grid size-11 shrink-0 place-items-center rounded-full text-xs font-semibold">
          CD
        </span>
      </div>
      <div className="h-16" />
    </div>
  )
}

function Row({ variant }: { variant: Variant }) {
  return (
    <figure className="space-y-2">
      <figcaption className="text-foreground text-sm font-semibold">
        {NAMES[variant]}
      </figcaption>
      <div className="flex flex-wrap items-start gap-4">
        <Header variant={variant} width={390} />
        <Header variant={variant} width={320} />
      </div>
    </figure>
  )
}

function Board({ children }: { children: ReactNode }) {
  return (
    <div
      data-glass-frame
      className={cn('bg-background min-h-svh space-y-6 p-6')}
    >
      {children}
    </div>
  )
}

export const Propositions: StoryObj = {
  render: () => (
    <Board>
      {(['today', 'a', 'b', 'c', 'd'] as const).map((v) => (
        <Row key={v} variant={v} />
      ))}
    </Board>
  ),
}

/* ------------------------------------------- the owner's pick: the flask */

type Flask = 'today' | 'violet' | 'sunset' | 'emerald' | 'glass' | 'night'

const FLASK_NAMES: Record<Flask, string> = {
  today: 'Fiole foncée (B)',
  violet: '1 · Violet néon',
  sunset: '2 · Coucher de soleil',
  emerald: '3 · Émeraude',
  glass: '4 · Verre blanc, fiole violette',
  night: '5 · Nuit, fiole rose',
}

const DISC: Record<Flask, string> = {
  today: 'bg-env-banner-foreground text-env-banner',
  violet:
    'bg-[linear-gradient(135deg,#a855f7,#ec4899)] text-white shadow-[0_4px_12px_-4px_rgb(168_85_247/70%),inset_0_1px_0_rgb(255_255_255/35%)]',
  sunset:
    'bg-[linear-gradient(135deg,#fb7185,#f97316)] text-white shadow-[0_4px_12px_-4px_rgb(249_115_22/70%),inset_0_1px_0_rgb(255_255_255/35%)]',
  emerald:
    'bg-[linear-gradient(135deg,#34d399,#0d9488)] text-white shadow-[0_4px_12px_-4px_rgb(13_148_136/70%),inset_0_1px_0_rgb(255_255_255/35%)]',
  glass:
    'bg-white/75 text-[#9333ea] shadow-[0_4px_12px_-6px_rgb(15_23_42/35%),inset_0_1px_0_rgb(255_255_255)]',
  night:
    'bg-[linear-gradient(135deg,#3b0764,#1e1b4b)] text-[#f472b6] shadow-[0_4px_12px_-4px_rgb(59_7_100/70%),inset_0_1px_0_rgb(255_255_255/15%)]',
}

function FlaskHeader({ flask, width }: { flask: Flask; width: number }) {
  return (
    <div
      style={{ width }}
      className="bg-background overflow-hidden rounded-xl shadow-[0_0_0_1px_rgb(0_0_0/8%)]"
    >
      <div className="env-banner flex h-12 items-center gap-1 px-2">
        <span className="text-foreground grid size-11 shrink-0 place-items-center">
          <MenuIcon className="size-[1.1rem]" />
        </span>
        <span className="flex h-11 min-w-0 items-center gap-2 px-1">
          <img src={wordmark} alt="" className="h-8 translate-y-[9%]" />
          <span
            aria-label="Staging"
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-full',
              DISC[flask],
            )}
          >
            <FlaskConicalIcon className="size-[0.8rem]" strokeWidth={2.4} />
          </span>
        </span>
        <span className="bg-primary text-primary-foreground ml-auto grid size-11 shrink-0 place-items-center rounded-full text-xs font-semibold">
          CD
        </span>
      </div>
    </div>
  )
}

export const Fioles: StoryObj = {
  render: () => (
    <Board>
      {(Object.keys(FLASK_NAMES) as Flask[]).map((f) => (
        <figure key={f} className="space-y-2">
          <figcaption className="text-foreground text-sm font-semibold">
            {FLASK_NAMES[f]}
          </figcaption>
          <div className="flex flex-wrap items-start gap-4">
            <FlaskHeader flask={f} width={390} />
            <FlaskHeader flask={f} width={320} />
          </div>
        </figure>
      ))}
    </Board>
  ),
}
