import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowLeftRightIcon, LineChartIcon, UploadIcon } from 'lucide-react'

import { Button } from './button'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { EmptyState } from './empty-state'

const meta = {
  title: 'Display/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The app’s empty state: an icon, one short line, an optional explanation and the action that fixes it. `page` stands on its own in a dashed frame; `inline` sits inside a card or a chart area.',
      },
    },
  },
  args: {
    title: 'Aucune opération en novembre 2026',
    description: 'Vos données s’arrêtent au 30 sept.',
  },
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const Page: Story = {
  render: (args) => (
    <div className="w-[min(28rem,90vw)]">
      <EmptyState
        {...args}
        icon={<ArrowLeftRightIcon />}
        actions={
          <>
            <Button>Voir septembre 2026</Button>
            <Button outline variant="secondary" iconStart={<UploadIcon />}>
              Importer un relevé
            </Button>
          </>
        }
      />
    </div>
  ),
}

export const InlineInCard: Story = {
  args: {
    title: 'Une seule valeur pour l’instant',
    description:
      'La courbe apparaîtra dès la deuxième valeur, à une autre date.',
  },
  render: (args) => (
    <Card className="w-[min(28rem,90vw)]">
      <CardHeader>
        <CardTitle>Évolution</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState
          {...args}
          variant="inline"
          icon={<LineChartIcon />}
          actions={
            <Button size="sm" outline variant="secondary">
              Mettre à jour la valeur
            </Button>
          }
        />
      </CardContent>
    </Card>
  ),
}

export const TitleOnly: Story = {
  args: { title: 'Aucune opération à revoir', description: undefined },
  render: (args) => (
    <div className="w-[min(28rem,90vw)]">
      <EmptyState {...args} />
    </div>
  ),
}
