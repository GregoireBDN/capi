import {
  Button,
  Calendar,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSteps,
  SheetTitle,
  Toaster,
} from '@capi/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  MenuIcon,
  PencilIcon,
  ShoppingCartIcon,
  SplitIcon,
  TagIcon,
  TrainFrontIcon,
  Trash2Icon,
  UtensilsIcon,
  WalletIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

/**
 * Prototype for #509 (frosted sheets, dialogs, menus, toasts): each floating
 * layer opened over a busy phone page, to compare before / after on screen.
 * Deleted by the PR that builds the chosen direction (#351).
 */
const meta: Meta = {
  title: 'Prototypes/Couches flottantes',
  parameters: { layout: 'fullscreen' },
  tags: ['!autodocs'],
}

export default meta

type Story = StoryObj

const ROWS = [
  [ShoppingCartIcon, '#eb6834', 'Supermarché du coin', '−42,18 €'],
  [TrainFrontIcon, '#3b82f6', 'Passe navigo', '−86,40 €'],
  [UtensilsIcon, '#16a34a', 'Boulangerie test', '−6,90 €'],
  [WalletIcon, '#a855f7', 'Virement reçu', '+1 250,00 €'],
  [ShoppingCartIcon, '#eb6834', 'Épicerie fine', '−18,75 €'],
  [TrainFrontIcon, '#3b82f6', 'Taxi test', '−23,10 €'],
] as const

/** A busy phone page: the app chrome, a title, cards of colourful rows. */
function Page({ menu }: { menu?: React.ReactNode }) {
  return (
    <div data-glass-frame className="bg-background text-foreground min-h-svh">
      <header className="glass-chrome sticky top-0 z-20 flex h-12 items-center gap-2 px-2">
        <span className="grid size-11 place-items-center">
          <MenuIcon className="size-[1.1rem]" />
        </span>
        <span className="text-primary text-xl font-extrabold tracking-tight">
          Capi
        </span>
        <span className="ml-auto">
          {menu ?? (
            <span className="bg-glass-fill grid size-11 place-items-center rounded-full">
              <EllipsisVerticalIcon className="size-[1rem]" />
            </span>
          )}
        </span>
      </header>
      <div className="glass-chrome flex h-12 items-center gap-2 px-2">
        <span className="bg-glass-fill grid size-11 place-items-center rounded-full">
          <ChevronLeftIcon className="size-[1rem]" />
        </span>
        <span className="flex flex-1 items-center justify-center gap-2 font-semibold">
          <CalendarIcon className="size-[0.9rem]" />
          Novembre 2026
        </span>
        <span className="bg-glass-fill grid size-11 place-items-center rounded-full">
          <ChevronRightIcon className="size-[1rem]" />
        </span>
      </div>
      <main className="space-y-4 p-3">
        <h1 className="text-2xl font-bold">Mouvements</h1>
        {[0, 1].map((card) => (
          <section key={card} className="glass-card rounded-card space-y-3 p-4">
            {ROWS.map(([Icon, color, label, amount], i) => (
              <div key={i} className="flex items-center gap-3">
                <span
                  className="grid size-9 place-items-center rounded-full text-white"
                  style={{ background: color }}
                >
                  <Icon className="size-[0.9rem]" />
                </span>
                <span className="flex-1 text-sm font-medium">{label}</span>
                <span
                  className={
                    amount.startsWith('+')
                      ? 'text-chart-delta-good text-sm font-semibold'
                      : 'text-destructive text-sm font-semibold'
                  }
                >
                  {amount}
                </span>
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  )
}

function Fields() {
  return (
    <div className="space-y-3 px-4">
      <div className="space-y-1.5">
        <Label htmlFor="libelle">Libellé</Label>
        <Input id="libelle" defaultValue="Supermarché du coin" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="montant">Montant</Label>
        <Input id="montant" defaultValue="42,18" inputMode="decimal" />
      </div>
    </div>
  )
}

export const FeuilleDuBas: Story = {
  render: () => (
    <>
      <Page />
      <Sheet defaultOpen>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Modifier</SheetTitle>
            <SheetDescription>Carte · 26 novembre</SheetDescription>
          </SheetHeader>
          <Fields />
          <SheetFooter className="flex-row">
            <Button variant="secondary" className="flex-1">
              Annuler
            </Button>
            <Button className="flex-1">Enregistrer</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  ),
}

export const Menu: Story = {
  render: () => (
    <Page
      menu={
        <DropdownMenu defaultOpen modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" iconOnly className="rounded-full">
              <EllipsisVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Supermarché du coin</DropdownMenuLabel>
            <DropdownMenuItem>
              <PencilIcon /> Modifier
            </DropdownMenuItem>
            <DropdownMenuItem>
              <TagIcon /> Changer de catégorie
            </DropdownMenuItem>
            <DropdownMenuItem>
              <SplitIcon /> Répartir
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2Icon /> Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  ),
}

export const Calendrier: Story = {
  render: function Render() {
    const [date, setDate] = useState<Date | undefined>(new Date(2026, 10, 26))
    return (
      <Page
        menu={
          <Popover defaultOpen modal={false}>
            <PopoverTrigger asChild>
              <Button variant="secondary" iconOnly className="rounded-full">
                <CalendarIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                defaultMonth={new Date(2026, 10, 1)}
              />
            </PopoverContent>
          </Popover>
        }
      />
    )
  },
}

export const Dialogue: Story = {
  render: () => (
    <>
      <Page />
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        onConfirm={() => {}}
        variant="danger"
        title="Supprimer l’opération ?"
        description="Supermarché du coin, 42,18 € le 26 novembre."
        confirmLabel="Supprimer"
      />
    </>
  ),
}

export const Toast: Story = {
  render: function Render() {
    useEffect(() => {
      const id = toast.success('Opération enregistrée', {
        description: 'Supermarché du coin · Courses',
        action: { label: 'Annuler', onClick: () => {} },
        duration: Infinity,
        id: 'ok',
      })
      const err = toast.error('Import refusé', {
        description: 'Le fichier n’est pas un relevé reconnu.',
        duration: Infinity,
        id: 'err',
      })
      return () => {
        toast.dismiss(id)
        toast.dismiss(err)
      }
    }, [])
    return (
      <>
        <Page />
        <Toaster position="bottom-center" expand />
      </>
    )
  },
}

const STEPS = [
  { key: 'montant', label: 'Montant', icon: <WalletIcon /> },
  { key: 'categorie', label: 'Catégorie', icon: <TagIcon /> },
  { key: 'partage', label: 'Partage', icon: <SplitIcon /> },
] as const

export const PleinEcran: Story = {
  render: () => (
    <>
      <Page />
      <Sheet defaultOpen>
        <SheetContent side="screen">
          <SheetBar
            title="Modifier l’opération"
            action={<SheetBarAction label="Enregistrer" />}
            steps={<SheetSteps steps={STEPS} current="categorie" />}
          />
          <div className="flex-1 space-y-4 overflow-y-auto py-4">
            <Fields />
            <div className="space-y-3 px-4">
              {ROWS.map(([Icon, color, label], i) => (
                <div
                  key={i}
                  className="glass-card rounded-card flex items-center gap-3 p-3"
                >
                  <span
                    className="grid size-9 place-items-center rounded-full text-white"
                    style={{ background: color }}
                  >
                    <Icon className="size-[0.9rem]" />
                  </span>
                  <span className="text-sm font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  ),
}
