import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Button,
  Checkbox,
  cn,
  ItemList,
  ItemListGroup,
  ItemListRow,
  SegmentedControl,
  SegmentedControlItem,
} from '@finances/ui'
import {
  ArrowLeftRightIcon,
  BanknoteIcon,
  CalendarClockIcon,
  ChartPieIcon,
  HandCoinsIcon,
  HandHeartIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  PiggyBankIcon,
  RepeatIcon,
  TargetIcon,
  UploadIcon,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  Avatar,
  Bar,
  CategoryOf,
  closedItems,
  contactOf,
  day,
  DEBTORS,
  euros,
  EXPECTED,
  ageInDays,
  leftOf,
  MockCard,
  openItems,
  owedBy,
  PageFrame,
  PageTitle,
  Panels,
  ScreenHeader,
  SheetFrame,
  StateText,
  Tile,
  ToastLine,
  TOTAL_OWED_CENTS,
  totalsOf,
  type OwedItem,
} from './owed.fixtures'

/**
 * Prototypes of the « On me doit » pages of #359 and their entry on the
 * dashboard, shown to the owner before they are built. Synthetic names and
 * amounts: 342,20 € owed now (Camille 203,20 €, Sam 75 €, Julie 64 €; Alex
 * paid his 30 € back), one debt of Sam's let go in October, the rent and
 * energy shared 50/50 with Camille as recurring items.
 *
 * « On me doit » (the page):
 *   A. Par personne: the total, then one row per person (owed, the oldest
 *      open item's age), each opening the person's page.
 *   B. Par dépense: the total, people as filter chips, then every open item
 *      oldest first with whom it is owed by.
 * « Emplacement »: a page in the sidebar, or reached from Épargne.
 *
 * A contact's page (Camille, and Sam for a debt let go):
 *   A. Une feuille par dépense: totals, expected this month, open items;
 *      tapping one opens its sheet (« Lier un remboursement », « Réglé
 *      autrement », « Je ne me fais pas rembourser »); then the history.
 *   B. Cocher puis agir: « À rembourser » / « Historique »; tick open items,
 *      a bottom bar acts on all of them at once.
 *
 * « Tableau de bord »: the row « On me doit 342,20 € › » in « Comptes »,
 * beside the net worth, never in it; hidden at 0.
 */
const meta: Meta = {
  title: 'Prototypes/Money owed (#359)/Pages',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

function noop(event: { preventDefault: () => void }) {
  event.preventDefault()
}

/** « depuis 39 j » for the oldest open item of a contact. */
function oldestOf(contactId: string) {
  const [oldest] = openItems(contactId)
  return oldest
}

/* ---------------------------------------------------------------------------
 * On me doit — A. Par personne
 * ------------------------------------------------------------------------- */

function TotalCard({ children }: { children?: ReactNode }) {
  return (
    <MockCard>
      <div>
        <p className="text-muted-foreground text-sm">On me doit</p>
        <p className="text-warning-foreground dark:text-warning text-[clamp(1.4rem,14cqi,2rem)] font-semibold whitespace-nowrap tabular-nums">
          {euros(TOTAL_OWED_CENTS)}
        </p>
        <p className="text-muted-foreground text-xs">
          {DEBTORS.length} personnes · hors patrimoine
        </p>
      </div>
      {children}
    </MockCard>
  )
}

function OwedPageA() {
  return (
    <PageFrame>
      <PageTitle title="On me doit" />
      <TotalCard />
      <MockCard>
        <ItemList>
          <ItemListGroup title="Par personne">
            {DEBTORS.map((contact) => {
              const oldest = oldestOf(contact.id)!
              const count = openItems(contact.id).length
              return (
                <ItemListRow
                  key={contact.id}
                  href="#"
                  onClick={noop}
                  icon={<Avatar contact={contact} />}
                  iconClassName="bg-transparent"
                  title={contact.name}
                  subtitle={`${count} dépense${count > 1 ? 's' : ''} · la plus ancienne il y a ${ageInDays(oldest.date)} j`}
                  value={euros(owedBy(contact.id))}
                  compactWhenNarrow
                  compactDetail={
                    <span
                      className={cn(
                        ageInDays(oldest.date) > 30
                          ? 'text-warning-foreground dark:text-warning'
                          : 'text-muted-foreground',
                      )}
                    >
                      depuis {ageInDays(oldest.date)} j
                    </span>
                  }
                />
              )
            })}
          </ItemListGroup>
          <ItemListGroup title="Tout réglé">
            <ItemListRow
              href="#"
              onClick={noop}
              icon={<Avatar contact={contactOf('alex')} />}
              iconClassName="bg-transparent"
              title="Alex"
              subtitle="Remboursé le 12 nov."
              value={<span className="text-muted-foreground">0 €</span>}
              compactWhenNarrow
            />
          </ItemListGroup>
        </ItemList>
      </MockCard>
      <ExpectedCard />
    </PageFrame>
  )
}

/** What to expect this month from shared recurring items. */
function ExpectedCard() {
  const camille = contactOf(EXPECTED.contactId)
  return (
    <MockCard
      title="Attendu en novembre"
      status="Des dépenses partagées chaque mois"
    >
      <div className="flex items-center gap-3 text-sm">
        <Avatar contact={camille} size="sm" />
        <span className="min-w-0 flex-1 break-normal">
          {camille.name} : loyer 400 €, EDF 60 €
        </span>
        <span className="font-medium whitespace-nowrap tabular-nums">
          {euros(EXPECTED.totalCents)}
        </span>
      </div>
      <div className="space-y-1">
        <Bar value={EXPECTED.receivedCents} max={EXPECTED.totalCents} />
        <p className="text-muted-foreground text-xs tabular-nums">
          {euros(EXPECTED.receivedCents)} reçus sur {euros(EXPECTED.totalCents)}{' '}
          attendus
        </p>
      </div>
    </MockCard>
  )
}

/* ---------------------------------------------------------------------------
 * On me doit — B. Par dépense
 * ------------------------------------------------------------------------- */

function OwedPageB() {
  const [who, setWho] = useState<string | null>(null)
  const items = openItems(who ?? undefined)
  return (
    <PageFrame>
      <PageTitle title="On me doit" />
      <TotalCard>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={who === null}
            onClick={() => setWho(null)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full border px-3 text-sm',
              who === null ? 'border-primary bg-primary/10' : 'bg-muted/60',
            )}
          >
            Tous
          </button>
          {DEBTORS.map((contact) => (
            <button
              key={contact.id}
              type="button"
              aria-pressed={who === contact.id}
              onClick={() => setWho(contact.id)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full border pr-3 pl-1.5 text-sm',
                who === contact.id
                  ? 'border-primary bg-primary/10'
                  : 'bg-muted/60',
              )}
            >
              <Avatar contact={contact} size="sm" />
              {contact.name}
            </button>
          ))}
        </div>
      </TotalCard>
      <MockCard>
        <ItemList>
          <ItemListGroup title="La plus ancienne d’abord">
            {items.map((item) => (
              <OpenItemRow key={item.id} item={item} withContact={!who} />
            ))}
          </ItemListGroup>
        </ItemList>
        {who && (
          <Button variant="secondary" className="min-h-11 w-full">
            Page de {contactOf(who).name}
          </Button>
        )}
      </MockCard>
      <ExpectedCard />
    </PageFrame>
  )
}

/** An open item: what is left, by whom, of how much. */
function OpenItemRow({
  item,
  withContact,
  onOpen,
}: {
  item: OwedItem
  withContact?: boolean
  onOpen?: () => void
}) {
  const partly = item.receivedCents > 0
  const who = contactOf(item.contactId).name
  const age = ageInDays(item.date)
  return (
    <ItemListRow
      href="#"
      onClick={(event) => {
        event.preventDefault()
        onOpen?.()
      }}
      icon={<CategoryOf category={item.category} />}
      iconClassName="bg-transparent"
      title={item.label}
      subtitle={`${withContact ? `${who} · ` : ''}${day(item.date)} · il y a ${age} j`}
      value={euros(leftOf(item))}
      detail={
        partly ? (
          <span className="text-muted-foreground">
            sur {euros(item.owedCents)}
          </span>
        ) : undefined
      }
      compactWhenNarrow
      compactDetail={
        <span className="text-muted-foreground">
          {withContact ? `${who} · ` : ''}
          {day(item.date)}
        </span>
      }
    />
  )
}

/* ---------------------------------------------------------------------------
 * Emplacement
 * ------------------------------------------------------------------------- */

const NAV: { label: string; icon: LucideIcon; owed?: boolean }[] = [
  { label: 'Tableau de bord', icon: LayoutDashboardIcon },
  { label: 'Dépenses', icon: ChartPieIcon },
  { label: 'Opérations', icon: ArrowLeftRightIcon },
  { label: 'Budget', icon: TargetIcon },
  { label: 'Abonnements', icon: RepeatIcon },
  { label: 'Épargne', icon: PiggyBankIcon },
  { label: 'On me doit', icon: HandCoinsIcon, owed: true },
  { label: 'Comptes', icon: LandmarkIcon },
  { label: 'Import', icon: UploadIcon },
]

function SidebarSketch() {
  return (
    <nav className="bg-sidebar text-sidebar-foreground min-h-[30rem] space-y-0.5 border p-2">
      <p className="px-2 py-2 font-semibold">Finances</p>
      {NAV.map(({ label, icon: Icon, owed }) => (
        <p
          key={label}
          className={cn(
            'flex min-h-11 items-center gap-3 rounded-md px-2 text-sm',
            owed && 'ring-primary bg-primary/10 font-medium ring-2',
          )}
        >
          <Icon aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{label}</span>
          {owed && (
            <span className="text-muted-foreground text-xs tabular-nums">
              342 €
            </span>
          )}
        </p>
      ))}
    </nav>
  )
}

function SavingsSketch() {
  return (
    <PageFrame>
      <PageTitle title="Épargne" />
      {[
        'Chiffres du mois (épargné, taux)',
        'Graphique de l’épargne',
        'Épargne cible',
        'Objectifs',
      ].map((label) => (
        <div
          key={label}
          className="bg-muted/60 text-muted-foreground h-16 rounded-xl border px-4 py-3 text-sm"
        >
          {label}
        </div>
      ))}
      <section className="ring-primary bg-card rounded-xl border p-2 ring-2 ring-offset-2">
        <ul>
          <ItemListRow
            href="#"
            onClick={noop}
            icon={<HandCoinsIcon />}
            title="On me doit"
            subtitle="Camille, Sam, Julie"
            value={euros(TOTAL_OWED_CENTS)}
            compactWhenNarrow
            compactDetail={
              <span className="text-muted-foreground">3 personnes</span>
            }
          />
        </ul>
      </section>
      <div className="bg-muted/60 text-muted-foreground h-16 rounded-xl border px-4 py-3 text-sm">
        Épargne et placements
      </div>
    </PageFrame>
  )
}

/* ---------------------------------------------------------------------------
 * A contact's page — shared
 * ------------------------------------------------------------------------- */

function ContactTotals({ contactId }: { contactId: string }) {
  const totals = totalsOf(contactId)
  return (
    <div className="grid grid-cols-1 gap-2 @[30rem]:grid-cols-3">
      <Tile
        label="Me doit"
        value={euros(owedBy(contactId))}
        tone={owedBy(contactId) > 0 ? 'warning' : 'muted'}
      />
      <Tile
        label="Depuis le début"
        value={euros(totals.advancedCents)}
        note={`avancés · ${euros(totals.repaidCents)} remboursés${totals.forgivenCents > 0 ? ` · ${euros(totals.forgivenCents)} abandonnés` : ''}`}
      />
    </div>
  )
}

function HistoryRow({ item }: { item: OwedItem }) {
  return (
    <ItemListRow
      href="#"
      onClick={noop}
      icon={<CategoryOf category={item.category} />}
      iconClassName="bg-transparent"
      title={item.label}
      subtitle={`${day(item.date)}${item.note ? ` · « ${item.note} »` : ''}`}
      value={
        <span
          className={cn(item.state === 'forgiven' && 'text-muted-foreground')}
        >
          {euros(item.owedCents)}
        </span>
      }
      detail={<StateText item={item} />}
      compactWhenNarrow
      compactDetail={<StateText item={item} />}
    />
  )
}

/** The actions on one open item (direction A's sheet). */
function ItemSheet({ item, onBack }: { item: OwedItem; onBack?: () => void }) {
  const [forgiven, setForgiven] = useState(false)
  const who = contactOf(item.contactId).name
  return (
    <SheetFrame
      footer={
        forgiven ? (
          <ToastLine
            text={`Abandonné : ${euros(leftOf(item))} reviennent dans vos dépenses`}
          />
        ) : undefined
      }
    >
      <ScreenHeader title={item.label} onBack={onBack} />
      <div className="flex items-start gap-3 px-1">
        <CategoryOf category={item.category} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="break-normal">
            Payé {euros(item.expenseCents)} le {day(item.date)}
          </p>
          <p className="text-muted-foreground text-xs">
            Part de {who} : {euros(item.owedCents)}
            {item.recurring ? ' · loyer partagé chaque mois' : ''}
          </p>
        </div>
      </div>
      <div className="space-y-1 px-1">
        <Bar value={item.receivedCents} max={item.owedCents} />
        <p className="flex flex-wrap justify-between gap-x-3 text-xs tabular-nums">
          <span>
            {euros(item.receivedCents)} reçus sur {euros(item.owedCents)}
          </span>
          <span className="text-warning-foreground dark:text-warning">
            reste {euros(leftOf(item))}
          </span>
        </p>
      </div>
      <div className="space-y-2 pt-2">
        <Button className="min-h-11 w-full">
          <HandCoinsIcon aria-hidden />
          Lier un remboursement
        </Button>
        <Button variant="secondary" className="min-h-11 w-full">
          <BanknoteIcon aria-hidden />
          Réglé autrement
        </Button>
        <Button
          ghost
          variant="secondary"
          className="min-h-11 w-full"
          onClick={() => setForgiven(true)}
        >
          <HandHeartIcon aria-hidden />
          Je ne me fais pas rembourser
        </Button>
      </div>
      <p className="text-muted-foreground px-1 text-xs">
        « Réglé autrement » : en espèces ou en nature, avec un jour, sans
        opération. « Je ne me fais pas rembourser » remet {euros(leftOf(item))}{' '}
        dans vos dépenses de {day(item.date).split(' ')[1]} ; la dépense reste
        dans l’historique, et « Réclamer à nouveau » annule.
      </p>
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * A contact's page — A. Une feuille par dépense
 * ------------------------------------------------------------------------- */

function ContactPageA({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState<OwedItem | null>(null)
  const contact = contactOf(contactId)
  if (open) return <ItemSheet item={open} onBack={() => setOpen(null)} />
  return (
    <PageFrame>
      <PageTitle title={contact.name} back="On me doit" />
      <ContactTotals contactId={contactId} />
      {contactId === EXPECTED.contactId && <ExpectedCard />}
      <MockCard>
        <ItemList>
          <ItemListGroup title="À rembourser" total={euros(owedBy(contactId))}>
            {openItems(contactId).map((item) => (
              <OpenItemRow
                key={item.id}
                item={item}
                onOpen={() => setOpen(item)}
              />
            ))}
          </ItemListGroup>
          <ItemListGroup title="Historique">
            {closedItems(contactId).map((item) => (
              <HistoryRow key={item.id} item={item} />
            ))}
          </ItemListGroup>
        </ItemList>
      </MockCard>
    </PageFrame>
  )
}

/* ---------------------------------------------------------------------------
 * A contact's page — B. Cocher puis agir
 * ------------------------------------------------------------------------- */

function ContactPageB({ contactId }: { contactId: string }) {
  const [tab, setTab] = useState<'open' | 'history'>('open')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const contact = contactOf(contactId)
  const items = openItems(contactId)
  const total = items
    .filter((item) => checked.has(item.id))
    .reduce((sum, item) => sum + leftOf(item), 0)
  return (
    <div className="relative">
      <PageFrame>
        <PageTitle title={contact.name} back="On me doit" />
        <ContactTotals contactId={contactId} />
        {contactId === EXPECTED.contactId && (
          <p className="text-muted-foreground flex items-center gap-2 px-1 text-sm">
            <CalendarClockIcon aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 break-normal">
              Novembre : {euros(EXPECTED.totalCents)} attendus (loyer, EDF),{' '}
              {euros(EXPECTED.receivedCents)} reçus
            </span>
          </p>
        )}
        <SegmentedControl
          fullWidth
          value={tab}
          onValueChange={setTab}
          aria-label="Dépenses"
        >
          <SegmentedControlItem value="open">À rembourser</SegmentedControlItem>
          <SegmentedControlItem value="history">
            Historique
          </SegmentedControlItem>
        </SegmentedControl>
        {tab === 'open' ? (
          <ul className="divide-y">
            {items.map((item) => {
              const id = `owed-${contactId}-${item.id}`
              return (
                <li key={item.id}>
                  <label
                    htmlFor={id}
                    className="flex min-h-11 items-center gap-3 py-2 text-sm"
                  >
                    <Checkbox
                      id={id}
                      checked={checked.has(item.id)}
                      onCheckedChange={() =>
                        setChecked((before) => {
                          const next = new Set(before)
                          if (next.has(item.id)) next.delete(item.id)
                          else next.add(item.id)
                          return next
                        })
                      }
                    />
                    <CategoryOf category={item.category} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium break-normal">
                        {item.label}
                      </span>
                      <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                        <span className="text-muted-foreground">
                          {day(item.date)} · il y a {ageInDays(item.date)} j
                        </span>
                        <span className="ml-auto whitespace-nowrap tabular-nums">
                          <span className="text-sm font-medium">
                            {euros(leftOf(item))}
                          </span>
                          {item.receivedCents > 0 && (
                            <span className="text-muted-foreground">
                              {' '}
                              sur {euros(item.owedCents)}
                            </span>
                          )}
                        </span>
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        ) : (
          <ItemList>
            <ItemListGroup>
              {closedItems(contactId).map((item) => (
                <HistoryRow key={item.id} item={item} />
              ))}
            </ItemListGroup>
          </ItemList>
        )}
        {/* Room for the bar. */}
        <div aria-hidden className="h-40" />
      </PageFrame>
      {tab === 'open' && (
        <div className="bg-card absolute inset-x-3 bottom-3 space-y-2 rounded-xl border p-3 shadow-lg">
          <p className="text-sm tabular-nums">
            {checked.size === 0
              ? 'Cochez des dépenses'
              : `${checked.size} dépense${checked.size > 1 ? 's' : ''} · ${euros(total)}`}
          </p>
          <Button className="min-h-11 w-full" disabled={checked.size === 0}>
            <HandCoinsIcon aria-hidden />
            Lier un remboursement
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              className="min-h-11"
              disabled={checked.size === 0}
            >
              Réglé autrement
            </Button>
            <Button
              ghost
              variant="secondary"
              className="min-h-11"
              disabled={checked.size === 0}
            >
              Abandonner
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Dashboard row in « Comptes »
 * ------------------------------------------------------------------------- */

function DashboardAccounts({ owed }: { owed: boolean }) {
  return (
    <MockCard title="Comptes" link="Évolution">
      <Tile
        label="Patrimoine à ce jour"
        value={euros(2_481_540)}
        note="+412 € depuis le 31 oct."
      />
      <ItemList>
        {owed && (
          <ul>
            <ItemListRow
              href="#"
              onClick={noop}
              icon={<HandCoinsIcon />}
              iconClassName="bg-warning/15 text-warning-foreground dark:text-warning"
              title="On me doit"
              subtitle="Camille, Sam, Julie · hors patrimoine"
              value={euros(TOTAL_OWED_CENTS)}
              compactWhenNarrow
              compactDetail={
                <span className="text-muted-foreground">hors patrimoine</span>
              }
            />
          </ul>
        )}
        <ItemListGroup title="Comptes courants" total="3 215,40 €">
          <ItemListRow
            href="#"
            onClick={noop}
            icon={<LandmarkIcon />}
            title="Compte courant"
            subtitle="Banque · au 18 nov."
            value="3 215,40 €"
            compactWhenNarrow
          />
        </ItemListGroup>
        <ItemListGroup title="Épargne" total="21 600,00 €">
          <ItemListRow
            href="#"
            onClick={noop}
            icon={<PiggyBankIcon />}
            title="Livret A"
            subtitle="Banque · au 18 nov."
            value="9 600,00 €"
            compactWhenNarrow
          />
          <ItemListRow
            href="#"
            onClick={noop}
            icon={<ChartPieIcon />}
            title="PEA"
            subtitle="Courtier · au 31 oct."
            value="12 000,00 €"
            compactWhenNarrow
          />
        </ItemListGroup>
      </ItemList>
    </MockCard>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const OwedA: StoryObj = {
  name: 'On me doit · A. Par personne',
  render: () => (
    <Panels
      title="On me doit · A. Par personne"
      description={
        <>
          <p>
            Le total, puis une ligne par personne : ce qu’elle doit et depuis
            quand (en orange après 30 jours). Toucher une personne ouvre sa
            page. Les personnes qui ont tout réglé restent dessous. En bas, ce
            qui est attendu ce mois-ci des dépenses partagées chaque mois.
          </p>
        </>
      }
      panels={[
        { caption: '320px', width: 320, node: <OwedPageA /> },
        { caption: '375px', node: <OwedPageA /> },
        { caption: '430px', width: 430, node: <OwedPageA /> },
      ]}
    />
  ),
}

export const OwedB: StoryObj = {
  name: 'On me doit · B. Par dépense',
  render: () => (
    <Panels
      title="On me doit · B. Par dépense"
      description={
        <>
          <p>
            Le total et les personnes en pastilles pour filtrer, puis toutes les
            dépenses ouvertes, la plus ancienne d’abord, avec qui doit quoi. Une
            personne choisie : ses dépenses et « Page de Camille ». Touchez une
            pastille.
          </p>
        </>
      }
      panels={[
        { caption: '320px', width: 320, node: <OwedPageB /> },
        { caption: '375px', node: <OwedPageB /> },
      ]}
    />
  ),
}

export const Emplacement: StoryObj = {
  name: 'On me doit · Emplacement',
  render: () => (
    <Panels
      title="Où vit la page « On me doit » ?"
      description={
        <>
          <p>
            A. Une entrée de la barre latérale, entre Épargne et Comptes, avec
            le total : à un geste, mais une page de plus dans le menu.
          </p>
          <p>
            B. Sous Épargne : une ligne « On me doit » après les objectifs ouvre
            la page (« ‹ Épargne » pour revenir) ; le menu ne change pas. Dans
            les deux cas, la ligne du tableau de bord y mène aussi.
          </p>
        </>
      }
      panels={[
        { caption: 'A. Barre latérale', width: 280, node: <SidebarSketch /> },
        { caption: 'B. Sous Épargne', node: <SavingsSketch /> },
      ]}
    />
  ),
}

export const ContactA: StoryObj = {
  name: 'Contact · A. Une feuille par dépense',
  render: () => (
    <Panels
      title="Contact · A. Une feuille par dépense"
      description={
        <>
          <p>
            Ce que la personne doit et ses totaux depuis le début (avancé,
            remboursé, abandonné), ce qui est attendu ce mois-ci pour une
            personne avec qui des dépenses sont partagées chaque mois, ses
            dépenses ouvertes, puis l’historique (remboursé, abandonné : rien
            n’est effacé).
          </p>
          <p>
            Toucher une dépense ouvre sa feuille : « Lier un remboursement », «
            Réglé autrement », « Je ne me fais pas rembourser » (toast avec «
            Annuler »). Touchez le loyer.
          </p>
        </>
      }
      panels={[
        {
          caption: 'Camille, 375px',
          node: <ContactPageA contactId="camille" />,
        },
        {
          caption: 'Sam, 320px',
          width: 320,
          node: <ContactPageA contactId="sam" />,
        },
        {
          caption: 'Feuille d’une dépense',
          node: <ItemSheet item={openItems('camille')[0]!} />,
        },
      ]}
    />
  ),
}

export const ContactB: StoryObj = {
  name: 'Contact · B. Cocher puis agir',
  render: () => (
    <Panels
      title="Contact · B. Cocher puis agir"
      description={
        <>
          <p>
            Les totaux, l’attendu du mois en une ligne, puis « À rembourser » /
            « Historique ». On coche une ou plusieurs dépenses ; la barre du bas
            agit sur toutes : « Lier un remboursement », « Réglé autrement », «
            Abandonner ». Plus rapide pour solder plusieurs dépenses d’un coup,
            moins de détail par dépense.
          </p>
        </>
      }
      panels={[
        {
          caption: 'Camille, 375px',
          node: <ContactPageB contactId="camille" />,
        },
        {
          caption: 'Sam, 320px',
          width: 320,
          node: <ContactPageB contactId="sam" />,
        },
      ]}
    />
  ),
}

export const Dashboard: StoryObj = {
  name: 'Tableau de bord · Ligne dans Comptes',
  render: () => (
    <Panels
      title="Tableau de bord · « On me doit » dans Comptes"
      description={
        <>
          <p>
            Une ligne sous le patrimoine, avant les comptes : « On me doit
            342,20 € › », qui ouvre la page. Elle n’entre pas dans le patrimoine
            (seulement l’argent détenu) et disparaît à 0 €.
          </p>
        </>
      }
      panels={[
        {
          caption: '320px',
          width: 320,
          node: (
            <PageFrame>
              <DashboardAccounts owed />
            </PageFrame>
          ),
        },
        {
          caption: '375px',
          node: (
            <PageFrame>
              <DashboardAccounts owed />
            </PageFrame>
          ),
        },
        {
          caption: 'Rien de dû : pas de ligne',
          node: (
            <PageFrame>
              <DashboardAccounts owed={false} />
            </PageFrame>
          ),
        },
      ]}
    />
  ),
}
