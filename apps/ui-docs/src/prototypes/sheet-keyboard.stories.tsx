import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import {
  KeyboardSheetBoard,
  KeyboardSheetPrototype,
  type Direction,
  type PrototypeKind,
} from './sheet-keyboard/KeyboardSheetPrototype'

/**
 * #385: a bottom sheet with typed fields must not jump a second time when
 * the phone keyboard comes up. Directions A–D beside today's behaviour, on a
 * short sheet, a long form and a stepped sheet. Storybook can't show the iOS
 * keyboard: « Avec clavier » draws a 336px one where it would be; the real
 * test is the phone page (`/proto-385`).
 */
const meta: Meta<typeof KeyboardSheetPrototype> = {
  title: 'Prototypes/Clavier et panneaux (#385)',
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile2' },
  },
}
export default meta

type Story = StoryObj<{
  direction: Direction
  kind: PrototypeKind
  simulateKeyboard: boolean
}>

function Open({
  direction,
  kind,
  simulateKeyboard,
}: {
  direction: Direction
  kind: PrototypeKind
  simulateKeyboard: boolean
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="p-4">
      <button type="button" className="underline" onClick={() => setOpen(true)}>
        Rouvrir
      </button>
      <KeyboardSheetPrototype
        key={`${direction}-${kind}-${simulateKeyboard}`}
        direction={direction}
        kind={kind}
        open={open}
        onOpenChange={setOpen}
        simulateKeyboard={simulateKeyboard}
      />
    </div>
  )
}

const story = (
  direction: Direction,
  kind: PrototypeKind,
  simulateKeyboard = false,
): Story => ({
  args: { direction, kind, simulateKeyboard },
  argTypes: {
    direction: {
      control: 'inline-radio',
      options: ['now', 'A', 'B', 'C', 'D'],
    },
    kind: { control: 'inline-radio', options: ['value', 'account', 'crypto'] },
  },
  render: (args) => <Open {...args} />,
})

export const Board: Story = {
  render: () => (
    <div className="@container p-4">
      <KeyboardSheetBoard />
    </div>
  ),
}

export const ValueNow = story('now', 'value')
export const ValueNowKeyboard = story('now', 'value', true)
export const ValueA = story('A', 'value')
export const ValueAKeyboard = story('A', 'value', true)
export const ValueB = story('B', 'value')
export const ValueBKeyboard = story('B', 'value', true)
export const ValueC = story('C', 'value')
export const ValueD = story('D', 'value')
export const AccountNowKeyboard = story('now', 'account', true)
export const AccountA = story('A', 'account')
export const AccountAKeyboard = story('A', 'account', true)
export const AccountB = story('B', 'account')
export const AccountBKeyboard = story('B', 'account', true)
export const AccountC = story('C', 'account')
export const CryptoNow = story('now', 'crypto')
export const CryptoA = story('A', 'crypto')
export const CryptoB = story('B', 'crypto')
export const CryptoC = story('C', 'crypto')
export const CryptoD = story('D', 'crypto')
