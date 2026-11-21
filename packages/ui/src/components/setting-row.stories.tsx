import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  ArrowLeftRightIcon,
  ArrowRightIcon,
  FlagIcon,
  PencilIcon,
  SparkleIcon,
  StickyNoteIcon,
  TagIcon,
} from 'lucide-react'
import { useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { expect } from 'storybook/test'

import {
  SETTING_GROUP_CLASS,
  SettingRow,
  SettingSwitchRow,
} from './setting-row'

const meta = {
  title: 'Forms/SettingRow',
  component: SettingRow,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The settings rows of the transaction editor (#280), iPhone style: icon, label, value and › (`SettingRow`), or a switch saved at once (`SettingSwitchRow`), in a `SETTING_GROUP_CLASS` block. The label keeps its width and is never broken inside a word; the value is cut with « … » first; a label too long for the row wraps between its words (#325).',
      },
    },
  },
  args: { icon: TagIcon, label: 'Catégorie', value: 'Courses' },
} satisfies Meta<typeof SettingRow>

export default meta
type Story = StoryObj<typeof meta>

/* Synthetic data only. */

/** The app's 22px root (`apps/web` globals), on which `rem` sizes depend. */
function AppRootSize({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement
    const previous = root.style.fontSize
    root.style.fontSize = '22px'
    return () => {
      root.style.fontSize = previous
    }
  }, [])
  return children
}

function Switches() {
  const [oneOff, setOneOff] = useState(false)
  const [review, setReview] = useState(true)
  return (
    <>
      <SettingSwitchRow
        icon={SparkleIcon}
        label="Exceptionnelle"
        checked={oneOff}
        onCheckedChange={setOneOff}
      />
      <SettingSwitchRow
        icon={FlagIcon}
        label="À revoir"
        checked={review}
        onCheckedChange={setReview}
      />
    </>
  )
}

export const Default: Story = {
  render: (args) => (
    <div className="w-[360px] space-y-3">
      <div className={SETTING_GROUP_CLASS}>
        <SettingRow {...args} />
        <SettingRow icon={StickyNoteIcon} label="Note" value="Ajouter" />
        <Switches />
      </div>
      <div className={SETTING_GROUP_CLASS}>
        <SettingRow icon={PencilIcon} label="Corriger montant ou date" />
        <SettingRow icon={ArrowLeftRightIcon} label="Type" value="Dépense" />
      </div>
    </div>
  ),
}

/**
 * Long values in a 320px-wide sheet (the narrowest phone), under the app's
 * `overflow-wrap: anywhere`: « Catégorie » stays whole and the values are
 * cut with « … » (#325).
 */
export const LongValuesAt320: Story = {
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <AppRootSize>
        <Story />
      </AppRootSize>
    ),
  ],
  render: () => (
    // A 320px screen minus the sheet's 1rem sides, like the editor.
    <div className="w-[320px] space-y-3 px-4 py-4 [overflow-wrap:anywhere]">
      <div className={SETTING_GROUP_CLASS}>
        <SettingRow
          icon={TagIcon}
          label="Catégorie"
          value="Virement interne vers un compte d’épargne"
        />
        <SettingRow
          icon={ArrowRightIcon}
          label="Depuis"
          value="Livret de développement durable et solidaire"
        />
        <SettingRow
          icon={StickyNoteIcon}
          label="Note"
          value="Remboursement du week-end partagé avec les amis"
        />
        <Switches />
      </div>
      <div className={SETTING_GROUP_CLASS}>
        <SettingRow icon={PencilIcon} label="Corriger montant ou date" />
        <SettingRow
          icon={PencilIcon}
          label="Corriger montant ou date"
          value="Corrigée"
        />
        <SettingRow
          icon={ArrowLeftRightIcon}
          label="Type"
          value="Virement interne"
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const words = (element: Element) =>
      (element.textContent ?? '').split(/\s+/).filter(Boolean)
    for (const label of canvasElement.querySelectorAll<HTMLElement>(
      '[data-slot="setting-label"]',
    )) {
      // Every word of a label is on one line: never « Catégori / e ».
      const text = label.firstChild!
      const content = text.textContent ?? ''
      let start = 0
      for (const word of words(label)) {
        const index = content.indexOf(word, start)
        const range = document.createRange()
        range.setStart(text, index)
        range.setEnd(text, index + word.length)
        const lines = new Set(
          [...range.getClientRects()].map((rect) => Math.round(rect.top)),
        )
        await expect(lines.size, `« ${word} » on one line`).toBe(1)
        start = index + word.length
      }
      // Short labels stay on one line.
      if (words(label).length === 1) {
        const style = getComputedStyle(label)
        const height =
          label.getBoundingClientRect().height -
          parseFloat(style.paddingTop) -
          parseFloat(style.paddingBottom)
        await expect(height).toBeLessThan(parseFloat(style.lineHeight) * 1.5)
      }
    }
    for (const value of canvasElement.querySelectorAll<HTMLElement>(
      '[data-slot="setting-value"]',
    )) {
      // On one line, cut with « … » when too long, never past the row.
      const lineHeight = parseFloat(getComputedStyle(value).lineHeight)
      await expect(value.getBoundingClientRect().height).toBeLessThan(
        lineHeight * 1.5,
      )
      await expect(getComputedStyle(value).textOverflow).toBe('ellipsis')
      // Never squeezed out of sight (« Corrigée » beside a long label).
      await expect(value.clientWidth).toBeGreaterThan(40)
      const row = value.closest('[data-slot="setting-row"]')!
      await expect(value.getBoundingClientRect().right).toBeLessThanOrEqual(
        row.getBoundingClientRect().right,
      )
    }
    const category = canvasElement.querySelector<HTMLElement>(
      '[data-slot="setting-value"]',
    )!
    await expect(category.scrollWidth).toBeGreaterThan(category.clientWidth)
  },
}
