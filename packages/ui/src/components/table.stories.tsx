import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Badge } from './badge'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './table'

const meta = {
  title: 'Display/Table',
  component: Table,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Styled native `<table>` primitives. Compose `Table` + `TableHeader` / `TableBody` / `TableFooter` + `TableRow` / `TableHead` / `TableCell` + `TableCaption`. Keeps semantic table structure intact for assistive tech.',
      },
    },
  },
} satisfies Meta<typeof Table>

export default meta
type Story = StoryObj<typeof meta>

export const Invoices: Story = {
  render: () => (
    <Table>
      <TableCaption>A list of recent invoices.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Method</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>INV001</TableCell>
          <TableCell>
            <Badge variant="success">Paid</Badge>
          </TableCell>
          <TableCell>Credit Card</TableCell>
          <TableCell className="text-right">$250.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>INV002</TableCell>
          <TableCell>
            <Badge variant="warning">Pending</Badge>
          </TableCell>
          <TableCell>PayPal</TableCell>
          <TableCell className="text-right">$150.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>INV003</TableCell>
          <TableCell>
            <Badge variant="danger">Overdue</Badge>
          </TableCell>
          <TableCell>Bank Transfer</TableCell>
          <TableCell className="text-right">$350.00</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="text-right">$750.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
}

/**
 * Wider than its container (a phone): the table scrolls sideways inside its
 * frame, a fade on the right edge shows there is more, and the scroller
 * becomes focusable so keyboard users can scroll it too.
 */
export const ScrollsInsideNarrowContainer: Story = {
  render: () => (
    <div className="w-72">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            {['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'].map((month) => (
              <TableHead key={month} className="text-right">
                {month}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {['Groceries', 'Transport', 'Leisure'].map((category) => (
            <TableRow key={category}>
              <TableCell>{category}</TableCell>
              {[120, 95, 143, 88, 101, 76].map((value, index) => (
                <TableCell key={index} className="text-right tabular-nums">
                  {value},00&nbsp;€
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const scroller = canvasElement.querySelector(
      '[data-slot="table-container"]',
    )
    await expect(scroller).toHaveAttribute('data-scrollable', 'true')
    await expect(scroller).toHaveAttribute('tabindex', '0')
  },
}
