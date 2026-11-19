import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ItemList,
  ItemListGroup,
  ItemListRow,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@finances/ui'
import {
  CoinsIcon,
  CopyIcon,
  EllipsisIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

/**
 * « Clés et jetons » of the wallet page (#294), second round. The owner
 * found the first build odd: three rows with a chevron that all open the
 * same panel. Three ways out, synthetic data, the buttons do nothing but
 * open what they would open:
 *
 * 1. Une clé, un écran : each row opens its own screen (that key: its type,
 *    what its scan found, copy, change the type, remove; or the tokens
 *    read), « Ajouter une clé » at the end of the card. Like the rows of a
 *    transaction's editor (#280): one › = one screen.
 * 2. Tout sur la carte : no panel. The keys are plain rows with a « ⋯ »
 *    menu (copy, change the type, remove), the tokens are chips with ×,
 *    and the two « Ajouter » buttons close the card.
 * 3. Résumé + Gérer : the card only states what is read (no row looks
 *    tappable), and one full-width « Gérer les clés et jetons » opens the
 *    panel of the first build.
 */
const meta: Meta = {
  title: 'Prototypes/Wallet keys (#294)',
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile' },
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

/* ---------------------------------------------------------------------------
 * Synthetic data
 * ------------------------------------------------------------------------- */

interface Key {
  id: string
  title: string
  masked: string
  /** What its last scan found, or the chains an address is read on. */
  found: string
  type?: string
  chains: string
  warning?: boolean
}

const KEYS: Key[] = [
  {
    id: 'btc',
    title: 'Bitcoin',
    masked: 'zpub6rFR…GutZYs',
    found: '4 adresses utilisées',
    type: 'Native SegWit (bc1q…)',
    chains: 'Bitcoin',
  },
  {
    id: 'evm',
    title: 'Adresse EVM',
    masked: '0x000000…00dEaD',
    found: 'Ethereum, Arbitrum',
    chains: 'Ethereum, Arbitrum',
  },
]

const TOKENS = [
  { symbol: 'USDC', note: 'USD Coin' },
  { symbol: 'DEMO', note: 'Arbitrum · sans cours' },
]

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------- */

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-svh">
      <div className="space-y-6 p-4">
        <div className="bg-muted/50 text-muted-foreground rounded-xl p-4 text-sm">
          … valeur, avoirs et évolution au-dessus …
        </div>
        {children}
      </div>
    </div>
  )
}

function CardTop({ status }: { status?: string }) {
  return (
    <CardHeader>
      <CardTitle>Clés et jetons</CardTitle>
      {status && (
        <p className="text-muted-foreground mt-0.5 text-sm">{status}</p>
      )}
    </CardHeader>
  )
}

function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90svh] overflow-y-auto rounded-t-xl"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

/** « Type d’adresses   Native SegWit » lines of a key's screen. */
function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function TokenList({ removable }: { removable: boolean }) {
  return (
    <ul className="divide-y">
      {TOKENS.map((token) => (
        <li
          key={token.symbol}
          className="flex min-h-11 items-center gap-3 text-sm"
        >
          <CoinsIcon className="text-muted-foreground size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{token.symbol}</span>{' '}
            <span className="text-muted-foreground">{token.note}</span>
          </span>
          {removable && (
            <Button
              size="sm"
              iconOnly
              ghost
              variant="secondary"
              aria-label={`Ne plus lire ${token.symbol}`}
            >
              <Trash2Icon />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

/* ---------------------------------------------------------------------------
 * 1. Une clé, un écran
 * ------------------------------------------------------------------------- */

function OneScreenEach() {
  const [open, setOpen] = useState<string | null>(null)
  const key = KEYS.find((k) => k.id === open)
  return (
    <Page>
      <Card>
        <CardTop />
        <CardContent className="space-y-3">
          <ItemList>
            <ItemListGroup>
              {KEYS.map((k) => (
                <ItemListRow
                  key={k.id}
                  asChild
                  icon={<KeyRoundIcon />}
                  title={k.title}
                  subtitle={`${k.masked} · ${k.found}`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setOpen(k.id)}
                  />
                </ItemListRow>
              ))}
              <ItemListRow
                asChild
                icon={<CoinsIcon />}
                title="Jetons lus"
                subtitle="USDC, DEMO"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setOpen('tokens')}
                />
              </ItemListRow>
            </ItemListGroup>
          </ItemList>
          <Button
            className="w-full"
            outline
            variant="secondary"
            iconStart={<PlusIcon />}
          >
            Ajouter une clé
          </Button>
        </CardContent>
      </Card>

      <BottomSheet
        open={key !== undefined}
        onOpenChange={(o) => !o && setOpen(null)}
        title={key?.title ?? ''}
        description="Clé publique : elle permet de lire les soldes, jamais de dépenser."
      >
        {key && (
          <>
            <div className="bg-muted/50 flex items-center gap-2 rounded-lg px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-sm">
                {key.masked}
              </span>
              <Button
                size="sm"
                ghost
                variant="secondary"
                iconStart={<CopyIcon />}
              >
                Copier
              </Button>
            </div>
            <div>
              {key.type && (
                <Fact
                  label="Type d’adresses"
                  value={
                    <span className="inline-flex items-center gap-2">
                      {key.type}
                      <Button size="sm" ghost iconOnly aria-label="Changer">
                        <PencilIcon />
                      </Button>
                    </span>
                  }
                />
              )}
              <Fact label="Réseaux" value={key.chains} />
              {key.type && <Fact label="Dernier scan" value={key.found} />}
            </div>
            <Button
              className="w-full"
              outline
              variant="danger"
              iconStart={<Trash2Icon />}
            >
              Retirer la clé
            </Button>
          </>
        )}
      </BottomSheet>

      <BottomSheet
        open={open === 'tokens'}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Jetons lus"
        description="ETH, BNB et POL sont toujours lus. Ajoutez les jetons ERC-20 / BEP-20 de vos adresses."
      >
        <TokenList removable />
        <Button className="w-full" iconStart={<PlusIcon />}>
          Ajouter un jeton
        </Button>
      </BottomSheet>
    </Page>
  )
}

/* ---------------------------------------------------------------------------
 * 2. Tout sur la carte
 * ------------------------------------------------------------------------- */

function AllOnTheCard() {
  return (
    <Page>
      <Card>
        <CardTop />
        <CardContent className="space-y-5">
          <section className="space-y-1">
            <h3 className="text-muted-foreground text-sm font-medium">
              Clés publiques
            </h3>
            <ul>
              {KEYS.map((k) => (
                <li
                  key={k.id}
                  className="flex min-h-11 items-center gap-3 py-1.5 text-sm"
                >
                  <span className="bg-muted text-muted-foreground flex size-[32px] shrink-0 items-center justify-center rounded-full">
                    <KeyRoundIcon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{k.title}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {k.masked} · {k.found}
                    </span>
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        iconOnly
                        ghost
                        variant="secondary"
                        aria-label={`Actions de la clé ${k.title}`}
                      >
                        <EllipsisIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <CopyIcon /> Copier la clé
                      </DropdownMenuItem>
                      {k.type && (
                        <DropdownMenuItem>
                          <PencilIcon /> Changer le type d’adresses
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive">
                        <Trash2Icon /> Retirer la clé
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <h3 className="text-muted-foreground text-sm font-medium">
              Jetons lus
            </h3>
            <ul className="flex flex-wrap gap-2">
              {TOKENS.map((token) => (
                <li key={token.symbol}>
                  <span className="bg-muted inline-flex min-h-11 items-center gap-1 rounded-full pr-1 pl-3 text-sm">
                    {token.symbol}
                    <button
                      type="button"
                      aria-label={`Ne plus lire ${token.symbol}`}
                      className="hover:bg-background text-muted-foreground flex size-9 items-center justify-center rounded-full"
                    >
                      <XIcon className="size-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              ETH, BNB et POL sont toujours lus.
            </p>
          </section>
          <div className="space-y-2">
            <Button
              className="w-full"
              outline
              variant="secondary"
              iconStart={<PlusIcon />}
            >
              Ajouter une clé
            </Button>
            <Button
              className="w-full"
              outline
              variant="secondary"
              iconStart={<PlusIcon />}
            >
              Ajouter un jeton
            </Button>
          </div>
        </CardContent>
      </Card>
    </Page>
  )
}

/* ---------------------------------------------------------------------------
 * 3. Résumé + Gérer
 * ------------------------------------------------------------------------- */

function SummaryAndManage() {
  const [open, setOpen] = useState(false)
  return (
    <Page>
      <Card>
        <CardTop status="2 clés · 2 jetons ajoutés" />
        <CardContent className="space-y-4">
          <dl className="space-y-2 text-sm">
            {KEYS.map((k) => (
              <div key={k.id} className="flex items-start gap-3">
                <KeyRoundIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <div className="min-w-0">
                  <dt className="font-medium">{k.title}</dt>
                  <dd
                    className={cn(
                      'text-muted-foreground truncate text-xs',
                      k.warning && 'text-warning-foreground',
                    )}
                  >
                    {k.masked} · {k.found}
                  </dd>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-3">
              <CoinsIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <dt className="font-medium">Jetons lus</dt>
                <dd className="text-muted-foreground text-xs">USDC, DEMO</dd>
              </div>
            </div>
          </dl>
          <Button
            className="w-full"
            outline
            variant="secondary"
            iconStart={<Settings2Icon />}
            onClick={() => setOpen(true)}
          >
            Gérer les clés et jetons
          </Button>
        </CardContent>
      </Card>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Clés et jetons"
        description="Clés publiques du wallet Ledger, lues sur la blockchain."
      >
        <ul className="divide-y">
          {KEYS.map((k) => (
            <li key={k.id} className="flex min-h-11 items-center gap-3 text-sm">
              <KeyRoundIcon className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-mono">{k.masked}</span>
                <span className="text-muted-foreground block text-xs">
                  {k.type ? `${k.type} · ${k.found}` : k.chains}
                </span>
              </span>
              <Button
                size="sm"
                iconOnly
                ghost
                variant="secondary"
                aria-label="Retirer"
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          className="w-full"
          outline
          variant="secondary"
          iconStart={<PlusIcon />}
        >
          Ajouter une clé
        </Button>
        <p className="pt-2 text-sm font-medium">Jetons</p>
        <TokenList removable />
        <Button
          className="w-full"
          outline
          variant="secondary"
          iconStart={<PlusIcon />}
        >
          Ajouter un jeton
        </Button>
      </BottomSheet>
    </Page>
  )
}

export const UneCleUnEcran: StoryObj = {
  name: '1. Une clé, un écran',
  render: () => <OneScreenEach />,
}

export const ToutSurLaCarte: StoryObj = {
  name: '2. Tout sur la carte',
  render: () => <AllOnTheCard />,
}

export const ResumeEtGerer: StoryObj = {
  name: '3. Résumé + Gérer',
  render: () => <SummaryAndManage />,
}
