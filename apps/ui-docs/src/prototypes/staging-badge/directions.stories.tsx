import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlaskConicalIcon,
  MenuIcon,
  ShoppingCartIcon,
  TrainFrontIcon,
  UtensilsIcon,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@capi/ui/lib/utils'

/**
 * How staging could say it is staging (the owner, on #504's PR: today's
 * « STAGING » outlined badge is ugly). Each direction is the phone's chrome
 * (header + month bar) over a page; the toolbar switches light and dark.
 *
 * - Actuel: yellow header, outlined « STAGING » beside the mark.
 * - A · Pastille pleine: yellow header, a solid dark pill « staging ».
 * - B · Pastille seule: the normal header, only a yellow pill beside the logo.
 * - C · Liseré: the normal header, a yellow-and-dark hazard stripe on top.
 * - D · Logo signé: yellow header, no badge, « staging » written under Capi.
 * - E · Étiquette flottante: the normal header, a small yellow tag floating
 *   at the bottom of the screen.
 * - F · Icône: yellow header, a flask icon in a dark circle instead of a word.
 */
const meta: Meta = {
  title: 'Prototypes/Badge staging',
  parameters: { layout: 'fullscreen' },
  tags: ['!autodocs'],
}

export default meta

type Story = StoryObj

/* ------------------------------------------------------------- pieces */

function Avatar() {
  return (
    <span className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold">
      GB
    </span>
  )
}

function Burger() {
  return (
    <span className="text-foreground grid size-11 shrink-0 place-items-center">
      <MenuIcon className="size-[1.1rem]" />
    </span>
  )
}

function Wordmark({
  onBanner,
  small,
}: {
  onBanner?: boolean
  small?: boolean
}) {
  return (
    <span
      className={cn(
        'text-xl leading-none font-extrabold tracking-tight',
        small && 'text-base',
        onBanner ? 'text-foreground' : 'text-primary',
      )}
    >
      Capi
    </span>
  )
}

function Header({
  banner,
  style,
  children,
}: {
  banner?: boolean
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div
      style={style}
      className={cn(
        'bg-glass-chrome relative z-20 flex h-12 items-center gap-2 px-2 shadow-[inset_0_-1px_0_var(--border)]',
        banner && 'env-banner',
      )}
    >
      <Burger />
      {children}
      <span className="ml-auto pr-1">
        <Avatar />
      </span>
    </div>
  )
}

function MonthBar({ banner }: { banner?: boolean }) {
  return (
    <div className={cn('glass-chrome relative z-10', banner && 'env-banner')}>
      <div className="grid grid-cols-2 gap-[6px] px-2 pt-[10px]">
        <span className="bg-(--month-band) text-foreground flex h-11 items-center justify-center rounded-t-2xl text-sm font-semibold">
          Résumé
        </span>
        <span className="text-glass-muted-foreground flex h-11 items-center justify-center text-sm font-medium">
          Opérations
        </span>
      </div>
      <div className="bg-(--month-band) flex h-12 items-center gap-2 px-2">
        <span className="grid size-11 place-items-center">
          <ChevronLeftIcon className="size-[1rem]" />
        </span>
        <span className="flex flex-1 items-center justify-center gap-2 text-base font-semibold">
          <CalendarIcon className="size-[0.9rem]" />
          Novembre 2026
        </span>
        <span className="grid size-11 place-items-center">
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
    label: 'Supermarché',
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
    label: 'Boulangerie',
    amount: '−6,90 €',
  },
] as const

function Page() {
  return (
    <div className="space-y-3 p-3">
      <section className="glass-card rounded-card space-y-3 p-4">
        <h3 className="text-sm font-semibold">Dépenses du mois</h3>
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
            <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
            <span className="text-sm font-semibold whitespace-nowrap">
              {amount}
            </span>
          </div>
        ))}
      </section>
      <section className="glass-card rounded-card h-32 p-4">
        <h3 className="text-sm font-semibold">Budgets suivis</h3>
      </section>
    </div>
  )
}

/** A 375px phone: the chrome, a page, and whatever floats over it. */
function Phone({
  title,
  note,
  header,
  banner,
  top,
  floating,
  headerStyle,
}: {
  title: string
  note: string
  header: ReactNode
  banner?: boolean
  headerStyle?: CSSProperties
  top?: ReactNode
  floating?: ReactNode
}) {
  return (
    <figure className="w-[375px] space-y-1.5">
      <figcaption className="px-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground block text-xs">{note}</span>
      </figcaption>
      <div
        data-glass-frame
        className="bg-background text-foreground relative h-[560px] overflow-hidden rounded-[1.6rem] shadow-[0_0_0_1px_rgb(0_0_0/8%)]"
      >
        {top}
        <Header banner={banner} style={headerStyle}>
          {header}
        </Header>
        <MonthBar banner={banner} />
        <Page />
        {floating}
      </div>
    </figure>
  )
}

/* --------------------------------------------------------- directions */

function Current() {
  return (
    <Phone
      title="Actuel"
      note="Header jaune, « STAGING » encadré."
      banner
      header={
        <>
          <Wordmark onBanner />
          <span className="shrink-0 rounded-md border border-current/30 px-1.5 py-0.5 text-[0.6rem] leading-none font-semibold tracking-wide whitespace-nowrap uppercase">
            Staging
          </span>
        </>
      }
    />
  )
}

function SolidPill() {
  return (
    <Phone
      title="A · Pastille pleine"
      note="Header jaune, pastille sombre pleine, en minuscules."
      banner
      header={
        <>
          <Wordmark onBanner />
          <span className="bg-(--env-banner-foreground) text-(--env-banner) rounded-full px-2.5 py-1 text-xs leading-none font-semibold whitespace-nowrap">
            staging
          </span>
        </>
      }
    />
  )
}

function PillOnly() {
  return (
    <Phone
      title="B · Pastille seule"
      note="Header normal ; seule une pastille jaune dit staging."
      header={
        <>
          <Wordmark />
          <span className="bg-(--env-banner) text-(--env-banner-foreground) rounded-full px-2.5 py-1 text-xs leading-none font-semibold whitespace-nowrap shadow-[0_1px_2px_rgb(0_0_0/15%)]">
            staging
          </span>
        </>
      }
    />
  )
}

function Stripe() {
  return (
    <Phone
      title="C · Liseré"
      note="Header normal ; bande de chantier jaune et sombre tout en haut."
      top={
        <div
          aria-hidden
          className="h-1.5"
          style={{
            background:
              'repeating-linear-gradient(-45deg, var(--env-banner) 0 10px, var(--env-banner-foreground) 10px 20px)',
          }}
        />
      }
      header={
        <>
          <Wordmark />
          <span className="text-muted-foreground text-xs font-medium">
            staging
          </span>
        </>
      }
    />
  )
}

function SignedLogo() {
  return (
    <Phone
      title="D · Logo signé"
      note="Header jaune, pas de badge : « staging » écrit sous Capi."
      banner
      header={
        <span className="flex flex-col leading-none">
          <Wordmark onBanner small />
          <span className="text-muted-foreground mt-0.5 text-[0.45rem] font-semibold tracking-[0.25em] uppercase">
            staging
          </span>
        </span>
      }
    />
  )
}

function FloatingTag() {
  return (
    <Phone
      title="E · Étiquette flottante"
      note="Header normal ; petite étiquette jaune en bas de l'écran."
      header={<Wordmark />}
      floating={
        <span className="bg-(--env-banner) text-(--env-banner-foreground) absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap shadow-[0_4px_12px_rgb(0_0_0/20%)]">
          Staging · données de démo
        </span>
      }
    />
  )
}

function Icon() {
  return (
    <Phone
      title="F · Icône"
      note="Header jaune, une fiole dans un rond sombre au lieu d'un mot."
      banner
      header={
        <>
          <Wordmark onBanner />
          <span
            aria-label="Staging"
            className="bg-(--env-banner-foreground) text-(--env-banner) grid size-6 place-items-center rounded-full"
          >
            <FlaskConicalIcon className="size-[0.7rem]" />
          </span>
        </>
      }
    />
  )
}

/** Every direction side by side. */
export const Directions: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6 p-4">
      <Current />
      <SolidPill />
      <PillOnly />
      <Stripe />
      <SignedLogo />
      <FloatingTag />
      <Icon />
    </div>
  ),
}

/* ------------------------------------------- the flask, in other colours */

/**
 * The owner liked F (the flask) but not the yellow (#504's PR): the normal
 * header, the flask in a colour of its own, never the app's blue.
 */
const FLASKS: {
  title: string
  note: string
  badge: string
  glow: string
  word?: boolean
  tint?: string
  ink?: string
}[] = [
  {
    title: 'F1 · Améthyste',
    note: 'Dégradé violet → rose, petit halo.',
    badge: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
    glow: 'rgb(168 85 247 / 45%)',
  },
  {
    title: 'F2 · Coucher de soleil',
    note: 'Dégradé corail → orange → rose.',
    badge: 'linear-gradient(135deg, #fb7185, #f97316 55%, #f472b6)',
    glow: 'rgb(249 115 22 / 40%)',
  },
  {
    title: 'F3 · Menthe',
    note: 'Dégradé émeraude → turquoise, frais.',
    badge: 'linear-gradient(135deg, #10b981, #2dd4bf)',
    glow: 'rgb(16 185 129 / 40%)',
  },
  {
    title: 'F4 · Holographique',
    note: 'Reflet irisé, comme une carte holo.',
    badge:
      'conic-gradient(from 210deg, #f0abfc, #a5b4fc, #67e8f9, #86efac, #fde68a, #fca5a5, #f0abfc)',
    glow: 'rgb(192 132 252 / 40%)',
    ink: '#3b0764',
  },
  {
    title: 'F5 · Améthyste + mot',
    note: 'La fiole et « staging » dans une pastille violette.',
    badge: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
    glow: 'rgb(168 85 247 / 45%)',
    word: true,
  },
  {
    title: 'F6 · Améthyste + voile',
    note: 'La fiole violette et un léger voile violet sur le header.',
    badge: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
    glow: 'rgb(168 85 247 / 45%)',
    tint: 'linear-gradient(90deg, rgb(139 92 246 / 14%), rgb(236 72 153 / 10%))',
  },
]

function Flask({
  badge,
  glow,
  word,
  ink,
}: {
  badge: string
  glow: string
  word?: boolean
  ink?: string
}) {
  return (
    <span
      aria-label="Staging"
      className={cn(
        'grid shrink-0 place-items-center rounded-full text-white',
        word ? 'flex h-7 items-center gap-1 px-2.5' : 'size-7',
      )}
      style={{
        background: badge,
        color: ink,
        boxShadow: `0 2px 8px ${glow}, inset 0 1px 0 rgb(255 255 255 / 35%)`,
      }}
    >
      <FlaskConicalIcon
        className="size-[0.75rem] drop-shadow-[0_1px_1px_rgb(0_0_0/25%)]"
        strokeWidth={2.4}
      />
      {word && (
        <span className="text-xs leading-none font-semibold">staging</span>
      )}
    </span>
  )
}

/** The flask on the normal header, in six colours. */
export const Fiole: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6 p-4">
      {FLASKS.map(({ title, note, badge, glow, word, tint, ink }) => (
        <Phone
          key={title}
          title={title}
          note={note}
          headerStyle={tint ? { backgroundImage: tint } : undefined}
          header={
            <>
              <Wordmark />
              <Flask badge={badge} glow={glow} word={word} ink={ink} />
            </>
          }
        />
      ))}
    </div>
  ),
}
