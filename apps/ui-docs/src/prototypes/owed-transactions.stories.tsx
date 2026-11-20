import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Button,
  Checkbox,
  cn,
  Input,
  SegmentedControl,
  SegmentedControlItem,
  SETTING_GROUP_CLASS,
  SettingRow,
} from '@finances/ui'
import {
  ArrowLeftRightIcon,
  CheckCheckIcon,
  FlagIcon,
  HandCoinsIcon,
  PlusIcon,
  StickyNoteIcon,
  TagIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  Avatar,
  CATEGORIES,
  CategoryOf,
  centsText,
  contactOf,
  CONTACTS,
  day,
  divideHalfEven,
  euros,
  EXPENSE,
  isAmountText,
  leftOf,
  openItems,
  owedBy,
  Panels,
  parseCents,
  ScreenHeader,
  SheetFrame,
  ToastLine,
  TRANSFER,
  type Contact,
  type OwedItem,
} from './owed.fixtures'

/**
 * Prototypes of the two transaction screens of #359 (share an expense with
 * anyone, follow what each person owes, let a debt go), shown to the owner
 * before they are built. Synthetic names and amounts.
 *
 * « Partager › » (an outgoing transaction's editor): a 95 € pizzeria with
 * Alex and Sam. Who (contact chips, or type a name: « Ajouter "Léa" »), how
 * much each (« moitié », « parts égales », an amount), « Ma part » live,
 * saved at once with « Annuler ». Equal parts are rounded half to even and
 * the remainder stays on the owner (31,67 € each, 31,66 € for him).
 *   A. Un mode pour tous: one choice for everyone (Moitié / Parts égales /
 *      Montants), the people under it, « Ma part » last.
 *   B. Comme une répartition: « Moi » and each person with an amount field,
 *      « Moitié » / « Parts égales » filling them, the split as one bar.
 *
 * « C'est un remboursement › » (an incoming transaction): a 170 € transfer
 * guessed to come from Camille by its bank label. Her open items oldest
 * first; the suggestion is the closest combination without going over
 * (rent 100 € + energy 60 € = 160 €); 10 € stay in « Remboursements ».
 *   A. Liste cochée: who (chips), then every open item, the suggestion
 *      ticked, an amount per ticked item, the effect in the footer.
 *   B. En étapes: who, then what for, then « Vérifier ».
 */
const meta: Meta = {
  title: 'Prototypes/Money owed (#359)/Transactions',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

const GROUP = SETTING_GROUP_CLASS

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------- */

/** The editor's header: category, name, amount, date and account. */
function EditorHeader({
  category,
  name,
  amount,
  date,
  under,
  income,
}: {
  category: keyof typeof CATEGORIES
  name: string
  amount: string
  date: string
  under?: ReactNode
  income?: boolean
}) {
  return (
    <div className="flex items-start gap-3 px-2">
      <CategoryOf category={category} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3">
          <p className="min-w-0 flex-[1_1_auto] font-medium break-words">
            {name}
          </p>
          <p
            className={cn(
              'ml-auto font-medium whitespace-nowrap tabular-nums',
              income && 'text-chart-delta-good',
            )}
          >
            {amount}
          </p>
        </div>
        <p className="text-muted-foreground text-xs">
          {day(date)} · Compte courant
        </p>
        {under}
      </div>
    </div>
  )
}

/** Chips of contacts to add, and a field to type a new name. */
function PeoplePicker({
  chosen,
  known,
  onAdd,
}: {
  chosen: Contact[]
  known: Contact[]
  onAdd: (contact: Contact) => void
}) {
  const [text, setText] = useState('')
  const name = text.trim()
  const others = known.filter(
    (contact) =>
      !chosen.some((one) => one.id === contact.id) &&
      contact.name.toLowerCase().includes(name.toLowerCase()),
  )
  const exists = known.some(
    (contact) => contact.name.toLowerCase() === name.toLowerCase(),
  )
  return (
    <div className="space-y-2">
      <Input
        aria-label="Avec qui ?"
        placeholder="Un nom…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="h-11"
      />
      <div className="flex flex-wrap gap-2">
        {others.map((contact) => (
          <button
            key={contact.id}
            type="button"
            onClick={() => {
              onAdd(contact)
              setText('')
            }}
            className="bg-muted/60 hover:bg-muted inline-flex min-h-11 items-center gap-2 rounded-full pr-3 pl-1.5 text-sm"
          >
            <Avatar contact={contact} size="sm" />
            {contact.name}
          </button>
        ))}
        {name && !exists && (
          <button
            type="button"
            onClick={() => {
              onAdd({
                id: name.toLowerCase(),
                name,
                color: '#7c3aed',
              })
              setText('')
            }}
            className="border-primary text-primary inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed px-3 text-sm"
          >
            <PlusIcon aria-hidden className="size-4" />
            Ajouter « {name} »
          </button>
        )}
      </div>
    </div>
  )
}

type Mode = 'half' | 'equal' | 'amount'

/** Who shares the expense and each person's amount, in cents. */
function useShare(initial: string[]) {
  const [people, setPeople] = useState<Contact[]>(initial.map(contactOf))
  const [known, setKnown] = useState<Contact[]>(CONTACTS)
  const [mode, setMode] = useState<Mode>('equal')
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const total = EXPENSE.amountCents

  function computed(list: Contact[], how: Mode): Record<string, number> {
    const each =
      how === 'half' && list.length === 1
        ? divideHalfEven(total, 2)
        : divideHalfEven(total, list.length + 1)
    return Object.fromEntries(list.map((contact) => [contact.id, each]))
  }

  const shares: Record<string, number> =
    mode === 'amount'
      ? Object.fromEntries(
          people.map((contact) => [
            contact.id,
            parseCents(texts[contact.id] ?? '') ?? 0,
          ]),
        )
      : computed(people, mode)
  const others = people.reduce((sum, contact) => sum + shares[contact.id]!, 0)
  const mine = total - others

  return {
    people,
    known,
    mode,
    texts,
    shares,
    mine,
    saved,
    over: mine < 0,
    add(contact: Contact) {
      if (!known.some((one) => one.id === contact.id)) {
        setKnown((before) => [...before, contact])
      }
      const next = [...people, contact]
      setPeople(next)
      if (mode === 'half' && next.length > 1) setMode('equal')
      if (mode === 'amount') {
        setTexts((before) => ({ ...before, [contact.id]: '' }))
      }
      setSaved(true)
    },
    remove(id: string) {
      const next = people.filter((contact) => contact.id !== id)
      setPeople(next)
      // One person left: « Parts égales » becomes « Moitié ».
      if (next.length === 1 && mode === 'equal') setMode('half')
      setSaved(true)
    },
    /** A mode; switching to amounts keeps the current figures. */
    choose(next: Mode) {
      if (next === 'amount') {
        setTexts(
          Object.fromEntries(
            people.map((contact) => [
              contact.id,
              centsText(shares[contact.id]!),
            ]),
          ),
        )
      }
      setMode(next)
      setSaved(true)
    },
    /** Fills every field with `how`, then keeps them as amounts. */
    fill(how: Mode) {
      const values = computed(people, how)
      setTexts(
        Object.fromEntries(
          people.map((contact) => [contact.id, centsText(values[contact.id]!)]),
        ),
      )
      setMode('amount')
      setSaved(true)
    },
    type(id: string, text: string) {
      if (!isAmountText(text)) return
      if (mode !== 'amount') {
        setTexts({
          ...Object.fromEntries(
            people.map((contact) => [
              contact.id,
              centsText(shares[contact.id]!),
            ]),
          ),
          [id]: text,
        })
        setMode('amount')
      } else setTexts((before) => ({ ...before, [id]: text }))
      setSaved(true)
    },
  }
}

type Share = ReturnType<typeof useShare>

function MyPart({ share }: { share: Share }) {
  return (
    <div
      className={cn(
        'flex min-h-11 items-center justify-between gap-3 rounded-md px-3',
        share.over ? 'bg-destructive/10' : 'bg-muted/60',
      )}
    >
      <span className="font-semibold">Ma part</span>
      <span
        className={cn(
          'font-semibold whitespace-nowrap tabular-nums',
          share.over && 'text-destructive',
        )}
      >
        {share.over
          ? `${euros(-share.mine)} de trop`
          : `${euros(share.mine)} sur ${euros(EXPENSE.amountCents)}`}
      </span>
    </div>
  )
}

function ShareHeader() {
  return (
    <EditorHeader
      category={EXPENSE.category}
      name={EXPENSE.label}
      amount={`−${euros(EXPENSE.amountCents)}`}
      date={EXPENSE.date}
    />
  )
}

/* ---------------------------------------------------------------------------
 * Partager — A. Un mode pour tous
 * ------------------------------------------------------------------------- */

function ShareA() {
  const share = useShare(['alex', 'sam'])
  const single = share.people.length === 1
  return (
    <SheetFrame
      footer={
        <>
          <MyPart share={share} />
          {share.saved && <ToastLine text="Partage enregistré" />}
        </>
      }
    >
      <ScreenHeader title="Partager" onBack={() => undefined} />
      <ShareHeader />
      <p className="text-muted-foreground px-1 text-xs font-medium">
        Avec qui ?
      </p>
      <PeoplePicker
        chosen={share.people}
        known={share.known}
        onAdd={share.add}
      />
      {share.people.length > 0 && (
        <>
          <SegmentedControl
            fullWidth
            value={
              share.mode === 'amount' ? 'amount' : single ? 'half' : 'equal'
            }
            onValueChange={(mode) => share.choose(mode as Mode)}
            aria-label="Comment partager"
          >
            {single ? (
              <SegmentedControlItem value="half">Moitié</SegmentedControlItem>
            ) : (
              <SegmentedControlItem value="equal">
                Parts égales
              </SegmentedControlItem>
            )}
            <SegmentedControlItem value="amount">Montants</SegmentedControlItem>
          </SegmentedControl>
          <ul className={GROUP}>
            {share.people.map((contact) => (
              <li
                key={contact.id}
                className="flex min-h-11 items-center gap-3 px-3 py-1"
              >
                <Avatar contact={contact} size="sm" />
                <span className="min-w-0 flex-1 text-sm break-normal">
                  {contact.name}
                </span>
                {share.mode === 'amount' ? (
                  <span className="flex items-center gap-1">
                    <Input
                      aria-label={`Part de ${contact.name}`}
                      inputMode="decimal"
                      value={share.texts[contact.id] ?? ''}
                      onChange={(event) =>
                        share.type(contact.id, event.target.value)
                      }
                      className="h-11 w-[5.5rem] text-right tabular-nums"
                    />
                    <span className="text-muted-foreground text-sm">€</span>
                  </span>
                ) : (
                  <span className="text-sm whitespace-nowrap tabular-nums">
                    {euros(share.shares[contact.id]!)}
                  </span>
                )}
                <Button
                  ghost
                  variant="secondary"
                  iconOnly
                  className="size-11 shrink-0"
                  aria-label={`Retirer ${contact.name}`}
                  onClick={() => share.remove(contact.id)}
                >
                  <XIcon aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          {share.mode === 'equal' && !single && (
            <p className="text-muted-foreground px-1 text-xs">
              {share.people.length + 1} parts : l’arrondi reste sur votre part.
            </p>
          )}
        </>
      )}
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Partager — B. Comme une répartition
 * ------------------------------------------------------------------------- */

function SplitBar({ share }: { share: Share }) {
  const total = EXPENSE.amountCents
  const parts = [
    { id: 'me', cents: Math.max(share.mine, 0), color: 'var(--primary)' },
    ...share.people.map((contact) => ({
      id: contact.id,
      cents: share.shares[contact.id]!,
      color: contact.color,
    })),
  ]
  return (
    <span
      aria-hidden
      className="bg-muted flex h-3 overflow-hidden rounded-full"
    >
      {parts.map((part) => (
        <span
          key={part.id}
          className="block h-full border-r-2 border-[var(--background)] last:border-r-0"
          style={{
            width: `${(Math.min(part.cents, total) / total) * 100}%`,
            backgroundColor: part.color,
          }}
        />
      ))}
    </span>
  )
}

function ShareB() {
  const share = useShare(['alex', 'sam'])
  const [adding, setAdding] = useState(false)
  const single = share.people.length === 1
  return (
    <SheetFrame
      footer={share.saved ? <ToastLine text="Partage enregistré" /> : undefined}
    >
      <ScreenHeader title="Partager" onBack={() => undefined} />
      <ShareHeader />
      <SplitBar share={share} />
      <ul className={GROUP}>
        <li className="flex min-h-11 items-center gap-3 px-3 py-1">
          <span className="bg-primary/15 text-primary inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
            M
          </span>
          <span className="min-w-0 flex-1 text-sm font-semibold">Ma part</span>
          <span
            className={cn(
              'text-sm font-semibold whitespace-nowrap tabular-nums',
              share.over && 'text-destructive',
            )}
          >
            {share.over ? `${euros(-share.mine)} de trop` : euros(share.mine)}
          </span>
          <span aria-hidden className="w-11 shrink-0" />
        </li>
        {share.people.map((contact) => (
          <li
            key={contact.id}
            className="flex min-h-11 items-center gap-3 px-3 py-1"
          >
            <Avatar contact={contact} size="sm" />
            <span className="min-w-0 flex-1 text-sm break-normal">
              {contact.name}
            </span>
            <span className="flex items-center gap-1">
              <Input
                aria-label={`Part de ${contact.name}`}
                inputMode="decimal"
                value={
                  share.mode === 'amount'
                    ? (share.texts[contact.id] ?? '')
                    : centsText(share.shares[contact.id]!)
                }
                onChange={(event) => share.type(contact.id, event.target.value)}
                className="h-11 w-[5.5rem] text-right tabular-nums"
              />
              <span className="text-muted-foreground text-sm">€</span>
            </span>
            <Button
              ghost
              variant="secondary"
              iconOnly
              className="size-11 shrink-0"
              aria-label={`Retirer ${contact.name}`}
              onClick={() => share.remove(contact.id)}
            >
              <XIcon aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      {share.people.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {single && (
            <Button
              variant="secondary"
              className="min-h-11"
              onClick={() => share.fill('half')}
            >
              Moitié
            </Button>
          )}
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={() => share.fill('equal')}
          >
            Parts égales
          </Button>
        </div>
      )}
      {adding ? (
        <PeoplePicker
          chosen={share.people}
          known={share.known}
          onAdd={(contact) => {
            share.add(contact)
            setAdding(false)
          }}
        />
      ) : (
        <Button
          ghost
          variant="secondary"
          className="min-h-11 w-full"
          onClick={() => setAdding(true)}
        >
          <PlusIcon aria-hidden />
          Ajouter quelqu’un
        </Button>
      )}
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Partager — what it gives in the editor and the list (both directions)
 * ------------------------------------------------------------------------- */

function TransactionRowMock({
  category,
  label,
  sub,
  amount,
  flag,
}: {
  category: keyof typeof CATEGORIES
  label: string
  sub: ReactNode
  amount: string
  flag?: ReactNode
}) {
  return (
    <li className="flex min-h-11 items-center gap-3 px-2 py-2 text-sm">
      <CategoryOf category={category} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{label}</span>
          {flag}
        </span>
        <span className="text-muted-foreground block text-xs">{sub}</span>
      </span>
      <span className="font-medium whitespace-nowrap tabular-nums">
        {amount}
      </span>
    </li>
  )
}

function AfterShare() {
  return (
    <SheetFrame>
      <EditorHeader
        category={EXPENSE.category}
        name={EXPENSE.label}
        amount={`−${euros(EXPENSE.amountCents)}`}
        date={EXPENSE.date}
        under={
          <p className="text-muted-foreground text-xs">
            ma part {euros(3_166)}
          </p>
        }
      />
      <div className={GROUP}>
        <SettingRow icon={TagIcon} label="Catégorie" value="Restaurants" />
        <SettingRow icon={UsersIcon} label="Partager" value="Alex, Sam" />
        <SettingRow icon={StickyNoteIcon} label="Note" value="Ajouter" />
      </div>
      <p className="text-muted-foreground px-1 pt-2 text-xs font-medium">
        Dans la liste des opérations
      </p>
      <ul className="divide-y">
        <TransactionRowMock
          category="restaurants"
          label="Pizzeria Da Marco"
          flag={
            <UsersIcon
              aria-label="Partagée"
              className="text-muted-foreground size-[0.75rem] shrink-0"
            />
          }
          sub="Restaurants · ma part 31,66 €"
          amount={`−${euros(EXPENSE.amountCents)}`}
        />
        <TransactionRowMock
          category="restaurants"
          label="Le Comptoir"
          flag={
            <UsersIcon
              aria-label="Partagée"
              className="text-muted-foreground size-[0.75rem] shrink-0"
            />
          }
          sub={
            <>
              Restaurants ·{' '}
              <span className="text-chart-delta-good">
                Alex : remboursé 30 € sur 30 €
              </span>
            </>
          }
          amount={`−${euros(9_000)}`}
        />
      </ul>
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Remboursement — entry points (both directions)
 * ------------------------------------------------------------------------- */

function EntryPoints() {
  return (
    <SheetFrame>
      <EditorHeader
        category="refunds"
        name={TRANSFER.display}
        amount={`+${euros(TRANSFER.amountCents)}`}
        date={TRANSFER.date}
        income
      />
      <div className={GROUP}>
        <SettingRow icon={TagIcon} label="Catégorie" value="Remboursements" />
        <SettingRow
          icon={HandCoinsIcon}
          label="C’est un remboursement"
          value="Camille ?"
        />
        <SettingRow icon={StickyNoteIcon} label="Note" value="Ajouter" />
        <SettingRow icon={ArrowLeftRightIcon} label="Type" value="Revenu" />
      </div>
      <p className="text-muted-foreground px-1 pt-2 text-xs font-medium">
        Dans « À revoir » (libellé reconnu, montant qui correspond)
      </p>
      <div className="bg-muted/60 space-y-2 rounded-md p-3 text-sm">
        <p className="flex items-center gap-2">
          <FlagIcon aria-hidden className="text-muted-foreground size-4" />
          <span className="font-medium">Remboursement de Camille ?</span>
        </p>
        <p className="text-muted-foreground text-xs">
          {euros(TRANSFER.amountCents)} le {day(TRANSFER.date)} : loyer (100 €)
          et EDF (60 €), 10 € restent en Remboursements.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11">
            <CheckCheckIcon aria-hidden />
            Lier
          </Button>
          <Button variant="secondary" className="min-h-11">
            Modifier
          </Button>
        </div>
      </div>
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Remboursement — shared state
 * ------------------------------------------------------------------------- */

/**
 * The open items whose amounts come closest to the transfer without going
 * over: the oldest that add up exactly, else the closest.
 */
function suggest(items: OwedItem[], amount: number): string[] {
  let best: { ids: string[]; sum: number } = { ids: [], sum: 0 }
  const count = items.length
  for (let mask = 1; mask < 1 << count; mask++) {
    const chosen = items.filter((_, index) => mask & (1 << index))
    const sum = chosen.reduce((total, item) => total + leftOf(item), 0)
    if (sum > amount) continue
    // Items are oldest first: the lower mask wins a tie (older ones).
    if (sum > best.sum) best = { ids: chosen.map((item) => item.id), sum }
  }
  return best.ids
}

function useRepayment() {
  const [contactId, setContactId] = useState(TRANSFER.guessedContactId)
  const items = openItems(contactId)
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(suggest(items, TRANSFER.amountCents)),
  )
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      openItems().map((item) => [item.id, centsText(leftOf(item))]),
    ),
  )
  const amountOf = (id: string) =>
    checked.has(id) ? (parseCents(texts[id] ?? '') ?? 0) : 0
  const linked = items.reduce((sum, item) => sum + amountOf(item.id), 0)
  const overItem = (item: OwedItem) => amountOf(item.id) > leftOf(item)
  return {
    contactId,
    items,
    checked,
    texts,
    linked,
    amountOf,
    overItem,
    ok: linked > 0 && linked <= TRANSFER.amountCents && !items.some(overItem),
    pick(id: string) {
      setContactId(id)
      setChecked(new Set(suggest(openItems(id), TRANSFER.amountCents)))
    },
    toggle(id: string) {
      setChecked((before) => {
        const next = new Set(before)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    type(id: string, text: string) {
      if (isAmountText(text)) setTexts((before) => ({ ...before, [id]: text }))
    },
  }
}

type Repayment = ReturnType<typeof useRepayment>

function TransferRecap() {
  return (
    <div className="bg-muted/60 flex items-center gap-3 rounded-md px-3 py-2 text-sm">
      <CategoryOf category="refunds" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium break-normal">
          {TRANSFER.display}
        </span>
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-muted-foreground text-xs">
            {day(TRANSFER.date)} · Compte courant
          </span>
          <span className="text-chart-delta-good ml-auto font-medium whitespace-nowrap tabular-nums">
            +{euros(TRANSFER.amountCents)}
          </span>
        </span>
      </span>
    </div>
  )
}

/** Contacts who owe something, the guessed one marked. */
function ContactChips({ repayment }: { repayment: Repayment }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CONTACTS.filter((contact) => owedBy(contact.id) > 0).map((contact) => {
        const on = contact.id === repayment.contactId
        return (
          <button
            key={contact.id}
            type="button"
            aria-pressed={on}
            onClick={() => repayment.pick(contact.id)}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-full border pr-3 pl-1.5 text-sm',
              on ? 'border-primary bg-primary/10' : 'bg-muted/60',
            )}
          >
            <Avatar contact={contact} size="sm" />
            {contact.name}
            <span className="text-muted-foreground text-xs tabular-nums">
              {euros(owedBy(contact.id))}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ItemCheckRow({
  item,
  repayment,
}: {
  item: OwedItem
  repayment: Repayment
}) {
  const on = repayment.checked.has(item.id)
  const over = repayment.overItem(item)
  const id = `repay-${item.id}`
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
      <label
        htmlFor={id}
        className="flex min-h-11 min-w-[11rem] flex-1 items-center gap-3"
      >
        <Checkbox
          id={id}
          checked={on}
          onCheckedChange={() => repayment.toggle(item.id)}
        />
        <CategoryOf category={item.category} />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-medium break-normal">{item.label}</span>
          <span
            className={cn(
              'block text-xs',
              over ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {day(item.date)} · reste {euros(leftOf(item))}
          </span>
        </span>
      </label>
      {on && (
        <span className="ml-auto flex items-center gap-1">
          <Input
            aria-label={`Montant pour ${item.label}`}
            inputMode="decimal"
            value={repayment.texts[item.id]}
            onChange={(event) => repayment.type(item.id, event.target.value)}
            aria-invalid={over || undefined}
            className="h-11 w-[5.5rem] text-right tabular-nums"
          />
          <span className="text-muted-foreground text-sm">€</span>
        </span>
      )}
    </li>
  )
}

/** What is linked, what stays in « Remboursements », owed before → after. */
function Effect({ repayment }: { repayment: Repayment }) {
  const rest = TRANSFER.amountCents - repayment.linked
  const name = contactOf(repayment.contactId).name
  const before = owedBy(repayment.contactId)
  return (
    <div className="space-y-0.5 text-sm">
      {rest >= 0 ? (
        <p className="tabular-nums">
          <span className="font-medium">{euros(repayment.linked)} liés</span>
          {rest > 0 && (
            <span className="text-muted-foreground">
              {' '}
              · {euros(rest)} restent en Remboursements
            </span>
          )}
        </p>
      ) : (
        <p className="text-destructive font-medium tabular-nums">
          {euros(-rest)} de plus que le virement
        </p>
      )}
      <p className="text-muted-foreground text-xs tabular-nums">
        {name} vous doit {euros(before)} →{' '}
        {euros(before - Math.min(repayment.linked, TRANSFER.amountCents))}
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Remboursement — A. Liste cochée
 * ------------------------------------------------------------------------- */

function RepayA() {
  const repayment = useRepayment()
  return (
    <SheetFrame
      footer={
        <>
          <Effect repayment={repayment} />
          <Button className="min-h-11 w-full" disabled={!repayment.ok}>
            Lier
          </Button>
        </>
      }
    >
      <ScreenHeader title="C’est un remboursement" onBack={() => undefined} />
      <TransferRecap />
      <p className="text-muted-foreground px-1 text-xs font-medium">
        De qui ? (Camille, d’après le libellé)
      </p>
      <ContactChips repayment={repayment} />
      <p className="text-muted-foreground px-1 text-xs">
        Proposé : au plus près de {euros(TRANSFER.amountCents)}, les plus
        anciennes d’abord.
      </p>
      <ul className="divide-y">
        {repayment.items.map((item) => (
          <ItemCheckRow key={item.id} item={item} repayment={repayment} />
        ))}
      </ul>
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Remboursement — B. En étapes
 * ------------------------------------------------------------------------- */

function RepayB() {
  const repayment = useRepayment()
  const [step, setStep] = useState<1 | 2 | 3>(1)

  if (step === 1) {
    return (
      <SheetFrame>
        <ScreenHeader title="De qui ?" step="Étape 1 sur 3" />
        <TransferRecap />
        <ul className="space-y-1">
          {CONTACTS.filter((contact) => owedBy(contact.id) > 0).map(
            (contact) => (
              <li key={contact.id}>
                <button
                  type="button"
                  onClick={() => {
                    repayment.pick(contact.id)
                    setStep(2)
                  }}
                  className={cn(
                    'hover:bg-muted/60 flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm',
                    contact.id === TRANSFER.guessedContactId && 'bg-primary/10',
                  )}
                >
                  <Avatar contact={contact} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{contact.name}</span>
                    {contact.id === TRANSFER.guessedContactId && (
                      <span className="text-muted-foreground block text-xs">
                        d’après le libellé
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                    doit {euros(owedBy(contact.id))}
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      </SheetFrame>
    )
  }

  if (step === 2) {
    return (
      <SheetFrame
        footer={
          <>
            <Effect repayment={repayment} />
            <Button
              className="min-h-11 w-full"
              disabled={!repayment.ok}
              onClick={() => setStep(3)}
            >
              Suivant
            </Button>
          </>
        }
      >
        <ScreenHeader
          title="Pour quoi ?"
          step="Étape 2 sur 3"
          onBack={() => setStep(1)}
        />
        <p className="text-muted-foreground px-1 text-xs">
          Proposé : au plus près de {euros(TRANSFER.amountCents)}, les plus
          anciennes d’abord.
        </p>
        <ul className="divide-y">
          {repayment.items.map((item) => (
            <ItemCheckRow key={item.id} item={item} repayment={repayment} />
          ))}
        </ul>
      </SheetFrame>
    )
  }

  const parts = repayment.items.filter(
    (item) => repayment.amountOf(item.id) > 0,
  )
  const rest = TRANSFER.amountCents - repayment.linked
  return (
    <SheetFrame
      footer={
        <Button className="min-h-11 w-full" disabled={!repayment.ok}>
          Lier
        </Button>
      }
    >
      <ScreenHeader
        title="Vérifier"
        step="Étape 3 sur 3"
        onBack={() => setStep(2)}
      />
      <TransferRecap />
      <p className="text-muted-foreground px-1 text-xs font-medium">
        Le virement rembourse
      </p>
      <ul className={cn(GROUP, 'text-sm')}>
        {parts.map((item) => (
          <li
            key={item.id}
            className="flex min-h-11 items-center gap-3 px-3 py-1.5"
          >
            <CategoryOf category={item.category} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block break-normal">
                {item.label} du {day(item.date)}
              </span>
              <span className="text-muted-foreground block text-xs">
                {repayment.amountOf(item.id) >= leftOf(item)
                  ? 'remboursé'
                  : `reste ${euros(leftOf(item) - repayment.amountOf(item.id))}`}
              </span>
            </span>
            <span className="whitespace-nowrap tabular-nums">
              {euros(repayment.amountOf(item.id))}
            </span>
          </li>
        ))}
        {rest > 0 && (
          <li className="flex min-h-11 items-center gap-3 px-3 py-1.5">
            <CategoryOf category="refunds" size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block">Remboursements</span>
              <span className="text-muted-foreground block text-xs">
                le reste, compté comme revenu
              </span>
            </span>
            <span className="whitespace-nowrap tabular-nums">
              {euros(rest)}
            </span>
          </li>
        )}
      </ul>
      <p className="text-muted-foreground px-1 text-xs">
        Ce qui est lié n’est ni un revenu ni une dépense : votre loyer et votre
        énergie restent comptés pour votre part.
      </p>
      <Effect repayment={repayment} />
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const ShareStoryA: StoryObj = {
  name: 'Partager · A. Un mode pour tous',
  render: () => (
    <Panels
      title="Partager · A. Un mode pour tous"
      description={
        <>
          <p>
            « Partager › » dans l’éditeur d’une dépense. Avec qui : les contacts
            en pastilles, ou un nom tapé (« Ajouter "Léa" » le crée). Puis un
            seul choix pour tous : « Moitié » (une personne) ou « Parts égales »
            (plusieurs), ou « Montants » pour taper chaque part. « Ma part » se
            met à jour en bas ; chaque changement est enregistré tout de suite,
            avec « Annuler ».
          </p>
          <p>
            Essayez : retirer Sam (Moitié apparaît), taper « Léa », passer en
            Montants.
          </p>
        </>
      }
      panels={[
        { caption: '320px', width: 320, node: <ShareA /> },
        { caption: '375px', node: <ShareA /> },
        { caption: 'Après (A et B)', node: <AfterShare /> },
      ]}
    />
  ),
}

export const ShareStoryB: StoryObj = {
  name: 'Partager · B. Comme une répartition',
  render: () => (
    <Panels
      title="Partager · B. Comme une répartition"
      description={
        <>
          <p>
            Comme « Répartir » : la dépense en une barre (votre part, puis
            chacun), « Ma part » en premier, puis chaque personne avec son
            montant, toujours modifiable. « Moitié » / « Parts égales »
            remplissent les champs ; « Ajouter quelqu’un » ouvre les contacts et
            le nom à taper.
          </p>
        </>
      }
      panels={[
        { caption: '320px', width: 320, node: <ShareB /> },
        { caption: '375px', node: <ShareB /> },
        { caption: 'Après (A et B)', node: <AfterShare /> },
      ]}
    />
  ),
}

export const RepayStoryA: StoryObj = {
  name: 'Remboursement · A. Liste cochée',
  render: () => (
    <Panels
      title="Remboursement · A. Liste cochée"
      description={
        <>
          <p>
            Depuis « C’est un remboursement › » d’une rentrée d’argent (ou la
            suggestion de « À revoir », à gauche). Qui : Camille, reconnue par
            le libellé, ou une autre pastille. Ses dépenses ouvertes, la plus
            ancienne d’abord ; la proposition est cochée (loyer 100 € + EDF 60 €
            = 160 €), chaque case a son montant.
          </p>
          <p>
            En bas : ce qui est lié, les 10 € qui restent en Remboursements, ce
            que Camille vous doit avant → après. « Lier » est grisé au-delà du
            virement ou de ce qui reste dû.
          </p>
        </>
      }
      panels={[
        { caption: 'Points d’entrée (A et B)', node: <EntryPoints /> },
        { caption: '320px', width: 320, node: <RepayA /> },
        { caption: '375px', node: <RepayA /> },
      ]}
    />
  ),
}

export const RepayStoryB: StoryObj = {
  name: 'Remboursement · B. En étapes',
  render: () => (
    <Panels
      title="Remboursement · B. En étapes"
      description={
        <>
          <p>
            Une décision par écran, comme la saisie d’une opération : 1. De qui
            (Camille en tête, d’après le libellé) ; 2. Pour quoi : la
            proposition cochée, les montants ; 3. Vérifier : ce que le virement
            rembourse, le reste en Remboursements, avant → après.
          </p>
        </>
      }
      panels={[
        { caption: '320px', width: 320, node: <RepayB /> },
        { caption: '375px', node: <RepayB /> },
      ]}
    />
  ),
}
