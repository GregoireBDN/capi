import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Button,
  cn,
  Input,
  ItemList,
  ItemListGroup,
  ItemListRow,
  SegmentedControl,
  SegmentedControlItem,
  SETTING_GROUP_CLASS,
  SettingRow,
} from '@finances/ui'
import {
  ArrowLeftRightIcon,
  CalculatorIcon,
  HandCoinsIcon,
  MinusIcon,
  PlusIcon,
  ScaleIcon,
  StickyNoteIcon,
  TagIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  Avatar,
  CategoryOf,
  centsText,
  contactOf,
  CONTACTS,
  day,
  divideHalfEven,
  euros,
  isAmountText,
  MockCard,
  owedBy,
  PageFrame,
  PageTitle,
  Panels,
  parseCents,
  ScreenHeader,
  SheetFrame,
  Tile,
  TOTAL_OWED_CENTS,
  type CategoryKey,
} from './owed.fixtures'

/**
 * Prototypes of the other direction of #359, asked by the owner on 20 Nov:
 * money the owner owes (someone paid for him, he pays them back later).
 * Synthetic names and amounts.
 *
 * The logic proposed (story « Logique ») mirrors « On me doit »: the owner's
 * part counts as his spending in its category on the day of the expense,
 * even before any money leaves his account; his repayment transfer is
 * neither income nor spending, it settles the debt; a debt the other person
 * lets go leaves his spending (it was a gift). What he owes is shown beside
 * the net worth, never in it, like what he is owed.
 *
 * Entering a debt (the owner types only his part; the total is a help):
 *   A. « Payé par… » in the quick entry: « Payé avec » gains « Quelqu'un
 *      d'autre » → a person; the amount is his part, « Calculer depuis
 *      l'addition » helps.
 *   B. L'addition puis ma part: who paid, the total, then « Moitié » /
 *      « Parts égales entre n » / « Montant » → « Ma part ».
 *   C. Depuis la personne: « Je dois de l'argent à Sam » on the person's
 *      page, a short sheet.
 *
 * The balance:
 *   A. Net par personne: one signed balance per person (« Sam vous doit
 *      45 € », « Vous devez 20 € à Julie »), both sides in the person's page
 *      and « Compenser » when both owe each other.
 *   B. Deux listes: « On me doit » / « Je dois », never netted.
 *
 * Repaying: an outgoing transfer is linked to what the owner owes, the
 * mirror of « C'est un remboursement ».
 */
const meta: Meta = {
  title: 'Prototypes/Money owed (#359)/Je dois',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

const GROUP = SETTING_GROUP_CLASS

function noop(event: { preventDefault: () => void }) {
  event.preventDefault()
}

/* ---------------------------------------------------------------------------
 * Synthetic debts: what the owner owes
 * ------------------------------------------------------------------------- */

interface Debt {
  id: string
  contactId: string
  label: string
  category: CategoryKey
  date: string
  /** What the other person paid. */
  paidCents: number
  /** The owner's part: what he owes. */
  mineCents: number
}

const DEBTS: Debt[] = [
  {
    id: 'd1',
    contactId: 'julie',
    label: 'Location Airbnb',
    category: 'leisure',
    date: '2026-10-24',
    paidCents: 33_600,
    mineCents: 8_400,
  },
  {
    id: 'd2',
    contactId: 'sam',
    label: 'Bistrot du port',
    category: 'restaurants',
    date: '2026-11-15',
    paidCents: 9_000,
    mineCents: 3_000,
  },
]

const iOwe = (contactId: string) =>
  DEBTS.filter((debt) => debt.contactId === contactId).reduce(
    (sum, debt) => sum + debt.mineCents,
    0,
  )

/** 114 €: everything the owner owes. */
const TOTAL_I_OWE = DEBTS.reduce((sum, debt) => sum + debt.mineCents, 0)

/** + they owe the owner, − the owner owes them. */
const netOf = (contactId: string) => owedBy(contactId) - iOwe(contactId)

const PEOPLE = CONTACTS.filter(
  (contact) => owedBy(contact.id) > 0 || iOwe(contact.id) > 0,
)

/* ---------------------------------------------------------------------------
 * Logique
 * ------------------------------------------------------------------------- */

interface Rule {
  event: string
  spending: ReactNode
  balance: ReactNode
}

const RULES: Rule[] = [
  {
    event: 'Sam paie le bistrot 90 €, votre part est 30 €',
    spending: 'Restaurants +30 € le 15 nov.',
    balance: 'Je dois à Sam +30 €',
  },
  {
    event: 'Vous virez 30 € à Sam (le 2 déc.)',
    spending: 'Rien : ni dépense ni revenu',
    balance: 'Je dois à Sam −30 €',
  },
  {
    event: 'Sam ne veut pas être remboursé',
    spending: 'Restaurants −30 € (c’était un cadeau)',
    balance: 'Je dois à Sam −30 €',
  },
  {
    event: 'Sam vous doit aussi 75 € : « Compenser »',
    spending: 'Rien',
    balance: 'Je dois −30 €, Sam me doit −30 € (reste 45 €)',
  },
  {
    event: 'Vous avez payé le resto pour Sam (sens actuel)',
    spending: 'Restaurants : votre part seulement',
    balance: 'Sam me doit +30 €',
  },
]

function Logic() {
  return (
    <PageFrame>
      <PageTitle
        title="Logique proposée"
        description="Ce qui compte, c’est votre part, le jour de la dépense. L’argent qui circule ensuite entre vous ne fait que régler."
      />
      <ul className="space-y-2">
        {RULES.map((rule) => (
          <li key={rule.event} className={cn(GROUP, 'divide-y-0 p-3 text-sm')}>
            <p className="font-medium break-normal">{rule.event}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              <span className="text-foreground">Dépenses :</span>{' '}
              {rule.spending}
            </p>
            <p className="text-muted-foreground text-xs">
              <span className="text-foreground">Solde :</span> {rule.balance}
            </p>
          </li>
        ))}
      </ul>
      <MockCard title="Pourquoi saisir seulement votre part">
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          <li>
            Seule votre part touche vos dépenses et ce que vous devez : le total
            payé par l’autre n’entre dans aucun chiffre.
          </li>
          <li>
            Le total n’est qu’une aide au calcul (« 90 € à trois »), proposée
            sans être obligatoire, et gardé en note.
          </li>
          <li>
            Vos dépenses du mois sont justes même si vous remboursez le mois
            suivant, comme pour ce qu’on vous doit.
          </li>
          <li>
            Le patrimoine ne compte que l’argent détenu : « Je dois » est
            affiché à côté, comme « On me doit ».
          </li>
        </ul>
      </MockCard>
    </PageFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Saisie — shared pieces
 * ------------------------------------------------------------------------- */

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border px-3 text-sm',
        on ? 'border-primary bg-primary/10 font-medium' : 'bg-muted/60',
      )}
    >
      {children}
    </button>
  )
}

function PersonChips({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CONTACTS.map((contact) => (
        <Chip
          key={contact.id}
          on={value === contact.id}
          onClick={() => onChange(contact.id)}
        >
          <Avatar contact={contact} size="sm" />
          {contact.name}
        </Chip>
      ))}
      <Chip on={false} onClick={() => undefined}>
        <PlusIcon aria-hidden className="size-4" />
        Un nom…
      </Chip>
    </div>
  )
}

function AmountInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (text: string) => void
}) {
  return (
    <span className="flex items-center gap-1">
      <Input
        aria-label={label}
        inputMode="decimal"
        value={value}
        onChange={(event) => {
          if (isAmountText(event.target.value)) onChange(event.target.value)
        }}
        className="h-11 w-[6.5rem] text-right tabular-nums"
      />
      <span className="text-muted-foreground text-sm">€</span>
    </span>
  )
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground px-1 text-xs font-medium">{children}</p>
  )
}

/** « Restaurants · 15 nov. · Bistrot du port », as the details step. */
function DetailsRecap() {
  return (
    <div className="flex items-center gap-3 px-1 text-sm">
      <CategoryOf category="restaurants" />
      <span className="min-w-0 flex-1 break-normal">
        Restaurants · Bistrot du port
      </span>
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {day('2026-11-15')}
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Saisie — A. « Payé par… » dans la saisie
 * ------------------------------------------------------------------------- */

function EntryA() {
  const [payer, setPayer] = useState<'account' | 'voucher' | 'other'>('other')
  const [who, setWho] = useState('sam')
  const [helper, setHelper] = useState(false)
  const [total, setTotal] = useState('90')
  const [people, setPeople] = useState(3)
  const totalCents = parseCents(total) ?? 0
  const share = divideHalfEven(totalCents, people)
  const [mine, setMine] = useState('30,00')
  const name = contactOf(who).name
  return (
    <SheetFrame
      footer={
        <Button className="min-h-11 w-full">
          {payer === 'other'
            ? `Ajouter · je dois ${euros(parseCents(mine) ?? 0)} à ${name}`
            : 'Ajouter'}
        </Button>
      }
    >
      <ScreenHeader
        title="Détails"
        step="Étape 3 sur 3"
        onBack={() => undefined}
      />
      <DetailsRecap />
      <Label>Payé avec</Label>
      <div className="flex flex-wrap gap-2">
        <Chip on={payer === 'account'} onClick={() => setPayer('account')}>
          Compte courant
        </Chip>
        <Chip on={payer === 'voucher'} onClick={() => setPayer('voucher')}>
          Titres-restaurant
        </Chip>
        <Chip on={payer === 'other'} onClick={() => setPayer('other')}>
          Quelqu’un d’autre
        </Chip>
      </div>
      {payer === 'other' && (
        <>
          <Label>Qui a payé ?</Label>
          <PersonChips value={who} onChange={setWho} />
          <div className="bg-muted/60 space-y-2 rounded-md p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium break-normal">
                Ma part, à rendre à {name}
              </span>
              <AmountInput label="Ma part" value={mine} onChange={setMine} />
            </div>
            {helper ? (
              <div className="space-y-2 border-t pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">Addition</span>
                  <AmountInput
                    label="Addition"
                    value={total}
                    onChange={setTotal}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">Personnes, vous compris</span>
                  <span className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      iconOnly
                      className="size-11"
                      aria-label="Une personne de moins"
                      onClick={() => setPeople((n) => Math.max(2, n - 1))}
                    >
                      <MinusIcon aria-hidden />
                    </Button>
                    <span className="w-8 text-center tabular-nums">
                      {people}
                    </span>
                    <Button
                      variant="secondary"
                      iconOnly
                      className="size-11"
                      aria-label="Une personne de plus"
                      onClick={() => setPeople((n) => Math.min(20, n + 1))}
                    >
                      <PlusIcon aria-hidden />
                    </Button>
                  </span>
                </div>
                <Button
                  variant="secondary"
                  className="min-h-11 w-full"
                  onClick={() => {
                    setMine(centsText(share))
                    setHelper(false)
                  }}
                >
                  Ma part : {euros(share)}
                </Button>
              </div>
            ) : (
              <Button
                ghost
                variant="secondary"
                className="min-h-11 w-full"
                onClick={() => setHelper(true)}
              >
                <CalculatorIcon aria-hidden />
                Calculer depuis l’addition
              </Button>
            )}
          </div>
          <p className="text-muted-foreground px-1 text-xs">
            Compté dans vos dépenses ce jour-là. Rien ne sort de votre compte :
            vous le réglerez en liant votre virement à {name}.
          </p>
        </>
      )}
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Saisie — B. L'addition puis ma part
 * ------------------------------------------------------------------------- */

type How = 'half' | 'equal' | 'amount'

function EntryB() {
  const [who, setWho] = useState('sam')
  const [total, setTotal] = useState('90')
  const [how, setHow] = useState<How>('equal')
  const [people, setPeople] = useState(3)
  const [typed, setTyped] = useState('30,00')
  const totalCents = parseCents(total) ?? 0
  const mine =
    how === 'half'
      ? divideHalfEven(totalCents, 2)
      : how === 'equal'
        ? divideHalfEven(totalCents, people)
        : (parseCents(typed) ?? 0)
  const name = contactOf(who).name
  const over = mine > totalCents
  return (
    <SheetFrame
      footer={
        <>
          <div className="bg-muted/60 flex min-h-11 items-center justify-between gap-3 rounded-md px-3">
            <span className="font-semibold">Je dois à {name}</span>
            <span
              className={cn(
                'font-semibold whitespace-nowrap tabular-nums',
                over && 'text-destructive',
              )}
            >
              {euros(mine)}
            </span>
          </div>
          <Button className="min-h-11 w-full" disabled={over || mine === 0}>
            Ajouter
          </Button>
        </>
      }
    >
      <ScreenHeader title="Payé pour moi" onBack={() => undefined} />
      <DetailsRecap />
      <Label>Qui a payé ?</Label>
      <PersonChips value={who} onChange={setWho} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Addition payée par {name}</span>
        <AmountInput label="Addition" value={total} onChange={setTotal} />
      </div>
      <Label>Ma part</Label>
      <SegmentedControl
        fullWidth
        value={how}
        onValueChange={setHow}
        aria-label="Ma part"
      >
        <SegmentedControlItem value="half">Moitié</SegmentedControlItem>
        <SegmentedControlItem value="equal">Parts égales</SegmentedControlItem>
        <SegmentedControlItem value="amount">Montant</SegmentedControlItem>
      </SegmentedControl>
      {how === 'equal' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">Entre combien, vous compris</span>
          <span className="flex items-center gap-1">
            <Button
              variant="secondary"
              iconOnly
              className="size-11"
              aria-label="Une personne de moins"
              onClick={() => setPeople((n) => Math.max(2, n - 1))}
            >
              <MinusIcon aria-hidden />
            </Button>
            <span className="w-8 text-center tabular-nums">{people}</span>
            <Button
              variant="secondary"
              iconOnly
              className="size-11"
              aria-label="Une personne de plus"
              onClick={() => setPeople((n) => Math.min(20, n + 1))}
            >
              <PlusIcon aria-hidden />
            </Button>
          </span>
        </div>
      )}
      {how === 'amount' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">Ma part</span>
          <AmountInput label="Ma part" value={typed} onChange={setTyped} />
        </div>
      )}
      <p className="text-muted-foreground px-1 text-xs">
        Seule votre part compte dans vos dépenses ; l’addition reste en note.
      </p>
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Saisie — C. Depuis la personne
 * ------------------------------------------------------------------------- */

function EntryCPage() {
  const sam = contactOf('sam')
  return (
    <PageFrame>
      <PageTitle title="Sam" back="Entre proches" />
      <Tile label="Sam vous doit" value={euros(owedBy('sam'))} tone="warning" />
      <div className="grid gap-2">
        <Button className="min-h-11 w-full">
          <HandCoinsIcon aria-hidden />
          Sam m’a remboursé
        </Button>
        <Button variant="secondary" className="min-h-11 w-full">
          <PlusIcon aria-hidden />
          Je dois de l’argent à Sam
        </Button>
      </div>
      <p className="text-muted-foreground px-1 text-xs">
        La page de {sam.name} : ce qu’il vous doit et ce que vous lui devez,
        avec les deux boutons.
      </p>
    </PageFrame>
  )
}

function EntryCSheet() {
  const [mine, setMine] = useState('30,00')
  return (
    <SheetFrame
      footer={
        <Button className="min-h-11 w-full">
          Ajouter · je dois {euros(parseCents(mine) ?? 0)} à Sam
        </Button>
      }
    >
      <ScreenHeader title="Je dois à Sam" onBack={() => undefined} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Ma part</span>
        <AmountInput label="Ma part" value={mine} onChange={setMine} />
      </div>
      <div className={GROUP}>
        <SettingRow icon={TagIcon} label="Catégorie" value="Restaurants" />
        <SettingRow
          icon={StickyNoteIcon}
          label="Pour"
          value="Bistrot du port"
        />
        <SettingRow icon={ArrowLeftRightIcon} label="Jour" value="15 nov." />
      </div>
      <p className="text-muted-foreground px-1 text-xs">
        Pas d’addition ni de calcul : juste ce que vous devez. Compté dans vos
        dépenses ce jour-là.
      </p>
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Solde — A. Net par personne
 * ------------------------------------------------------------------------- */

function netText(contactId: string) {
  const net = netOf(contactId)
  const name = contactOf(contactId).name
  if (net > 0) return `${name} vous doit`
  if (net < 0) return `Vous devez à ${name}`
  return 'Quittes'
}

function BalanceA() {
  return (
    <PageFrame>
      <PageTitle title="Entre proches" />
      <MockCard>
        <div className="grid grid-cols-1 gap-2 @[30rem]:grid-cols-2">
          <Tile
            label="On me doit"
            value={euros(TOTAL_OWED_CENTS)}
            tone="warning"
          />
          <Tile label="Je dois" value={euros(TOTAL_I_OWE)} />
        </div>
        <p className="text-muted-foreground text-xs">
          Hors patrimoine. Une seule ligne par personne : ce qui reste une fois
          les deux sens comptés.
        </p>
      </MockCard>
      <MockCard>
        <ItemList>
          <ItemListGroup title="Par personne">
            {PEOPLE.map((contact) => {
              const net = netOf(contact.id)
              const both = owedBy(contact.id) > 0 && iOwe(contact.id) > 0
              return (
                <ItemListRow
                  key={contact.id}
                  href="#"
                  onClick={noop}
                  icon={<Avatar contact={contact} />}
                  iconClassName="bg-transparent"
                  title={netText(contact.id)}
                  subtitle={
                    both
                      ? `${euros(owedBy(contact.id))} dus · vous devez ${euros(iOwe(contact.id))}`
                      : undefined
                  }
                  value={
                    <span
                      className={cn(
                        net > 0
                          ? 'text-warning-foreground dark:text-warning'
                          : 'text-foreground',
                      )}
                    >
                      {net < 0 ? '−' : ''}
                      {euros(Math.abs(net))}
                    </span>
                  }
                  compactWhenNarrow
                  compactDetail={
                    both ? (
                      <span className="text-muted-foreground">
                        les deux sens
                      </span>
                    ) : undefined
                  }
                />
              )
            })}
          </ItemListGroup>
        </ItemList>
      </MockCard>
    </PageFrame>
  )
}

/** Sam's page with both sides and « Compenser ». */
function SamBothSides() {
  const [offset, setOffset] = useState(false)
  const owes = owedBy('sam') - (offset ? 3_000 : 0)
  const mine = offset ? 0 : iOwe('sam')
  return (
    <PageFrame>
      <PageTitle title="Sam" back="Entre proches" />
      <Tile
        label="Solde"
        value={`Sam vous doit ${euros(owes - mine)}`}
        tone="warning"
      />
      <MockCard>
        <ItemList>
          <ItemListGroup title="Il vous doit" total={euros(owes)}>
            <ItemListRow
              href="#"
              onClick={noop}
              icon={<CategoryOf category="leisure" />}
              iconClassName="bg-transparent"
              title="Concert"
              subtitle="12 oct."
              value={euros(4_500)}
              compactWhenNarrow
            />
            <ItemListRow
              href="#"
              onClick={noop}
              icon={<CategoryOf category="restaurants" />}
              iconClassName="bg-transparent"
              title="Le Comptoir"
              subtitle={offset ? '8 nov. · compensé' : '8 nov.'}
              value={offset ? '0,00 €' : euros(3_000)}
              compactWhenNarrow
              compactDetail={
                offset ? (
                  <span className="text-chart-delta-good">compensé</span>
                ) : undefined
              }
            />
          </ItemListGroup>
          <ItemListGroup title="Vous lui devez" total={euros(mine)}>
            <ItemListRow
              href="#"
              onClick={noop}
              icon={<CategoryOf category="restaurants" />}
              iconClassName="bg-transparent"
              title="Bistrot du port"
              subtitle={
                offset ? '15 nov. · compensé' : '15 nov. · addition 90 €'
              }
              value={offset ? '0,00 €' : euros(3_000)}
              compactWhenNarrow
              compactDetail={
                offset ? (
                  <span className="text-chart-delta-good">compensé</span>
                ) : undefined
              }
            />
          </ItemListGroup>
        </ItemList>
        {!offset && (
          <Button
            variant="secondary"
            className="min-h-11 w-full"
            onClick={() => setOffset(true)}
          >
            <ScaleIcon aria-hidden />
            Compenser 30,00 €
          </Button>
        )}
        <p className="text-muted-foreground text-xs">
          « Compenser » solde vos 30 € contre 30 € qu’il vous doit (une dépense
          du même montant d’abord, sinon la plus ancienne), sans virement. Rien
          ne change dans vos dépenses.
        </p>
      </MockCard>
    </PageFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Solde — B. Deux listes
 * ------------------------------------------------------------------------- */

function BalanceB() {
  const [side, setSide] = useState<'owed' | 'owe'>('owed')
  return (
    <PageFrame>
      <PageTitle title="Entre proches" />
      <SegmentedControl
        fullWidth
        value={side}
        onValueChange={setSide}
        aria-label="Sens"
      >
        <SegmentedControlItem value="owed">On me doit</SegmentedControlItem>
        <SegmentedControlItem value="owe">Je dois</SegmentedControlItem>
      </SegmentedControl>
      <MockCard>
        <Tile
          label={side === 'owed' ? 'On me doit' : 'Je dois'}
          value={euros(side === 'owed' ? TOTAL_OWED_CENTS : TOTAL_I_OWE)}
          tone={side === 'owed' ? 'warning' : undefined}
        />
        <ItemList>
          <ItemListGroup title="Par personne">
            {PEOPLE.filter((contact) =>
              side === 'owed' ? owedBy(contact.id) > 0 : iOwe(contact.id) > 0,
            ).map((contact) => (
              <ItemListRow
                key={contact.id}
                href="#"
                onClick={noop}
                icon={<Avatar contact={contact} />}
                iconClassName="bg-transparent"
                title={contact.name}
                value={euros(
                  side === 'owed' ? owedBy(contact.id) : iOwe(contact.id),
                )}
                compactWhenNarrow
              />
            ))}
          </ItemListGroup>
        </ItemList>
      </MockCard>
      <p className="text-muted-foreground px-1 text-xs">
        Les deux sens restent séparés : Sam apparaît dans les deux listes (75 €
        dus, 30 € à lui rendre).
      </p>
    </PageFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Rembourser — my transfer, linked to what I owe
 * ------------------------------------------------------------------------- */

function MyRepayment() {
  return (
    <SheetFrame
      footer={
        <>
          <p className="text-sm tabular-nums">
            <span className="font-medium">{euros(8_400)} liés</span>
            <span className="text-muted-foreground">
              {' '}
              · vous devez à Julie 84,00 € → 0,00 €
            </span>
          </p>
          <Button className="min-h-11 w-full">Lier</Button>
        </>
      }
    >
      <ScreenHeader title="Je rembourse Julie" onBack={() => undefined} />
      <div className="bg-muted/60 flex items-center gap-3 rounded-md px-3 py-2 text-sm">
        <Avatar contact={contactOf('julie')} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium break-normal">
            Virement à Julie
          </span>
          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-muted-foreground text-xs">
              {day('2026-11-19')} · Compte courant
            </span>
            <span className="ml-auto font-medium whitespace-nowrap tabular-nums">
              −{euros(8_400)}
            </span>
          </span>
        </span>
      </div>
      <Label>Ce que vous devez à Julie</Label>
      <ul className={GROUP}>
        {DEBTS.filter((debt) => debt.contactId === 'julie').map((debt) => (
          <li
            key={debt.id}
            className="flex min-h-11 items-center gap-3 px-3 py-1.5 text-sm"
          >
            <CategoryOf category={debt.category} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block break-normal">{debt.label}</span>
              <span className="text-muted-foreground block text-xs">
                {day(debt.date)} · payé {euros(debt.paidCents)} par Julie
              </span>
            </span>
            <span className="whitespace-nowrap tabular-nums">
              {euros(debt.mineCents)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground px-1 text-xs">
        Le miroir de « C’est un remboursement » : ce virement n’est pas une
        dépense (le séjour est déjà compté pour votre part, le 24 oct.), il
        règle votre dette. Proposé depuis l’éditeur d’une sortie d’argent et
        dans « À revoir » quand le libellé est celui de Julie.
      </p>
    </SheetFrame>
  )
}

/** The dashboard row with both directions. */
function DashboardRow() {
  return (
    <PageFrame>
      <MockCard title="Comptes" link="Évolution">
        <Tile label="Patrimoine à ce jour" value={euros(2_481_540)} />
        <ul>
          <ItemListRow
            href="#"
            onClick={noop}
            icon={<HandCoinsIcon />}
            title="Entre proches"
            subtitle={`on me doit ${euros(TOTAL_OWED_CENTS)} · je dois ${euros(TOTAL_I_OWE)}`}
            value={`+${euros(TOTAL_OWED_CENTS - TOTAL_I_OWE)}`}
            compactWhenNarrow
            compactDetail={
              <span className="text-muted-foreground">
                je dois {euros(TOTAL_I_OWE)}
              </span>
            }
          />
        </ul>
      </MockCard>
    </PageFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const Logique: StoryObj = {
  name: 'Logique proposée',
  render: () => (
    <Panels
      title="Je dois · la logique proposée"
      description={
        <p>
          Le miroir de « On me doit ». Chaque événement, ce qu’il change dans
          vos dépenses et dans ce que vous devez.
        </p>
      }
      panels={[
        { caption: '375px', node: <Logic /> },
        { caption: '320px', width: 320, node: <Logic /> },
      ]}
    />
  ),
}

export const SaisieA: StoryObj = {
  name: 'Saisie · A. « Payé par… » dans la saisie',
  render: () => (
    <Panels
      title="Saisie · A. « Payé par… » dans la saisie"
      description={
        <>
          <p>
            La saisie rapide reste la même (catégorie → montant → détails). À
            l’étape Détails, « Payé avec » gagne « Quelqu’un d’autre » : on
            choisit la personne et on tape seulement sa part. « Calculer depuis
            l’addition » aide (90 € à 3 → 30 €), sans être obligatoire.
          </p>
          <p>Essayez : ouvrir le calcul, passer à 2 personnes.</p>
        </>
      }
      panels={[
        { caption: '320px', width: 320, node: <EntryA /> },
        { caption: '375px', node: <EntryA /> },
      ]}
    />
  ),
}

export const SaisieB: StoryObj = {
  name: 'Saisie · B. L’addition puis ma part',
  render: () => (
    <Panels
      title="Saisie · B. L’addition puis ma part"
      description={
        <p>
          Un écran à part, « Payé pour moi » : qui a payé, l’addition, puis
          votre part (Moitié, Parts égales entre n, ou un montant). « Je dois à
          Sam » est calculé en bas. Le total est toujours demandé.
        </p>
      }
      panels={[
        { caption: '320px', width: 320, node: <EntryB /> },
        { caption: '375px', node: <EntryB /> },
      ]}
    />
  ),
}

export const SaisieC: StoryObj = {
  name: 'Saisie · C. Depuis la personne',
  render: () => (
    <Panels
      title="Saisie · C. Depuis la personne"
      description={
        <p>
          Sur la page de la personne : « Je dois de l’argent à Sam » ouvre une
          feuille courte, juste votre part, la catégorie, pour quoi et le jour.
          Rien dans la saisie rapide.
        </p>
      }
      panels={[
        { caption: 'Page de Sam', node: <EntryCPage /> },
        { caption: 'La feuille', node: <EntryCSheet /> },
      ]}
    />
  ),
}

export const SoldeA: StoryObj = {
  name: 'Solde · A. Net par personne',
  render: () => (
    <Panels
      title="Solde · A. Net par personne"
      description={
        <>
          <p>
            La page devient « Entre proches » : ce qu’on vous doit et ce que
            vous devez, puis une ligne par personne avec ce qui reste une fois
            les deux sens comptés (« Sam vous doit 45 € », « Vous devez à Julie
            −20 € »).
          </p>
          <p>
            La page de Sam montre les deux côtés et « Compenser » : vos 30 €
            contre 30 € qu’il vous doit, sans virement. Touchez « Compenser ».
            Au tableau de bord, une ligne « Entre proches ».
          </p>
        </>
      }
      panels={[
        { caption: 'Entre proches', node: <BalanceA /> },
        { caption: 'Sam, les deux sens', node: <SamBothSides /> },
        { caption: 'Tableau de bord', node: <DashboardRow /> },
      ]}
    />
  ),
}

export const SoldeB: StoryObj = {
  name: 'Solde · B. Deux listes',
  render: () => (
    <Panels
      title="Solde · B. Deux listes"
      description={
        <p>
          « On me doit » / « Je dois » côte à côte, jamais compensés : une
          personne peut être dans les deux listes. Plus simple, mais Sam vous
          doit 75 € pendant que vous lui devez 30 €.
        </p>
      }
      panels={[
        { caption: '375px', node: <BalanceB /> },
        { caption: '320px', width: 320, node: <BalanceB /> },
      ]}
    />
  ),
}

export const Rembourser: StoryObj = {
  name: 'Rembourser · mon virement',
  render: () => (
    <Panels
      title="Rembourser · lier mon virement"
      description={
        <p>
          Quand vous remboursez, le virement sortant est lié à ce que vous devez
          : ni dépense ni revenu, la dette passe à 0. Même écran pour toutes les
          directions.
        </p>
      }
      panels={[
        { caption: '320px', width: 320, node: <MyRepayment /> },
        { caption: '375px', node: <MyRepayment /> },
      ]}
    />
  ),
}
