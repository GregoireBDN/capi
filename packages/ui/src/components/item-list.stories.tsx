import type { Meta, StoryObj } from '@storybook/react-vite'
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
          'The account lists of Épargne, the dashboard and Comptes (#267): no rules, one target per row (the whole row, chevron always last), a 32px type badge, left the name and institution · date, right the value and the gain or « à mettre à jour ». Group headings in sentence case with their total on the same line. The values go under the name when both don’t fit.',
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

/** At 320px the values go under the names; the badges and chevrons stay. */
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
