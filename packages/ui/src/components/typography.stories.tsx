import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { DARK, expectContrast } from './chart/chart.story-utils'

import {
  TypographyBlockquote,
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyInlineCode,
  TypographyLarge,
  TypographyLead,
  TypographyMuted,
  TypographyP,
  TypographySmall,
} from './typography'

const meta: Meta = {
  title: 'Typography',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Semantic typography primitives — headings, body, lead, blockquote, inline code, large/small/muted helpers. Use them to keep the type scale consistent across the app.',
      },
    },
  },
}

export default meta
type Story = StoryObj

export const AllVariants: Story = {
  parameters: {
    docs: { description: { story: 'Every typography primitive at a glance.' } },
  },
  render: () => (
    <div className="max-w-prose space-y-4">
      <TypographyH1>Heading 1</TypographyH1>
      <TypographyH2>Heading 2</TypographyH2>
      <TypographyH3>Heading 3</TypographyH3>
      <TypographyH4>Heading 4</TypographyH4>
      <TypographyLead>
        This is a lead paragraph, used for introductions.
      </TypographyLead>
      <TypographyP>
        This is a regular paragraph with{' '}
        <TypographyInlineCode>inline code</TypographyInlineCode> inside it.
      </TypographyP>
      <TypographyLarge>Large text for emphasis</TypographyLarge>
      <TypographySmall>Small text for captions</TypographySmall>
      <TypographyMuted>Muted text for secondary info</TypographyMuted>
      <TypographyBlockquote>
        This is a blockquote for quoted content.
      </TypographyBlockquote>
    </div>
  ),
}

export const Headings: Story = {
  render: () => (
    <div className="space-y-2">
      <TypographyH1>Heading 1</TypographyH1>
      <TypographyH2>Heading 2</TypographyH2>
      <TypographyH3>Heading 3</TypographyH3>
      <TypographyH4>Heading 4</TypographyH4>
    </div>
  ),
}

export const Body: Story = {
  render: () => (
    <div className="max-w-prose space-y-2">
      <TypographyLead>Lead paragraph for intros.</TypographyLead>
      <TypographyP>
        A regular paragraph. Lorem ipsum dolor sit amet.
      </TypographyP>
      <TypographyMuted>Muted secondary text.</TypographyMuted>
    </div>
  ),
}

/** Status text tokens, on the two surfaces text sits on. */
const STATUS_TEXT = [
  { className: 'text-destructive', text: 'Erreur : fichier illisible' },
  { className: 'text-chart-delta-bad', text: 'Dépassement de 44,50 €' },
  { className: 'text-chart-delta-good', text: 'Objectif atteint' },
  { className: 'text-muted-foreground', text: 'Reste 80,00 €' },
] as const

/**
 * Error and status text on `card` and `background`: each pair must reach
 * 4.5:1 (WCAG AA, normal text), in light and dark.
 */
export const StatusTextContrast: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2">
      {(['bg-card', 'bg-background'] as const).map((surface) => (
        <div
          key={surface}
          data-surface
          className={`${surface} space-y-1 rounded-xl p-4 text-sm ring-1 ring-foreground/10`}
        >
          <p className="text-xs text-muted-foreground">{surface}</p>
          {STATUS_TEXT.map((item) => (
            <p key={item.className} data-status-text className={item.className}>
              {item.text}
            </p>
          ))}
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const surfaces = canvasElement.querySelectorAll('[data-surface]')
    await expect(surfaces).toHaveLength(2)
    for (const surface of surfaces) {
      const background = getComputedStyle(surface).backgroundColor
      for (const text of surface.querySelectorAll('[data-status-text]')) {
        await expectContrast(getComputedStyle(text).color, background)
      }
    }
  },
}

export const StatusTextContrastDark: Story = {
  ...StatusTextContrast,
  globals: DARK,
}
