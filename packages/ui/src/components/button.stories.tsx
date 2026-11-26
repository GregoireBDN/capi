import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import {
  CopyIcon,
  DownloadIcon,
  MailIcon,
  PlusIcon,
  ShareIcon,
  TrashIcon,
} from 'lucide-react'

import { Button } from './button'

const meta = {
  title: 'Forms/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Polymorphic button with semantic intent variants (primary, secondary, success, warning, danger, info), four visual styles (solid, outline, ghost, link), five sizes, icon slots, loading and full-width states. Built on top of Radix `Slot` so it can render `asChild` for any element.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'success', 'warning', 'danger', 'info'],
      description:
        'Semantic intent — drives both color and contextual meaning.',
      table: {
        category: 'Appearance',
        defaultValue: { summary: 'primary' },
        type: {
          summary: 'primary | secondary | success | warning | danger | info',
        },
      },
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'default', 'lg', 'xl'],
      description: 'Height + padding scale.',
      table: { category: 'Appearance', defaultValue: { summary: 'default' } },
    },
    outline: {
      control: 'boolean',
      description: 'Outline visual style (border + transparent background).',
      table: { category: 'Appearance' },
    },
    ghost: {
      control: 'boolean',
      description: 'Ghost visual style (no border, subtle hover background).',
      table: { category: 'Appearance' },
    },
    link: {
      control: 'boolean',
      description: 'Link visual style (text only with underline on hover).',
      table: { category: 'Appearance' },
    },
    pill: {
      control: 'boolean',
      description: 'Fully rounded shape.',
      table: { category: 'Appearance' },
    },
    fullWidth: {
      control: 'boolean',
      description: 'Stretches to the parent width.',
      table: { category: 'Layout' },
    },
    iconOnly: {
      control: 'boolean',
      description: 'Square icon-only button (no horizontal padding).',
      table: { category: 'Layout' },
    },
    iconStart: {
      control: false,
      description:
        'Icon rendered before the label (replaced by a spinner when `loading`).',
      table: { category: 'Content', type: { summary: 'ReactNode' } },
    },
    iconEnd: {
      control: false,
      description: 'Icon rendered after the label.',
      table: { category: 'Content', type: { summary: 'ReactNode' } },
    },
    children: {
      control: 'text',
      description: 'Button label / content.',
      table: { category: 'Content' },
    },
    loading: {
      control: 'boolean',
      description:
        'Replaces `iconStart` with a spinner and disables the button.',
      table: { category: 'State' },
    },
    disabled: {
      control: 'boolean',
      description: 'Disables interaction.',
      table: { category: 'State' },
    },
    asChild: {
      control: 'boolean',
      description: 'Render as the immediate child (via Radix `Slot`).',
      table: { category: 'Advanced' },
    },
    onClick: {
      action: 'clicked',
      table: { category: 'Events' },
    },
  },
  args: {
    children: 'Button',
    variant: 'primary',
    size: 'default',
    onClick: fn(),
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Use the Controls panel on the right to play with every prop.
 * This is the Interactive Story Playground — change `variant`, `size`,
 * toggle `outline` / `ghost` / `link`, flip `loading` / `disabled`, etc.
 */
export const Playground: Story = {}

export const Variants: Story = {
  parameters: {
    docs: {
      description: {
        story: 'All six semantic variants in their default solid style.',
      },
    },
  },
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="success">Success</Button>
      <Button variant="warning">Warning</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="info">Info</Button>
    </div>
  ),
}

export const Outline: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Outline visual style, in glass (#506): no border, a faint fill of the intent’s colour (secondary: the glass fill).',
      },
    },
  },
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary" outline>
        Primary
      </Button>
      <Button variant="secondary" outline>
        Secondary
      </Button>
      <Button variant="success" outline>
        Success
      </Button>
      <Button variant="warning" outline>
        Warning
      </Button>
      <Button variant="danger" outline>
        Danger
      </Button>
      <Button variant="info" outline>
        Info
      </Button>
    </div>
  ),
}

export const Ghost: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Ghost visual style — text only, the glass fill on hover.',
      },
    },
  },
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary" ghost>
        Primary
      </Button>
      <Button variant="secondary" ghost>
        Secondary
      </Button>
      <Button variant="success" ghost>
        Success
      </Button>
      <Button variant="danger" ghost>
        Danger
      </Button>
    </div>
  ),
}

export const Link: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Link visual style — text only with underline on hover.',
      },
    },
  },
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary" link>
        Primary Link
      </Button>
      <Button variant="danger" link>
        Danger Link
      </Button>
    </div>
  ),
}

const INTENTS = [
  'primary',
  'secondary',
  'success',
  'warning',
  'danger',
  'info',
] as const
const STYLES = ['solid', 'outline', 'ghost', 'link'] as const

/** Every intent × style, on the page and on a card (#506). */
function GlassMatrix() {
  const grid = (
    <div className="grid grid-cols-[auto_repeat(4,auto)] items-center gap-2">
      <span />
      {STYLES.map((style) => (
        <span key={style} className="text-muted-foreground text-xs">
          {style}
        </span>
      ))}
      {INTENTS.map((intent) => (
        <div key={intent} className="contents">
          <span className="text-muted-foreground text-xs">{intent}</span>
          {STYLES.map((style) => (
            <Button
              key={style}
              variant={intent}
              outline={style === 'outline'}
              ghost={style === 'ghost'}
              link={style === 'link'}
            >
              Libellé
            </Button>
          ))}
        </div>
      ))}
      <span className="text-muted-foreground text-xs">icon</span>
      <Button variant="secondary" iconOnly aria-label="Ajouter">
        <PlusIcon />
      </Button>
      <Button variant="secondary" outline iconOnly aria-label="Partager">
        <ShareIcon />
      </Button>
      <Button variant="secondary" ghost iconOnly aria-label="Copier">
        <CopyIcon />
      </Button>
      <Button variant="danger" outline iconOnly aria-label="Supprimer">
        <TrashIcon />
      </Button>
    </div>
  )
  return (
    <div className="bg-background flex flex-wrap gap-6 p-4">
      {grid}
      <div className="glass-card rounded-card p-4">{grid}</div>
    </div>
  )
}

/**
 * In glass (#506, « Voile »): solid buttons get a sheen and a soft shadow in
 * their colour; secondary and outline buttons are a faint fill with no
 * border; icon-only buttons are round. On the page and on a card.
 */
export const Glass: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <GlassMatrix />,
}

export const GlassDark: Story = {
  name: 'Glass (dark)',
  parameters: { layout: 'fullscreen' },
  globals: { theme: 'dark' },
  render: () => <GlassMatrix />,
}

export const Sizes: Story = {
  parameters: {
    docs: { description: { story: 'Five height + padding scales.' } },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="xs">Extra Small</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="xl">Extra Large</Button>
    </div>
  ),
}

export const WithIcons: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Icons via `iconStart` / `iconEnd` slots, plus `iconOnly` for round icon buttons.',
      },
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button iconStart={<MailIcon />}>Send Email</Button>
      <Button iconEnd={<DownloadIcon />}>Download</Button>
      <Button iconStart={<PlusIcon />} iconEnd={<ShareIcon />}>
        Create & Share
      </Button>
      <Button iconOnly aria-label="Copy">
        <CopyIcon />
      </Button>
      <Button variant="danger" iconOnly outline aria-label="Delete">
        <TrashIcon />
      </Button>
    </div>
  ),
}

export const States: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Loading replaces `iconStart` with a spinner and disables interaction.',
      },
    },
  },
  render: () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
        <Button fullWidth>Full Width</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button pill>Pill Shape</Button>
        <Button pill iconStart={<PlusIcon />}>
          Pill with Icon
        </Button>
      </div>
    </div>
  ),
}

/**
 * Interaction test — clicks the button and asserts the `onClick` spy
 * fired exactly once. Visible in the Interactions panel.
 */
export const ClickInteraction: Story = {
  args: { children: 'Click me' },
  play: async ({ args, canvas, userEvent, step }) => {
    await step('Click the button', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /click me/i }))
    })
    await step('Assert onClick fired', async () => {
      await expect(args.onClick).toHaveBeenCalledOnce()
    })
  },
}

/**
 * When `loading` is true the button must be disabled and clicks must not propagate.
 */
export const LoadingDoesNotFire: Story = {
  args: { children: 'Submitting…', loading: true },
  play: async ({ args, canvas, userEvent }) => {
    const btn = canvas.getByRole('button', { name: /submitting/i })
    await expect(btn).toBeDisabled()
    await userEvent.click(btn)
    await expect(args.onClick).not.toHaveBeenCalled()
  },
}

/**
 * A label wider than its container wraps (centred) instead of overflowing it,
 * e.g. on a 320px phone with the app's 22px root font. On touch screens
 * (`pointer: coarse`) every button also gets an invisible hit area of at least
 * 44×44 px (`touch-hitbox`), whatever its size.
 */
export const LongLabelInNarrowContainer: Story = {
  render: () => (
    <div className="w-40 rounded-md border border-dashed p-2">
      <Button fullWidth>Enregistrer les modifications</Button>
    </div>
  ),
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button')
    const box = button.parentElement!.getBoundingClientRect()
    await expect(button.getBoundingClientRect().width).toBeLessThanOrEqual(
      box.width,
    )
  },
}
