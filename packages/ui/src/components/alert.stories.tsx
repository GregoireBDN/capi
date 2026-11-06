import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  InfoIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react'

import { Alert, AlertAction, AlertDescription, AlertTitle } from './alert'

const meta = {
  title: 'Feedback/Alert',
  component: Alert,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Inline message used to surface contextual information, success, warnings, or destructive errors. Compose with `AlertTitle`, `AlertDescription`, optional icon, and a dismiss `AlertAction`.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'success', 'warning', 'destructive'],
      description: 'Visual + semantic tone of the alert.',
      table: { category: 'Appearance', defaultValue: { summary: 'default' } },
    },
  },
  args: { variant: 'default' },
} satisfies Meta<typeof Alert>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {
  parameters: {
    docs: {
      description: { story: 'Play with the variant via the Controls panel.' },
    },
  },
  render: (args) => (
    <Alert {...args} className="w-96">
      <InfoIcon />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        Change the `variant` Control to see all tones.
      </AlertDescription>
    </Alert>
  ),
}

export const Info: Story = {
  render: () => (
    <Alert className="w-96">
      <InfoIcon />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add components to your app using the CLI.
      </AlertDescription>
    </Alert>
  ),
}

export const Success: Story = {
  render: () => (
    <Alert variant="success" className="w-96">
      <CheckCircle2Icon />
      <AlertTitle>Success</AlertTitle>
      <AlertDescription>
        Your changes have been saved successfully.
      </AlertDescription>
    </Alert>
  ),
}

export const Warning: Story = {
  render: () => (
    <Alert variant="warning" className="w-96">
      <TriangleAlertIcon />
      <AlertTitle>Warning</AlertTitle>
      <AlertDescription>
        This action may have unintended side effects.
      </AlertDescription>
      <AlertAction aria-label="Dismiss">
        <XIcon className="size-4" />
      </AlertAction>
    </Alert>
  ),
}

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" className="w-96">
      <AlertCircleIcon />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        Something went wrong. Please try again later.
      </AlertDescription>
      <AlertAction aria-label="Dismiss">
        <XIcon className="size-4" />
      </AlertAction>
    </Alert>
  ),
}

/* ----------------------------------------------------------------------------
 * Contrast checks: every tone in light, dark and at 375 px. The play test
 * paints the real computed colours on a canvas (the tinted background over
 * the page surface, then the text over it) and asserts WCAG 4.5:1.
 * ------------------------------------------------------------------------- */

const DARK = { theme: 'dark' } as const
const MOBILE = { viewport: { value: 'mobile', isRotated: false } } as const

/** Paints `colors` bottom to top on a 1×1 canvas and returns the sRGB pixel. */
function composite(colors: string[]): [number, number, number] {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) throw new Error('No 2D canvas context')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, 1, 1)
  for (const color of colors) {
    context.fillStyle = '#010203'
    context.fillStyle = color
    if (context.fillStyle === '#010203') {
      throw new Error(`Canvas cannot parse ${color}`)
    }
    context.fillRect(0, 0, 1, 1)
  }
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

/** Background layers of `element`, from the root down to the element. */
function backgroundLayers(element: Element): string[] {
  const layers: string[] = []
  for (let node: Element | null = element; node; node = node.parentElement) {
    layers.unshift(getComputedStyle(node).backgroundColor)
  }
  return layers
}

/** Contrast of the text of `element` against what is actually behind it. */
function textContrast(element: HTMLElement): number {
  const layers = backgroundLayers(element)
  const background = luminance(composite(layers))
  const text = luminance(
    composite([...layers, getComputedStyle(element).color]),
  )
  const [light, dark] =
    background > text ? [background, text] : [text, background]
  return (light + 0.05) / (dark + 0.05)
}

async function expectReadableText(canvasElement: HTMLElement) {
  const parts = canvasElement.querySelectorAll<HTMLElement>(
    '[data-slot=alert-title], [data-slot=alert-description]',
  )
  await expect(parts.length).toBeGreaterThan(0)
  await waitFor(() => {
    for (const part of parts) {
      const tone = part.closest('[data-tone]')?.getAttribute('data-tone')
      const ratio = textContrast(part)
      expect(
        ratio,
        `${tone} ${part.dataset.slot}: ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
}

const TONES = [
  { variant: 'default', icon: <InfoIcon />, title: 'Information' },
  { variant: 'success', icon: <CheckCircle2Icon />, title: 'Import terminé' },
  { variant: 'warning', icon: <TriangleAlertIcon />, title: 'Valeur ancienne' },
  { variant: 'destructive', icon: <AlertCircleIcon />, title: 'Erreur' },
] as const

function AllTonesList({ className }: { className?: string }) {
  return (
    <div className={className ?? 'grid w-96 gap-3'}>
      {TONES.map(({ variant, icon, title }) => (
        <Alert key={variant} variant={variant} data-tone={variant}>
          {icon}
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>
            Le texte de description reste lisible sur le fond teinté, en clair
            comme en sombre.
          </AlertDescription>
        </Alert>
      ))}
    </div>
  )
}

/** Every tone in the light theme; text checked at ≥ 4.5:1. */
export const AllTones: Story = {
  render: () => <AllTonesList />,
  play: async ({ canvasElement }) => expectReadableText(canvasElement),
}

/** Every tone in the dark theme; text checked at ≥ 4.5:1. */
export const AllTonesDark: Story = {
  globals: DARK,
  render: () => <AllTonesList />,
  play: async ({ canvasElement }) => expectReadableText(canvasElement),
}

/** 375 px, dark: the alerts take the full width. */
export const Mobile: Story = {
  globals: { ...MOBILE, ...DARK },
  parameters: { layout: 'padded' },
  render: () => <AllTonesList className="grid w-full gap-3" />,
  play: async ({ canvasElement }) => expectReadableText(canvasElement),
}
