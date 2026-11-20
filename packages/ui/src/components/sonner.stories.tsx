import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { expect, screen, within } from 'storybook/test'
import { toast } from 'sonner'

import { Button } from './button'
import { Toaster } from './sonner'

const meta = {
  title: 'Feedback/Toast (Sonner)',
  component: Toaster,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          "Toast notifications powered by [sonner](https://sonner.emilkowal.ski), in the owner's « B. Teinte douce » (#380): the app's card, the icon on a tile of its tone, the action an outline button (44px on touch screens), errors with a red border. Mount a single `<Toaster />` at the root, then call `toast()`, `toast.success()`, `toast.error()`, `toast.warning()`, `toast.info()`, `toast.loading()` or `toast.promise()` from anywhere. On phones and desktops alike the toasts rise above a bar marked `data-sticky-bottom-bar`.",
      },
    },
  },
  decorators: [
    (Story, { args }) => (
      <>
        <Story />
        <Toaster {...args} />
      </>
    ),
  ],
} satisfies Meta<typeof Toaster>

export default meta
type Story = StoryObj<typeof meta>

const undo = { label: 'Annuler', onClick: () => undefined }

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button
        onClick={() =>
          toast.success('Catégorie modifiée', {
            description: 'Courses · CARREFOUR MARKET',
            action: undo,
          })
        }
      >
        Succès avec « Annuler »
      </Button>
      <Button
        variant="secondary"
        outline
        onClick={() => toast.success('Budget enregistré')}
      >
        Succès
      </Button>
      <Button
        variant="danger"
        onClick={() =>
          toast.error('Import impossible', {
            description:
              'Ce fichier n’est pas un export CIC : la colonne « Libellé » est introuvable.',
          })
        }
      >
        Erreur
      </Button>
      <Button
        variant="warning"
        onClick={() =>
          toast.warning('2 opérations en conflit', {
            description: 'Vérifiez-les avant de valider l’import.',
          })
        }
      >
        Avertissement
      </Button>
      <Button
        variant="info"
        onClick={() => toast.info('Les cours datent de plus d’une heure.')}
      >
        Information
      </Button>
      <Button
        variant="secondary"
        outline
        onClick={() =>
          toast('Nouvelle version disponible', {
            action: { label: 'Recharger', onClick: () => undefined },
          })
        }
      >
        Nouvelle version
      </Button>
      <Button
        variant="secondary"
        outline
        onClick={() => {
          const promise = new Promise((resolve) => setTimeout(resolve, 2000))
          toast.promise(promise, {
            loading: 'Import en cours…',
            success: 'Import terminé',
            error: 'Import impossible',
          })
        }}
      >
        Chargement
      </Button>
    </div>
  ),
}

/** Every kind at once, as the owner chose it (#380). */
export const AllKinds: Story = {
  parameters: { layout: 'fullscreen' },
  render: function AllKinds() {
    useEffect(() => {
      const keep = { duration: Infinity }
      const timer = setTimeout(() => {
        toast.loading('Import en cours…', { ...keep, id: 'loading' })
        toast('Nouvelle version disponible', {
          ...keep,
          id: 'version',
          action: { label: 'Recharger', onClick: () => undefined },
        })
        toast.warning('2 opérations en conflit', {
          ...keep,
          id: 'conflict',
          description: 'Vérifiez-les avant de valider l’import.',
        })
        toast.error('Import impossible', {
          ...keep,
          id: 'error',
          description:
            'Ce fichier n’est pas un export CIC : la colonne « Libellé » est introuvable.',
        })
        toast.success('Budget enregistré', { ...keep, id: 'budget' })
        toast.success('Catégorie modifiée', {
          ...keep,
          id: 'category',
          description: 'Courses · CARREFOUR MARKET',
          action: undo,
        })
      }, 100)
      return () => {
        clearTimeout(timer)
        toast.dismiss()
      }
    }, [])
    return <div className="bg-background min-h-svh" />
  },
  args: { expand: true, visibleToasts: 6 },
}

/** A toast rises above a sticky bottom bar instead of covering it. */
export const AboveStickyBar: Story = {
  parameters: { layout: 'fullscreen' },
  render: function AboveStickyBar() {
    useEffect(() => {
      const timer = setTimeout(
        () =>
          toast.success('3 opérations classées', {
            id: 'classified',
            duration: Infinity,
            description: 'Courses',
            action: undo,
          }),
        100,
      )
      return () => {
        clearTimeout(timer)
        toast.dismiss()
      }
    }, [])
    return (
      <div className="bg-background min-h-[200svh] p-4">
        <div
          data-sticky-bottom-bar
          className="bg-card fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] flex items-center gap-2 rounded-xl border p-3 shadow-lg"
        >
          <span className="flex-1 text-sm">3 sélectionnées</span>
          <Button>Classer</Button>
        </div>
      </div>
    )
  },
}

export const ClickShowsToast: Story = {
  render: () => (
    <Button onClick={() => toast.success('Enregistré')}>Afficher</Button>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /afficher/i }))
    await expect(await screen.findByText(/enregistré/i)).toBeVisible()
  },
}
