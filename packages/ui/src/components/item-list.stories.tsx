import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import {
  ChartCandlestickIcon,
  LandmarkIcon,
  PiggyBankIcon,
  TrendingUpIcon,
  UmbrellaIcon,
  WalletIcon,
} from 'lucide-react'

import { Button } from './button'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { ItemList, ItemListGroup, ItemListRow } from './item-list'

const meta = {
  title: 'Display/ItemList',
  component: ItemList,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The account lists of Épargne, the dashboard and Comptes (#267): no rules, one target per row (the whole row, chevron always last), a 32px type badge, left the name and institution · date, right the value and the gain or « à mettre à jour ». Group headings in sentence case with their total on the same line. The name and its second line are cut with … when they don’t fit; the value and its detail stay on the right, never cut (#262). With `stackWhenNarrow` (the account rows, #344), a row under 464px puts the value and its detail under the name, which takes the whole width and up to two lines.',
      },
    },
  },
} satisfies Meta<typeof ItemList>

export default meta
type Story = StoryObj<typeof meta>

/* Synthetic data only. */

const stale = (
  <span className="text-warning-foreground dark:text-warning inline-flex items-center gap-1 font-medium">
    <span aria-hidden className="bg-warning size-1.5 rounded-full" />à mettre à
    jour
  </span>
)

const gain = (text: string, good = true) => (
  <span className={good ? 'text-chart-delta-good' : 'text-chart-delta-bad'}>
    {text}
  </span>
)

function SavingsCard({ width }: { width: string }) {
  return (
    <Card className={width}>
      <CardHeader className="gap-1">
        <CardTitle>Épargne et placements</CardTitle>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-2xl font-semibold whitespace-nowrap tabular-nums">
            5 000,00 €
          </span>
          <span className="text-chart-delta-good text-sm whitespace-nowrap tabular-nums">
            +600,00 € de plus-value
          </span>
        </p>
      </CardHeader>
      <CardContent>
        <ItemList>
          <ItemListGroup title="Épargne disponible" total="1 500,00 €">
            <ItemListRow
              href="#"
              icon={<PiggyBankIcon />}
              iconClassName="bg-chart-3/15 text-chart-3"
              title="Livret A"
              subtitle="Banque A · au 31 oct."
              value="0,50 €"
            />
            <ItemListRow
              href="#"
              icon={<PiggyBankIcon />}
              iconClassName="bg-chart-3/15 text-chart-3"
              title="Livret de développement durable et solidaire du foyer"
              subtitle="Banque A · au 31 oct."
              value="1 499,50 €"
            />
          </ItemListGroup>
          <ItemListGroup title="Placements" total="3 500,00 €">
            <ItemListRow
              href="#"
              icon={<ChartCandlestickIcon />}
              iconClassName="bg-chart-7/15 text-chart-7"
              title="PEA"
              subtitle="Banque B · au 17 sept."
              value="200,00 €"
              detail={stale}
            />
            <ItemListRow
              href="#"
              icon={<UmbrellaIcon />}
              iconClassName="bg-chart-5/15 text-chart-5"
              title="Assurance vie Essentiel"
              subtitle="Banque A · au 31 oct."
              value="1 100,00 €"
              detail={gain('+270,00 € · +33 %')}
            />
            <ItemListRow
              href="#"
              icon={<UmbrellaIcon />}
              iconClassName="bg-chart-5/15 text-chart-5"
              title="Contrat Horizon"
              subtitle="Assurance vie · Assureur C · au 31 oct."
              value="2 000,00 €"
              detail={gain('-40,00 € · -2 %', false)}
            />
            <ItemListRow
              href="#"
              icon={<ChartCandlestickIcon />}
              iconClassName="bg-chart-7/15 text-chart-7"
              title="Compte-titres"
              subtitle="Banque B · au 31 oct."
              value="200,00 €"
            />
          </ItemListGroup>
          <div className="grid gap-2">
            <Button iconStart={<TrendingUpIcon />} className="w-full">
              Ajouter un placement
            </Button>
            <Button
              outline
              variant="secondary"
              iconStart={<LandmarkIcon />}
              className="w-full"
            >
              Ajouter un compte
            </Button>
          </div>
        </ItemList>
      </CardContent>
    </Card>
  )
}

/** Savings and investments, with and without a gain, a stale value. */
export const Savings: Story = {
  render: () => <SavingsCard width="w-[min(36rem,90vw)]" />,
}

/** At 320px the names are cut with …; the values, badges and chevrons stay. */
export const Narrow: Story = {
  render: () => <SavingsCard width="w-[320px]" />,
}

/** Rows without a group heading, and a highlighted row (net worth). */
export const WithoutHeading: Story = {
  render: () => (
    <Card className="w-[min(36rem,90vw)]">
      <CardContent>
        <ItemList>
          <ItemListGroup>
            <ItemListRow
              href="#"
              icon={<TrendingUpIcon />}
              iconClassName="bg-chart-savings/15 text-chart-savings"
              title="Patrimoine net"
              subtitle="Évolution et répartition"
              value="16 234,56 €"
              className="bg-muted/50 hover:bg-muted"
            />
          </ItemListGroup>
          <ItemListGroup title="Liquidités" total="6 234,56 €">
            <ItemListRow
              href="#"
              icon={<WalletIcon />}
              iconClassName="bg-chart-1/15 text-chart-1"
              title="Compte joint"
              subtitle="Compte courant · Banque A · au 3 nov."
              value="1 234,56 €"
            />
          </ItemListGroup>
        </ItemList>
      </CardContent>
    </Card>
  ),
}

/** Synthetic investments with a five-digit value and a four-digit gain. */
function InvestmentRows() {
  return (
    <ItemList>
      <ItemListGroup title="Investissements" total="39 251,67 €">
        <ItemListRow
          href="#"
          stackWhenNarrow
          icon={<ChartCandlestickIcon />}
          iconClassName="bg-chart-7/15 text-chart-7"
          title="PEA Banque B"
          subtitle="Banque B · au 31 oct."
          value="15 846,12 €"
          detail={gain('+2 045,99 € · +14,8 %')}
        />
        <ItemListRow
          href="#"
          stackWhenNarrow
          icon={<UmbrellaIcon />}
          iconClassName="bg-chart-5/15 text-chart-5"
          title="Assurance vie Horizon"
          subtitle="Assureur C · au 31 oct."
          value="23 405,55 €"
          detail={stale}
        />
      </ItemListGroup>
    </ItemList>
  )
}

function rowBoxes(canvasElement: HTMLElement) {
  const row = canvasElement.querySelector('[data-slot="item-list-row"]')!
  const title = row.querySelector('.font-medium')!
  const value = row.querySelector('.tabular-nums')!
  return {
    title,
    titleBox: title.getBoundingClientRect(),
    valueBox: value.getBoundingClientRect(),
  }
}

/**
 * `stackWhenNarrow` on a phone-wide card (#344, « C. Empilé »): under a
 * 464px row the name and its second line take the whole width, the name
 * wraps rather than being cut, and the value and the gain go under them.
 */
export const StackedWhenNarrow: Story = {
  render: () => (
    <Card className="w-[340px]">
      <CardContent>
        <InvestmentRows />
      </CardContent>
    </Card>
  ),
  play: async ({ canvasElement }) => {
    const { title, titleBox, valueBox } = rowBoxes(canvasElement)
    // The name isn't cut, and the value sits under it, not beside it.
    await expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
    await expect(valueBox.top).toBeGreaterThanOrEqual(titleBox.bottom)
    await expect(valueBox.left).toBeLessThan(titleBox.right)
  },
}

/** The same rows on a wide card keep the two columns. */
export const StackedWhenNarrowWide: Story = {
  render: () => (
    <Card className="w-[600px]">
      <CardContent>
        <InvestmentRows />
      </CardContent>
    </Card>
  ),
  play: async ({ canvasElement }) => {
    const { titleBox, valueBox } = rowBoxes(canvasElement)
    await expect(valueBox.left).toBeGreaterThanOrEqual(titleBox.right)
    await expect(valueBox.top).toBeLessThan(titleBox.bottom)
  },
}
