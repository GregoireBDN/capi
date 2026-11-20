import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Button,
  cn,
  ItemList,
  ItemListGroup,
  ItemListRow,
  SegmentedControl,
  SegmentedControlItem,
} from '@finances/ui'
import { CalendarClockIcon, UsersIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  AppScale,
  Bar,
  CARRIED_CENTS,
  CategoryOf,
  day,
  euros,
  LEDGER,
  leftOf,
  MockCard,
  MONTH,
  NEXT,
  PARTNER,
  SINCE,
  Tile,
  UNPAID,
  Widths,
} from './shared-costs.fixtures'

/**
 * Prototypes of the « Partage avec <nom> » card of #359 (shared costs with a
 * partner), shown to the owner before it is built. Synthetic data: rent
 * 800 €, energy 120 €, home insurance 24 €, Netflix 17,98 € and some
 * groceries shared 50/50 with « Camille »; a 200 € transfer on 10 Nov paid
 * half of November's rent back; the October groceries are still owed.
 *
 * Every direction shows the same figures: November's expected (524,19 €),
 * received (200 €) and owed (324,19 €), what is owed since the start date
 * the owner chose (350,24 € since 1 Sept), the costs not paid back oldest
 * first with what is left of each, and December's shared charges
 * (« 480,99 € attendus »).
 *
 * A. Trois tuiles : the month's expected / received / owed as the review's
 *    tiles, then the costs not paid back, then December.
 * B. Solde d'abord : one figure, « Camille vous doit 350,24 € », a switch
 *    between the month and since the start, the three oldest costs, December
 *    on one line.
 * C. Relevé du mois : the month as a statement, each share (+) and refund
 *    (−) in date order, from what was carried over to what is still owed.
 *
 * « Emplacement » shows where the card goes: Épargne, the dashboard, or a
 * page of its own with a one-line reminder on the dashboard.
 */
const meta: Meta = {
  title: 'Prototypes/Shared costs (#359)/Card',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

const TITLE = `Partage avec ${PARTNER}`

function noop(event: { preventDefault: () => void }) {
  event.preventDefault()
}

/* ---------------------------------------------------------------------------
 * Shared rows
 * ------------------------------------------------------------------------- */

/** A cost not (fully) paid back: what is left, and of how much. */
function UnpaidRow({ cost }: { cost: (typeof UNPAID)[number] }) {
  const partly = cost.repaidCents > 0
  return (
    <ItemListRow
      href="#"
      onClick={noop}
      icon={<CategoryOf category={cost.category} />}
      iconClassName="bg-transparent"
      title={cost.label}
      subtitle={`${day(cost.date)} · ${euros(cost.paidCents)} payés`}
      value={euros(leftOf(cost))}
      detail={
        partly ? (
          <span className="text-muted-foreground">
            sur {euros(cost.shareCents)}
          </span>
        ) : undefined
      }
      compactWhenNarrow
      compactDetail={
        <span className="text-muted-foreground">
          {partly ? `sur ${euros(cost.shareCents)} · ` : ''}
          {day(cost.date)}
        </span>
      }
    />
  )
}

/** December's shared charges, each with the partner's share. */
function NextGroup() {
  return (
    <ItemListGroup
      title={`${NEXT.label} · attendus`}
      total={euros(NEXT.totalCents)}
    >
      {NEXT.items.map((item) => (
        <ItemListRow
          key={item.label}
          href="#"
          onClick={noop}
          icon={<CategoryOf category={item.category} />}
          iconClassName="bg-transparent"
          title={item.label}
          subtitle={day(item.date)}
          value={euros(item.shareCents)}
          compactWhenNarrow
          compactDetail={
            <span className="text-muted-foreground">{day(item.date)}</span>
          }
        />
      ))}
    </ItemListGroup>
  )
}

/** December in one row: « En décembre · 480,99 € attendus ». */
function NextLine() {
  return (
    <ul>
      <ItemListRow
        href="#"
        onClick={noop}
        icon={<CalendarClockIcon />}
        title={`En ${NEXT.label.toLowerCase()}`}
        subtitle="Loyer, EDF, assurance, Netflix"
        value={euros(NEXT.totalCents)}
        detail={<span className="text-muted-foreground">attendus</span>}
        compactWhenNarrow
        compactDetail={<span className="text-muted-foreground">attendus</span>}
      />
    </ul>
  )
}

/* ---------------------------------------------------------------------------
 * A. Trois tuiles
 * ------------------------------------------------------------------------- */

function CardA() {
  return (
    <MockCard title={TITLE} status="Novembre · 50 % chacun" link="Détail">
      <div className="grid grid-cols-1 gap-2 @[36rem]:grid-cols-3">
        <Tile label="Attendu" value={euros(MONTH.expectedCents)} />
        <Tile label="Reçu" value={euros(MONTH.receivedCents)} tone="good" />
        <Tile
          label="Reste dû"
          value={euros(MONTH.owedCents)}
          tone="warning"
          note={`${euros(SINCE.owedCents)} depuis le 1 sept.`}
        />
      </div>
      <ItemList>
        <ItemListGroup
          title="Pas encore remboursé"
          total={euros(SINCE.owedCents)}
        >
          {UNPAID.map((cost) => (
            <UnpaidRow key={cost.id} cost={cost} />
          ))}
        </ItemListGroup>
        <NextGroup />
      </ItemList>
    </MockCard>
  )
}

/* ---------------------------------------------------------------------------
 * B. Solde d'abord
 * ------------------------------------------------------------------------- */

type Period = 'month' | 'since'

function CardB() {
  const [period, setPeriod] = useState<Period>('since')
  const [all, setAll] = useState(false)
  const figures = period === 'month' ? MONTH : SINCE
  const shown = all ? UNPAID : UNPAID.slice(0, 3)
  return (
    <MockCard title={TITLE} status="50 % chacun par défaut">
      <div>
        <p className="text-muted-foreground text-sm">{PARTNER} vous doit</p>
        <p className="text-warning-foreground dark:text-warning text-[clamp(1.4rem,14cqi,2rem)] font-semibold whitespace-nowrap tabular-nums">
          {euros(figures.owedCents)}
        </p>
        <p className="text-muted-foreground text-xs">
          {period === 'month'
            ? `pour ${MONTH.label}`
            : `au total depuis le 1 sept. · dont ${euros(MONTH.owedCents)} pour novembre`}
        </p>
      </div>
      <SegmentedControl
        fullWidth
        value={period}
        onValueChange={setPeriod}
        aria-label="Période"
      >
        <SegmentedControlItem value="month">{MONTH.short}</SegmentedControlItem>
        <SegmentedControlItem value="since">Au total</SegmentedControlItem>
      </SegmentedControl>
      <div className="space-y-1.5">
        <Bar value={figures.receivedCents} max={figures.expectedCents} />
        <p className="flex flex-wrap justify-between gap-x-3 text-xs">
          <span className="text-chart-delta-good font-medium whitespace-nowrap tabular-nums">
            {euros(figures.receivedCents)} reçus
          </span>
          <span className="text-muted-foreground whitespace-nowrap tabular-nums">
            sur {euros(figures.expectedCents)} attendus
          </span>
        </p>
      </div>
      <ItemList>
        <ItemListGroup title="Le plus ancien d’abord">
          {shown.map((cost) => (
            <UnpaidRow key={cost.id} cost={cost} />
          ))}
        </ItemListGroup>
      </ItemList>
      {!all && (
        <Button
          variant="secondary"
          className="min-h-11 w-full"
          onClick={() => setAll(true)}
        >
          Voir les {UNPAID.length} dépenses non remboursées
        </Button>
      )}
      <NextLine />
    </MockCard>
  )
}

/* ---------------------------------------------------------------------------
 * C. Relevé du mois
 * ------------------------------------------------------------------------- */

function LedgerRow({
  date,
  label,
  note,
  cents,
  category,
}: (typeof LEDGER)[number]) {
  const refund = cents < 0
  return (
    <li className="flex min-h-11 items-center gap-3 px-2 py-2 text-sm">
      <CategoryOf category={category} />
      {/* The label on its own line, then the date and the amount: the label
          is never cut at 320px. */}
      <span className="min-w-0 flex-1">
        <span className="block font-medium break-normal">{label}</span>
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-muted-foreground text-xs">
            {day(date)}
            {refund && note ? ` · ${note}` : ''}
          </span>
          <span
            className={cn(
              'ml-auto font-medium whitespace-nowrap tabular-nums',
              refund && 'text-chart-delta-good',
            )}
          >
            {refund ? `−${euros(-cents)}` : `+${euros(cents)}`}
          </span>
        </span>
      </span>
    </li>
  )
}

function TotalLine({
  label,
  cents,
  strong,
}: {
  label: string
  cents: number
  strong?: boolean
}) {
  return (
    <p
      className={cn(
        'flex min-h-9 items-center justify-between gap-3 px-2 text-sm',
        strong ? 'font-semibold' : 'text-muted-foreground',
      )}
    >
      <span className="break-normal">{label}</span>
      <span
        className={cn(
          'whitespace-nowrap tabular-nums',
          strong && 'text-warning-foreground dark:text-warning',
        )}
      >
        {euros(cents)}
      </span>
    </p>
  )
}

function CardC() {
  return (
    <MockCard title={TITLE} status="Novembre · 50 % chacun" link="Détail">
      <div className="divide-y">
        <TotalLine label="Reste d’octobre" cents={CARRIED_CENTS} />
        <ul className="py-1">
          {LEDGER.map((line) => (
            <LedgerRow key={`${line.date}${line.label}`} {...line} />
          ))}
        </ul>
        <TotalLine label="Reste dû" cents={SINCE.owedCents} strong />
      </div>
      <p className="text-muted-foreground px-2 text-xs">
        + : la part de {PARTNER} d’une dépense partagée · − : un remboursement.
        En novembre : {euros(MONTH.expectedCents)} attendus,{' '}
        {euros(MONTH.receivedCents)} reçus.
      </p>
      <NextLine />
    </MockCard>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const A_TroisTuiles: StoryObj = {
  name: 'A. Trois tuiles',
  render: () => (
    <Widths
      title="A. Trois tuiles"
      description={
        <>
          <p>
            Comme la revue du mois : Attendu, Reçu et Reste dû du mois en tuiles
            (une par ligne sur téléphone, trois côte à côte sur une carte
            large), ce qui reste dû depuis le début sous la dernière.
          </p>
          <p>
            Puis toutes les dépenses pas encore remboursées, la plus ancienne
            d’abord, avec ce qui en reste (« 200,00 € sur 400,00 € » quand une
            partie est revenue), et la part de {PARTNER} des charges de
            décembre. Toucher une dépense ouvre son éditeur.
          </p>
        </>
      }
    >
      <CardA />
    </Widths>
  ),
}

export const B_SoldeDabord: StoryObj = {
  name: 'B. Solde d’abord',
  render: () => (
    <Widths
      title="B. Solde d’abord"
      description={
        <>
          <p>
            Un seul chiffre en tête : « {PARTNER} vous doit 350,24 € », depuis
            la date de départ ou pour le mois (le sélecteur), puis une barre
            reçu / attendu de la même période.
          </p>
          <p>
            Les trois dépenses les plus anciennes, « Voir les 6 » pour le reste,
            et décembre en une ligne qui ouvre le détail.
          </p>
        </>
      }
    >
      <CardB />
    </Widths>
  ),
}

export const C_ReleveDuMois: StoryObj = {
  name: 'C. Relevé du mois',
  render: () => (
    <Widths
      title="C. Relevé du mois"
      description={
        <>
          <p>
            Le mois comme un relevé entre vous deux : ce qui restait du mois
            précédent, chaque part d’une dépense partagée (+) et chaque
            remboursement (−) dans l’ordre des dates, puis le reste dû.
          </p>
          <p>
            On voit ce qui s’est passé plutôt que ce qui reste par dépense : «
            Détail » garde la liste des dépenses non remboursées. Décembre en
            une ligne.
          </p>
        </>
      }
    >
      <CardC />
    </Widths>
  ),
}

/* ---------------------------------------------------------------------------
 * Emplacement
 * ------------------------------------------------------------------------- */

interface Block {
  label: string
  /** Height of the grey placeholder, px. */
  height?: number
  /** The shared-costs card (or its reminder) itself. */
  node?: ReactNode
}

function PageSketch({ title, blocks }: { title: string; blocks: Block[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xl font-semibold">{title}</p>
      {blocks.map((block) =>
        block.node ? (
          <div
            key={block.label}
            className="ring-primary rounded-xl ring-2 ring-offset-2"
          >
            {block.node}
          </div>
        ) : (
          <div
            key={block.label}
            className="bg-muted/60 text-muted-foreground flex items-start rounded-xl border px-4 py-3 text-sm"
            style={{ height: block.height ?? 72 }}
          >
            {block.label}
          </div>
        ),
      )}
    </div>
  )
}

/** The compact form the card takes on a page that isn't its own. */
function Reminder() {
  return (
    <section className="bg-card rounded-xl border p-2">
      <ul>
        <ItemListRow
          href="#"
          onClick={noop}
          icon={<UsersIcon />}
          title={`${PARTNER} vous doit`}
          subtitle={`${euros(MONTH.receivedCents)} reçus sur ${euros(MONTH.expectedCents)} en novembre`}
          value={euros(SINCE.owedCents)}
          compactWhenNarrow
          compactDetail={
            <span className="text-muted-foreground">depuis le 1 sept.</span>
          }
        />
      </ul>
    </section>
  )
}

function Placement({
  letter,
  title,
  text,
  children,
}: {
  letter: string
  title: string
  text: string
  children: ReactNode
}) {
  return (
    <div className="shrink-0 space-y-2" style={{ width: 375 }}>
      <div className="px-4">
        <p className="font-semibold">
          {letter}. {title}
        </p>
        <p className="text-muted-foreground text-xs">{text}</p>
      </div>
      <div className="bg-background border-x px-4 py-4">{children}</div>
    </div>
  )
}

export const Emplacement: StoryObj = {
  name: 'Emplacement',
  render: () => (
    <AppScale>
      <div className="bg-muted/40 text-foreground min-h-svh p-4">
        <h1 className="text-lg font-semibold">Où vit la carte ?</h1>
        <p className="text-muted-foreground mb-4 max-w-[40rem] text-xs">
          La carte entourée est la direction A (ou B, C : même place). Les blocs
          gris sont les cartes existantes de la page, dans leur ordre sur
          téléphone.
        </p>
        <div className="flex items-start gap-6 overflow-x-auto pb-4">
          <Placement
            letter="A"
            title="Dans Épargne"
            text="Après les objectifs : ce que Camille vous doit est de l’argent qui vous revient, à côté de ce que vous mettez de côté. Vu quand on regarde son épargne, pas tous les jours."
          >
            <PageSketch
              title="Épargne"
              blocks={[
                { label: 'Chiffres du mois (épargné, taux)', height: 96 },
                { label: 'Graphique de l’épargne', height: 120 },
                { label: 'Épargne cible', height: 88 },
                { label: 'Objectifs', height: 120 },
                { label: 'card', node: <CardA /> },
                { label: 'Épargne et placements', height: 120 },
                { label: 'Où va mon épargne', height: 72 },
              ]}
            />
          </Placement>
          <Placement
            letter="B"
            title="Au tableau de bord"
            text="Après le budget, avant les comptes : lu chaque mois avec la revue, quand on vérifie que le loyer est revenu. La carte suit le mois du tableau de bord."
          >
            <PageSketch
              title="Tableau de bord"
              blocks={[
                { label: 'Revue du mois', height: 180 },
                { label: 'Budget (enveloppes)', height: 140 },
                { label: 'card', node: <CardA /> },
                { label: 'Comptes', height: 120 },
                { label: 'Revenus et dépenses', height: 96 },
              ]}
            />
          </Placement>
          <Placement
            letter="C"
            title="Une page, un rappel"
            text="Une page « Partage » (depuis Réglages ou la ligne ci-dessous) avec la carte entière ; au tableau de bord une seule ligne, montrée seulement quand quelque chose est dû."
          >
            <PageSketch
              title="Tableau de bord"
              blocks={[
                { label: 'Revue du mois', height: 180 },
                { label: 'Budget (enveloppes)', height: 140 },
                { label: 'reminder', node: <Reminder /> },
                { label: 'Comptes', height: 120 },
                { label: 'Revenus et dépenses', height: 96 },
              ]}
            />
          </Placement>
          <Placement
            letter="C"
            title="… et sa page"
            text="La ligne ouvre la page « Partage » : la carte, puis l’historique par mois et les réglages du partage (nom, part par défaut, date de départ)."
          >
            <PageSketch
              title="Partage"
              blocks={[
                { label: 'card', node: <CardA /> },
                { label: 'Mois par mois (attendu, reçu, reste)', height: 120 },
                {
                  label: 'Réglages : nom, part par défaut, date de départ',
                  height: 88,
                },
              ]}
            />
          </Placement>
        </div>
      </div>
    </AppScale>
  ),
}
