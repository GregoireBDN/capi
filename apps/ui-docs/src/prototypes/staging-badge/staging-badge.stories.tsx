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
