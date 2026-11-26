import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  ArrowLeftIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PlusIcon,
    WifiIcon,
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

import { cn } from '@capi/ui/lib/utils'

/**
 * #506 prototypes: three ways to put the buttons in glass (recipe « A ·
 * Givré », #503), on one phone screen with synthetic data. Deleted by the PR
 * that builds the chosen one.
 *
 * - voile: the recipe as written. Secondary and outline buttons are a faint
 *   tint (`--glass-fill`, or the intent's colour at 10 %), flat, no border.
 * - releve: secondary and outline buttons are raised like the fields and the
 *   segmented thumb: opaque, sheen, small shadow, the intent in the text.
 * - pilule: « voile » with every button fully round.
 *
 * The solid primary button, the segmented control and the icon buttons are
 * the same in all three (sheen + coloured shadow, glass track + raised thumb,
 * round icon buttons).
 */
type Option = 'voile' | 'releve' | 'pilule'

const meta: Meta = {
  title: 'Prototypes/#506 Boutons en verre',
  parameters: { layout: 'fullscreen' },
  tags: ['!autodocs'],
}
export default meta

const PRIMARY =
  'bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/25%),var(--glass-shadow-primary)]'
const RAISED =
  'bg-card dark:bg-[oklch(from_var(--card)_calc(l+0.05)_c_h)] shadow-[var(--glass-edge),var(--glass-shadow-sm)]'

const STYLES: Record<
  Option,
  {
    radius: string
    secondary: string
    primaryOutline: string
    danger: string
    chipOff: string
    chipOn: string
    badge: string
    badgeWarn: string
  }
> = {
  voile: {
    radius: 'rounded-control',
    secondary: 'bg-glass-fill text-foreground',
    primaryOutline: 'bg-primary/10 text-primary',
    danger: 'bg-destructive/10 text-destructive',
    chipOff: 'bg-glass-fill text-foreground',
    chipOn: 'bg-primary/12 text-primary',
    badge: 'bg-success/15 text-success-foreground dark:text-success',
    badgeWarn: 'bg-primary/10 text-primary',
  },
  releve: {
    radius: 'rounded-control',
    secondary: cn(RAISED, 'text-foreground'),
    primaryOutline: cn(RAISED, 'text-primary'),
    danger: cn(RAISED, 'text-destructive'),
    chipOff: cn(RAISED, 'text-foreground'),
    chipOn: 'bg-primary/12 text-primary',
    badge: 'bg-success/15 text-success-foreground dark:text-success',
    badgeWarn: 'bg-primary/10 text-primary',
  },
  pilule: {
    radius: 'rounded-full',
    secondary: 'bg-glass-fill text-foreground',
    primaryOutline: 'bg-primary/10 text-primary',
    danger: 'bg-destructive/10 text-destructive',
    chipOff: 'bg-glass-fill text-foreground',
    chipOn: 'bg-primary/12 text-primary',
    badge: 'bg-success/15 text-success-foreground dark:text-success',
    badgeWarn: 'bg-primary/10 text-primary',
  },
}

function Btn({
  className,
  radius,
  children,
}: {
  className: string
  radius: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex min-h-[2rem] items-center justify-center gap-1.5 px-3 text-sm font-medium whitespace-nowrap [&_svg]:size-[0.8rem]',
        radius,
        className,
      )}
    >
      {children}
    </span>
  )
}

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
        'bg-glass-fill text-foreground grid size-[2rem] shrink-0 place-items-center rounded-full [&_svg]:size-[0.85rem]',
        className,
      )}
    >
      {children}
    </span>
  )
}

function Screen({ option, dark }: { option: Option; dark?: boolean }) {
  const s = STYLES[option]
  useEffect(() => {
    document.documentElement.classList.toggle('dark', !!dark)
  }, [dark])
  return (
    <div
      data-glass-frame
      className="bg-background text-foreground mx-auto min-h-[844px] w-[390px] overflow-hidden"
    >
      {/* Chrome */}
      <div className="glass-chrome relative z-10 flex h-[2.4rem] items-center gap-2 px-2">
        <Round className="bg-transparent">
          <ArrowLeftIcon />
        </Round>
        <span className="text-base font-semibold">Abonnements</span>
        <Round className="ml-auto">
          <EllipsisVerticalIcon />
        </Round>
      </div>

      <div className="space-y-4 p-3">
        {/* Segmented control: glass track, raised thumb */}
        <div
          className={cn(
            'bg-glass-fill grid grid-cols-2 p-[3px] text-sm font-medium',
            s.radius,
          )}
        >
          <span
            className={cn(
              'bg-card dark:bg-[oklch(from_var(--card)_calc(l+0.05)_c_h)] grid min-h-[calc(2rem-6px)] place-items-center shadow-[var(--glass-edge),var(--glass-shadow-sm)]',
              option === 'pilule'
                ? 'rounded-full'
                : 'rounded-[calc(var(--radius-control)-3px)]',
            )}
          >
            Par mois
          </span>
          <span className="text-muted-foreground grid place-items-center">
            Par an
          </span>
        </div>

        {/* Filter chips (Toggle) */}
        <div className="flex gap-1.5">
          <Btn radius={s.radius} className={s.chipOn}>
            Tous
          </Btn>
          <Btn radius={s.radius} className={s.chipOff}>
            Confirmés
          </Btn>
          <Btn radius={s.radius} className={cn(s.chipOff, 'relative')}>
            Suggérés
            <span className="bg-primary text-primary-foreground ring-background absolute -top-1.5 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-semibold ring-2">
              3
            </span>
          </Btn>
        </div>

        {/* A card with its actions */}
        <section className="glass-card rounded-card space-y-3 p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-[1.8rem] place-items-center rounded-full bg-[#3b82f6] text-white">
              <WifiIcon className="size-[0.8rem]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Box internet test</p>
              <p className="text-muted-foreground text-xs">
                Le 4 de chaque mois
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">29,99 €</p>
              <span
                className={cn(
                  'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium',
                  s.badge,
                )}
              >
                Confirmé
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Btn radius={s.radius} className={cn(s.secondary, 'flex-1')}>
              <PencilIcon />
              Modifier
            </Btn>
            <Btn radius={s.radius} className={cn(s.danger, 'flex-1')}>
              Résilier
            </Btn>
          </div>
        </section>

        <section className="glass-card rounded-card space-y-3 p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-[1.8rem] place-items-center rounded-full bg-[#eb6834] text-white">
              ♪
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Musique en ligne</p>
              <p className="text-muted-foreground text-xs">
                Vu 3 fois · 10,99 €
              </p>
            </div>
            <span
              className={cn(
                'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium',
                s.badgeWarn,
              )}
            >
              Suggéré
            </span>
          </div>
          <div className="flex gap-2">
            <Btn radius={s.radius} className={cn(PRIMARY, 'flex-1')}>
              Confirmer
            </Btn>
            <Btn radius={s.radius} className={cn(s.secondary, 'flex-1')}>
              Ignorer
            </Btn>
          </div>
        </section>

        <Btn radius={s.radius} className={cn(s.primaryOutline, 'w-full')}>
          <PlusIcon />
          Ajouter un abonnement
        </Btn>

        {/* Ghost buttons stay text only */}
        <div className="flex justify-center">
          <Btn radius={s.radius} className="text-muted-foreground">
            Voir les abonnements terminés
          </Btn>
        </div>
      </div>

      {/* A sheet's footer: one blurred layer */}
      <div className="glass-panel rounded-t-[1.4rem] p-3 pb-6">
        <p className="mb-3 text-sm font-semibold">Modifier l’abonnement</p>
        <div className="grid grid-cols-2 gap-2">
          <Btn radius={s.radius} className={s.secondary}>
            Annuler
          </Btn>
          <Btn radius={s.radius} className={PRIMARY}>
            Enregistrer
          </Btn>
        </div>
      </div>
    </div>
  )
}

type Story = StoryObj<{ dark: boolean }>

export const Voile: Story = {
  args: { dark: false },
  render: ({ dark }) => <Screen option="voile" dark={dark} />,
}
export const Releve: Story = {
  name: 'Relevé',
  args: { dark: false },
  render: ({ dark }) => <Screen option="releve" dark={dark} />,
}
export const Pilule: Story = {
  args: { dark: false },
  render: ({ dark }) => <Screen option="pilule" dark={dark} />,
}
