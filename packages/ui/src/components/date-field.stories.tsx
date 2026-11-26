import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import { DateField } from './date-field'
import { Field, FieldDescription, FieldError, FieldLabel } from './field'

const meta = {
  title: 'Forms/DateField',
  component: DateField,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The app’s date field (#488), never the browser’s `<input type="date">`: the day as `jj/mm/aaaa`, opening `Calendar` in French (weeks from Monday) in a popover, or a bottom sheet on phones. Its value is a calendar day `YYYY-MM-DD` (`""` when none), never a `Date` moved by a time zone. `min` / `max` bound it, « Aujourd’hui » picks today in Europe/Paris, `clearable` offers « Effacer ». Name it with a `FieldLabel htmlFor`.',
      },
    },
  },
  args: { value: '', onChange: () => {} },
} satisfies Meta<typeof DateField>

export default meta
type Story = StoryObj<typeof meta>

function Controlled({
  initial,
  label,
  ...props
}: Omit<React.ComponentProps<typeof DateField>, 'value' | 'onChange'> & {
  initial: string
  label: string
}) {
  const [value, setValue] = React.useState(initial)
  return (
    <Field className="w-64">
      <FieldLabel htmlFor="story-date">{label}</FieldLabel>
      <DateField id="story-date" value={value} onChange={setValue} {...props} />
      <FieldDescription>Valeur : {value || '(aucune)'}</FieldDescription>
    </Field>
  )
}

export const Default: Story = {
  render: () => <Controlled initial="2026-11-15" label="Date" />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await step('Shows the day as dd/mm/yyyy', async () => {
      await expect(canvas.getByLabelText('Date')).toHaveTextContent(
        '15/11/2026',
      )
    })
    await step('Opens a French calendar and picks a day', async () => {
      await userEvent.click(canvas.getByLabelText('Date'))
      await expect(
        await body.findByRole('combobox', { name: 'Choisir le mois' }),
      ).toBeVisible()
      await userEvent.click(
        body.getByRole('button', { name: /samedi 7 novembre 2026/ }),
      )
      await expect(canvas.getByLabelText('Date')).toHaveTextContent(
        '07/11/2026',
      )
    })
  },
}

export const NeverInTheFuture: Story = {
  parameters: {
    docs: {
      description: {
        story:
          '`max` set to today: the days after it are faded and cannot be picked, the months after it are not offered.',
      },
    },
  },
  render: () => (
    <Controlled
      initial="2026-11-10"
      label="Date"
      today="2026-11-13"
      max="2026-11-13"
    />
  ),
}

export const OptionalAndEmpty: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'An optional field starts empty and offers « Effacer » once a day is chosen.',
      },
    },
  },
  render: () => <Controlled initial="" label="Échéance" clearable />,
}

export const Invalid: Story = {
  render: () => (
    <Field className="w-64" data-invalid>
      <FieldLabel htmlFor="story-invalid">Date</FieldLabel>
      <DateField
        id="story-invalid"
        value="2027-01-01"
        onChange={() => {}}
        aria-invalid
      />
      <FieldError>La date ne peut pas être dans le futur.</FieldError>
    </Field>
  ),
}
