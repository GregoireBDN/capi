import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  CategoryIcon,
  cn,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Toaster as CurrentToaster,
} from '@finances/ui'
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  MenuIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { toast, Toaster as Sonner, type ToasterProps } from 'sonner'

/**
 * Prototypes of calmer toasts (#380), shown to the owner before one is built
 * in `@finances/ui`'s `Toaster`. Real Sonner toasts, styled per direction,
 * over a mock page with synthetic data; not app code.
 *
 * Today (« Avant ») every type fills the toast with its colour (a lime green
 * for a routine success) and the action keeps Sonner's black block.
 *
 * A. Carte neutre : the app's card (popover surface, border, radius, soft
 *    shadow); only the icon carries the tone; « Annuler » a quiet primary
 *    text button (`Button` ghost primary). Errors add a red border.
 * B. Teinte douce : the same card, the icon on a tile of its tone at ~14 %
 *    (like `CategoryIcon`); the action an outline button (`Button` outline
 *    secondary). Errors add a red border.
 * C. Barre compacte : an inverse snackbar (dark in the light theme, light in
 *    the dark theme), one line, no icon on a success, « Annuler » as a
 *    coloured text action at its end; errors, warnings and loading keep an
 *    icon.
 *
 * Shared by A, B and C: the message in the normal text colour, its second
 * line in the muted one, 44px actions on touch screens, and on phones the
 * toasts rise above a sticky bottom bar instead of covering it (the « Barre
 * en bas » scene: « Avant » covers « Classer »). Every call site stays as it
 * is. Scenes: « Barre en bas » (an undo over the selection bar), « Feuille
 * ouverte » (an undo over an open bottom sheet), « Tous les types »
 * (expanded) and « Deux empilés » (as Sonner stacks them). Pick the theme in
 * the toolbar and the width in the viewport menu (Mobile 375 / Desktop).
 */
const meta: Meta<SceneArgs> = {
  title: 'Prototypes/Toasts (#380)',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
  argTypes: {
    scene: {
      control: 'inline-radio',
      options: ['bar', 'sheet', 'all', 'stacked'],
      labels: {
        bar: 'Barre en bas',
        sheet: 'Feuille ouverte',
        all: 'Tous les types',
        stacked: 'Deux empilés',
      },
    },
  },
  args: { scene: 'bar' },
}

export default meta

type Direction = 'avant' | 'a' | 'b' | 'c'
type Scene = 'bar' | 'sheet' | 'all' | 'stacked'
interface SceneArgs {
  scene: Scene
}

/* ---------------------------------------------------------------------------
 * The three directions, as Sonner props
 * ------------------------------------------------------------------------- */

/**
 * Height a sticky bottom bar takes on phones (`min-h-11` buttons, padding,
 * its 1rem offset): toasts rise by it while one is on screen. In the app the
 * bar would carry a data attribute and `:root:has(...)` set the variable, so
 * no call site changes.
 */
const BAR_CLEARANCE = 'var(--toast-bar-clearance, 0px)'

const shared: Partial<ToasterProps> = {
  offset: {
    top: 'calc(24px + env(safe-area-inset-top))',
    right: 'calc(24px + env(safe-area-inset-right))',
    bottom: 'calc(24px + env(safe-area-inset-bottom))',
    left: 'calc(24px + env(safe-area-inset-left))',
  },
  mobileOffset: {
    top: 'calc(16px + env(safe-area-inset-top))',
    right: 'calc(16px + env(safe-area-inset-right))',
    bottom: `calc(16px + env(safe-area-inset-bottom) + ${BAR_CLEARANCE})`,
    left: 'calc(16px + env(safe-area-inset-left))',
  },
  style: {
    '--width': '24rem',
    pointerEvents: 'auto',
  } as CSSProperties,
}

/** Layout common to A, B and C (the app's text sizes; Sonner's are 13px). */
const base = {
  toast: cn(
    'font-sans !gap-2.5 !rounded-xl !px-3 !py-2.5 !shadow-lg',
    '!items-center',
  ),
  content: '!min-w-0 !flex-1',
  title: '!text-[0.75rem] !font-medium !leading-snug',
  description: '!text-[0.68rem] !leading-snug',
  // 2rem is 44px under the app's 22px root (`h-11` would be 60px).
  actionButton: cn(
    '!h-[1.6rem] !shrink-0 !rounded-lg !px-3 !text-[0.75rem]',
    'pointer-coarse:!h-8',
    'focus-visible:!ring-3 focus-visible:!ring-ring/50',
  ),
}

const icons = (size: string) => ({
  success: <CircleCheckIcon className={size} />,
  info: <InfoIcon className={size} />,
  warning: <TriangleAlertIcon className={size} />,
  error: <OctagonXIcon className={size} />,
  loading: <Loader2Icon className={cn(size, 'animate-spin')} />,
})

/** The tone of each icon, readable on the card in both themes. */
const ICON_TONE = {
  success: '[&_[data-icon]]:text-chart-delta-good',
  error: '[&_[data-icon]]:text-destructive',
  warning:
    '[&_[data-icon]]:text-warning-foreground dark:[&_[data-icon]]:text-warning',
  info: '[&_[data-icon]]:text-info-foreground dark:[&_[data-icon]]:text-info',
  loading: '[&_[data-icon]]:text-muted-foreground',
}

const DIRECTIONS: Record<Exclude<Direction, 'avant'>, Partial<ToasterProps>> = {
  a: {
    icons: icons('size-4'),
    toastOptions: {
      classNames: {
        toast: cn(
          base.toast,
          '!border-border !bg-popover !text-popover-foreground',
        ),
        content: base.content,
        title: base.title,
        description: cn(base.description, '!text-muted-foreground'),
        icon: '!m-0 !size-4',
        actionButton: cn(
          base.actionButton,
          '!bg-transparent !px-2.5 !font-semibold !text-primary',
          'hover:!bg-primary/10',
        ),
        success: ICON_TONE.success,
        error: cn(ICON_TONE.error, '!border-destructive/50'),
        warning: ICON_TONE.warning,
        info: ICON_TONE.info,
        loading: ICON_TONE.loading,
      },
    },
  },
  b: {
    icons: icons('size-4'),
    toastOptions: {
      classNames: {
        toast: cn(
          base.toast,
          '!border-border !bg-popover !text-popover-foreground',
        ),
        content: base.content,
        title: base.title,
        description: cn(base.description, '!text-muted-foreground'),
        icon: '!m-0 !size-[1.6rem] !justify-center !rounded-lg',
        actionButton: cn(
          base.actionButton,
          '!border !border-secondary-foreground/30 !bg-background',
          '!font-medium !text-secondary-foreground hover:!bg-secondary',
        ),
        success: cn(
          ICON_TONE.success,
          '[&_[data-icon]]:bg-chart-delta-good/14',
        ),
        error: cn(
          ICON_TONE.error,
          '[&_[data-icon]]:bg-destructive/14 !border-destructive/50',
        ),
        warning: cn(ICON_TONE.warning, '[&_[data-icon]]:bg-warning/25'),
        info: cn(ICON_TONE.info, '[&_[data-icon]]:bg-info/25'),
        loading: cn(ICON_TONE.loading, '[&_[data-icon]]:bg-muted'),
      },
    },
  },
  c: {
    icons: icons('size-4'),
    toastOptions: {
      classNames: {
        toast: cn(
          base.toast,
          '!border-transparent !bg-foreground !text-background',
        ),
        content: base.content,
        title: base.title,
        description: cn(base.description, '!text-background/75'),
        icon: '!m-0 !size-4',
        actionButton: cn(
          base.actionButton,
          '!bg-transparent !px-2 !font-semibold',
          // The primary colour turned for the inverse surface.
          '!text-[oklch(from_var(--primary)_0.82_0.1_h)]',
          'dark:!text-[oklch(from_var(--primary)_0.45_0.12_h)]',
          'hover:!bg-background/10',
        ),
        // A routine success is the message alone.
        success: '[&_[data-icon]]:!hidden',
        error: cn(
          '[&_[data-icon]]:text-[oklch(from_var(--destructive)_0.75_c_h)]',
          'dark:[&_[data-icon]]:text-[oklch(from_var(--destructive)_0.5_c_h)]',
        ),
        warning:
          '[&_[data-icon]]:text-warning dark:[&_[data-icon]]:text-warning-foreground',
        info: '[&_[data-icon]]:text-info dark:[&_[data-icon]]:text-info-foreground',
        loading: '[&_[data-icon]]:text-background/75',
      },
    },
  },
}

/* ---------------------------------------------------------------------------
 * Toasts of each scene (synthetic)
 * ------------------------------------------------------------------------- */

const undo = { label: 'Annuler', onClick: () => undefined }

function fireScene(scene: Scene) {
  const keep = { duration: Infinity }
  switch (scene) {
    case 'bar':
      toast.success('3 opérations classées', {
        ...keep,
        description: 'Courses',
        action: undo,
      })
      break
    case 'sheet':
      toast.success('Catégorie modifiée', {
        ...keep,
        description: 'Courses · CARREFOUR MARKET',
        action: undo,
      })
      break
    case 'all':
      toast.loading('Import en cours…', keep)
      toast('Nouvelle version disponible', {
        ...keep,
        action: { label: 'Recharger', onClick: () => undefined },
      })
      toast.warning('2 opérations en conflit', {
        ...keep,
        description:
          'Elles ressemblent à des lignes déjà importées : vérifiez-les avant de valider.',
      })
      toast.error('Import impossible', {
        ...keep,
        description:
          'Ce fichier n’est pas un export CIC : la colonne « Libellé » est introuvable.',
      })
      toast.success('Budget enregistré', keep)
      toast.success('Catégorie modifiée', {
        ...keep,
        description: 'Courses · CARREFOUR MARKET',
        action: undo,
      })
      break
    case 'stacked':
      toast.success('Opération ajoutée', {
        ...keep,
        description: 'Boulangerie · 4,20 €',
        action: undo,
      })
      toast.success('Catégorie modifiée', {
        ...keep,
        description: 'Restaurants',
        action: undo,
      })
      break
  }
}

/* ---------------------------------------------------------------------------
 * Mock page
 * ------------------------------------------------------------------------- */

const ROWS = [
  {
    label: 'Carrefour Market',
    category: 'Courses',
    icon: 'shopping-cart',
    color: '#1baf7a',
    amount: '−42,80 €',
  },
  {
    label: 'Boulangerie Ange',
    category: 'Restaurants',
    icon: 'utensils',
    color: '#eb6834',
    amount: '−4,20 €',
  },
  {
    label: 'SNCF Connect',
    category: 'Transports',
    icon: 'bus',
    color: '#2a78d6',
    amount: '−36,00 €',
  },
  {
    label: 'Salaire novembre',
    category: 'Salaire',
    icon: 'sparkles',
    color: '#008300',
    amount: '+2 480,00 €',
  },
  {
    label: 'Free Mobile',
    category: 'Téléphone',
    icon: 'smartphone',
    color: '#6250d6',
    amount: '−15,99 €',
  },
  {
    label: 'Pharmacie du Marché',
    category: 'Santé',
    icon: 'pill',
    color: '#e87ba4',
    amount: '−12,40 €',
  },
  {
    label: 'Cinéma Pathé',
    category: 'Loisirs',
    icon: 'film',
    color: '#eda100',
    amount: '−11,50 €',
  },
  {
    label: 'Carrefour Market',
    category: 'Courses',
    icon: 'shopping-cart',
    color: '#1baf7a',
    amount: '−27,15 €',
  },
  {
    label: 'Total Énergies',
    category: 'Carburant',
    icon: 'fuel',
    color: '#e34948',
    amount: '−58,30 €',
  },
]

function MockPage({ bar }: { bar: boolean }) {
  return (
    <div className="bg-background text-foreground min-h-svh">
      <div className="bg-background/80 border-border sticky top-0 z-10 flex h-12 items-center gap-3 border-b px-4 backdrop-blur md:hidden">
        <MenuIcon className="size-5" aria-hidden />
        <span className="font-heading font-semibold">Finances</span>
      </div>
      <main className="@container mx-auto max-w-3xl space-y-4 p-4 pb-32 md:p-8">
        <h1 className="font-heading text-xl font-semibold md:text-2xl">
          Opérations
        </h1>
        <div className="bg-card border-border overflow-clip rounded-xl border">
          <div className="text-muted-foreground border-border border-b px-4 py-2 text-xs">
            Mardi 18 novembre
          </div>
          {ROWS.map((row, index) => (
            <div
              key={index}
              className={cn(
                'flex min-h-14 items-center gap-3 px-4 py-2',
                bar && index < 3 && 'bg-primary/8',
              )}
            >
              <CategoryIcon icon={row.icon} color={row.color} size="md" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{row.label}</div>
                <div className="text-muted-foreground truncate text-xs">
                  {row.category}
                </div>
              </div>
              <div
                className={cn(
                  'text-sm whitespace-nowrap',
                  row.amount.startsWith('+') && 'text-chart-delta-good',
                )}
              >
                {row.amount}
              </div>
            </div>
          ))}
        </div>
      </main>
      {bar && (
        <div
          data-sticky-bottom-bar
          className="bg-card border-border fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-3xl items-center gap-2 rounded-xl border p-2 shadow-lg"
        >
          <span className="min-w-0 flex-1 truncate px-2 text-sm">
            3 sélect.
          </span>
          <button
            type="button"
            className="border-border bg-background min-h-11 rounded-lg border px-3 text-sm"
          >
            Ponctuelle
          </button>
          <button
            type="button"
            className="bg-primary text-primary-foreground min-h-11 rounded-lg px-3 text-sm font-medium"
          >
            Classer
          </button>
        </div>
      )}
    </div>
  )
}

function MockSheet() {
  return (
    <Sheet open modal>
      <SheetContent side="bottom" className="max-h-[80svh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Carrefour Market</SheetTitle>
          <SheetDescription>18 nov. 2026 · −42,80 €</SheetDescription>
        </SheetHeader>
        <div className="divide-border divide-y px-4 pb-6">
          {[
            ['Catégorie', 'Courses ›'],
            ['Note', '›'],
            ['Ponctuelle', 'Non'],
            ['À revoir', 'Non'],
            ['Répartir', '›'],
          ].map(([name, value]) => (
            <div key={name} className="flex min-h-12 items-center text-sm">
              <span className="flex-1">{name}</span>
              <span className="text-muted-foreground">{value}</span>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ---------------------------------------------------------------------------
 * Scene
 * ------------------------------------------------------------------------- */

/** The app's toaster follows the `.dark` class of the root, like Storybook's. */
function useSonnerTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    const update = () =>
      setTheme(
        document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      )
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])
  return theme
}

/** The app's 22px root, so rem-based sizes read as they do on the phone. */
function useAppRoot() {
  useEffect(() => {
    const html = document.documentElement
    const previous = html.style.fontSize
    html.style.fontSize = '22px'
    return () => {
      html.style.fontSize = previous
    }
  }, [])
}

function ToastScene({
  direction,
  scene,
}: {
  direction: Direction
  scene: Scene
}) {
  useAppRoot()
  const theme = useSonnerTheme()
  const bar = scene === 'bar'

  useEffect(() => {
    const timer = window.setTimeout(() => fireScene(scene), 150)
    return () => {
      window.clearTimeout(timer)
      toast.dismiss()
    }
  }, [direction, scene])

  // Phones: toasts rise above a sticky bottom bar (A, B and C only).
  useEffect(() => {
    if (!bar || direction === 'avant') return
    const html = document.documentElement
    const element = document.querySelector<HTMLElement>(
      '[data-sticky-bottom-bar]',
    )
    if (!element) return
    const observer = new ResizeObserver(() =>
      html.style.setProperty(
        '--toast-bar-clearance',
        `${element.offsetHeight + 8}px`,
      ),
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
      html.style.removeProperty('--toast-bar-clearance')
    }
  }, [bar, direction])

  const layout: Partial<ToasterProps> = {
    expand: scene === 'all',
    visibleToasts: scene === 'all' ? 6 : 3,
  }

  return (
    <>
      <MockPage bar={bar} />
      {scene === 'sheet' && <MockSheet />}
      {direction === 'avant' ? (
        <CurrentToaster key={scene} {...layout} />
      ) : (
        <Sonner
          key={`${direction}-${scene}`}
          theme={theme}
          className="toaster group"
          {...shared}
          {...DIRECTIONS[direction]}
          {...layout}
        />
      )}
    </>
  )
}

type Story = StoryObj<SceneArgs>

export const Avant: Story = {
  name: 'Avant',
  render: ({ scene }) => <ToastScene direction="avant" scene={scene} />,
}

export const CarteNeutre: Story = {
  name: 'A. Carte neutre',
  render: ({ scene }) => <ToastScene direction="a" scene={scene} />,
}

export const TeinteDouce: Story = {
  name: 'B. Teinte douce',
  render: ({ scene }) => <ToastScene direction="b" scene={scene} />,
}

export const BarreCompacte: Story = {
  name: 'C. Barre compacte',
  render: ({ scene }) => <ToastScene direction="c" scene={scene} />,
}
