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
  SettingSwitchRow,
} from '@finances/ui'
import {
  ArrowLeftRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlagIcon,
  HandCoinsIcon,
  PencilIcon,
  SparkleIcon,
  SplitIcon,
  StickyNoteIcon,
  TagIcon,
  UsersIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  AppScale,
  Bar,
  CATEGORIES,
  CategoryOf,
  centsText,
  day,
  euros,
  leftOf,
  parseCents,
  PARTNER,
  REFUND,
  SINCE,
  SUGGESTED_IDS,
  UNPAID,
  wholeEuros,
  type CategoryKey,
  type SharedCost,
} from './shared-costs.fixtures'

/**
 * Prototypes of the two transaction screens of #359 (shared costs with a
 * partner), shown to the owner before they are built. Synthetic data.
 *
 * « Opération partagée » — how `TransactionEditor` shows a shared cost and
 * what came back of it: the 1 Nov rent (800 €, shared 50 % from its
 * recurring item), half of whose share came back on 10 Nov.
 *   A. Une ligne « Partage » in the settings list, its screen for the share
 *      and the refunds linked.
 *   B. Sous l'en-tête: a block under the amount, « remboursé 200 € sur
 *      400 € » with its bar, always in view.
 *   C. Les montants d'abord: the header gives « Votre part », and a short
 *      table paid / partner's share / paid back / still owed.
 *
 * « Lier un remboursement » — from a 300 € transfer from the partner, choose
 * the costs it pays back and how much of each. The app suggests the oldest
 * costs not paid back that come closest to 300 € without going over (the
 * October groceries, the rest of the rent, energy, insurance: 298,05 €); the
 * 1,95 € left stay in « Remboursements ». Each linked amount becomes a part
 * of the transfer in that cost's category (#357), so it nets the category.
 *   A. Liste cochée: every cost not paid back, the suggestion ticked, an
 *      amount field per ticked cost, the total in the footer.
 *   B. En étapes: the suggestion to accept in one tap, or choose; the
 *      amounts; « Vérifier » the parts and the balance before → after.
 *   C. Jauge à remplir: the transfer as a gauge; tapping a cost puts what is
 *      left of it (or what is left of the transfer) in, a pencil to change it.
 */
const meta: Meta = {
  title: 'Prototypes/Shared costs (#359)/Transactions',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

const GROUP = SETTING_GROUP_CLASS
const RENT = UNPAID.find((cost) => cost.id === 'c2')!

/* ---------------------------------------------------------------------------
 * Frames
 * ------------------------------------------------------------------------- */

interface Panel {
  caption: string
  width?: number
  node: ReactNode
}

function Panels({
  title,
  description,
  panels,
}: {
  title: string
  description: ReactNode
  panels: Panel[]
}) {
  return (
    <AppScale>
      <div className="bg-muted/40 text-foreground min-h-svh p-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="text-muted-foreground mb-4 max-w-[40rem] space-y-1 text-xs">
          {description}
        </div>
        <div className="flex items-start gap-6 overflow-x-auto pb-4">
          {panels.map((panel) => (
            <div
              key={panel.caption}
              className="shrink-0"
              style={{ width: panel.width ?? 375 }}
            >
              <p className="text-muted-foreground mb-2 px-4 text-xs">
                {panel.caption}
              </p>
              {panel.node}
            </div>
          ))}
        </div>
      </div>
    </AppScale>
  )
}

/** A bottom sheet as drawn on a phone, its footer kept at its end. */
function SheetFrame({
  children,
  footer,
}: {
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="bg-background flex min-h-[38rem] flex-col rounded-t-2xl border shadow-lg">
      <span
        aria-hidden
        className="bg-muted-foreground/30 mx-auto mt-2 block h-1 w-10 rounded-full"
      />
      <div className="flex-1 space-y-3 p-4">{children}</div>
      {footer && <div className="space-y-2 border-t p-4">{footer}</div>}
    </div>
  )
}

function ScreenHeader({
  title,
  onBack,
  step,
}: {
  title: string
  onBack?: () => void
  step?: string
}) {
  return (
    <div className="flex min-h-11 items-center gap-2">
      {onBack && (
        <Button
          ghost
          variant="secondary"
          size="sm"
          className="-ml-2 min-h-11"
          onClick={onBack}
        >
          <ChevronLeftIcon aria-hidden />
          Retour
        </Button>
      )}
      <p className="min-w-0 flex-1 font-semibold break-normal">{title}</p>
      {step && (
        <p className="text-muted-foreground text-xs whitespace-nowrap">
          {step}
        </p>
      )}
    </div>
  )
}

/** The editor's header: category, name and amount, date and account. */
function EditorHeader({
  category,
  name,
  amount,
  date,
  under,
  amountClassName,
}: {
  category: CategoryKey
  name: string
  amount: string
  date: string
  under?: ReactNode
  amountClassName?: string
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
              amountClassName,
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

const RENT_HEADER = {
  category: 'rent' as const,
  name: 'Loyer',
  amount: `−${euros(RENT.paidCents)}`,
  date: RENT.date,
}

/** The settings every expense has (`TransactionEditor`). */
function CommonRows({ children }: { children?: ReactNode }) {
  const [oneOff, setOneOff] = useState(false)
  const [review, setReview] = useState(false)
  return (
    <div className={GROUP}>
      <SettingRow icon={TagIcon} label="Catégorie" value="Loyer" />
      {children}
      <SettingRow icon={StickyNoteIcon} label="Note" value="Ajouter" />
      <SettingSwitchRow
        icon={SparkleIcon}
        label="Ponctuelle"
        checked={oneOff}
        onCheckedChange={setOneOff}
      />
      <SettingSwitchRow
        icon={FlagIcon}
        label="À revoir"
        checked={review}
        onCheckedChange={setReview}
      />
    </div>
  )
}

function RareRows() {
  return (
    <div className={GROUP}>
      <SettingRow icon={SplitIcon} label="Répartir" />
      <SettingRow icon={PencilIcon} label="Corriger montant ou date" />
      <SettingRow icon={ArrowLeftRightIcon} label="Type" value="Dépense" />
    </div>
  )
}

/** « remboursé 200 € sur 400 € » and its bar. */
function RepaidLine({ cost }: { cost: SharedCost }) {
  return (
    <div className="space-y-1">
      <Bar value={cost.repaidCents} max={cost.shareCents} />
      <p className="flex flex-wrap justify-between gap-x-3 text-xs">
        <span className="whitespace-nowrap tabular-nums">
          remboursé {euros(cost.repaidCents)} sur {euros(cost.shareCents)}
        </span>
        <span className="text-warning-foreground dark:text-warning whitespace-nowrap tabular-nums">
          reste {euros(leftOf(cost))}
        </span>
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Shared screens
 * ------------------------------------------------------------------------- */

type Share = 'none' | 'half' | 'other'

/** « Partage »: the share, what came back and the refunds linked. */
function ShareScreen({ onBack }: { onBack?: () => void }) {
  const [share, setShare] = useState<Share>('half')
  return (
    <div className="space-y-3">
      <ScreenHeader title="Partage" onBack={onBack ?? (() => undefined)} />
      <SegmentedControl
        fullWidth
        value={share}
        onValueChange={setShare}
        aria-label={`Part de ${PARTNER}`}
      >
        <SegmentedControlItem value="none">Non</SegmentedControlItem>
        <SegmentedControlItem value="half">50 %</SegmentedControlItem>
        <SegmentedControlItem value="other">Autre</SegmentedControlItem>
      </SegmentedControl>
      {share !== 'none' && (
        <>
          <dl className={cn(GROUP, 'text-sm')}>
            <div className="flex min-h-9 items-center justify-between gap-3 px-3">
              <dt>Part de {PARTNER}</dt>
              <dd className="tabular-nums">{euros(RENT.shareCents)}</dd>
            </div>
            <div className="flex min-h-9 items-center justify-between gap-3 px-3">
              <dt>Votre part</dt>
              <dd className="tabular-nums">
                {euros(RENT.paidCents - RENT.shareCents)}
              </dd>
            </div>
          </dl>
          <div className="px-2">
            <RepaidLine cost={RENT} />
          </div>
          <p className="text-muted-foreground px-2 text-xs font-medium">
            Remboursements liés
          </p>
          <div className={GROUP}>
            <SettingRow
              icon={HandCoinsIcon}
              label={`${PARTNER} · 10 nov.`}
              value={euros(20_000)}
            />
          </div>
          <Button variant="secondary" className="min-h-11 w-full">
            Lier un remboursement
          </Button>
          <p className="text-muted-foreground px-2 text-xs">
            Partagé comme l’abonnement « Loyer » (50 %). Choisir une part ici ne
            change que ce loyer-ci.
          </p>
        </>
      )}
    </div>
  )
}

/** The refund's own editor: what it covers, the rest in its category. */
function RefundEditor() {
  return (
    <SheetFrame>
      <EditorHeader
        category="refunds"
        name={`Virement de ${PARTNER}`}
        amount={`+${euros(20_000)}`}
        date="2026-11-10"
        amountClassName="text-chart-delta-good"
      />
      <div className={GROUP}>
        <SettingRow icon={SplitIcon} label="Répartition" value="Loyer" />
        <SettingRow
          icon={HandCoinsIcon}
          label="Rembourse"
          value={`Loyer · ${wholeEuros(20_000)}`}
        />
        <SettingRow icon={StickyNoteIcon} label="Note" value="Ajouter" />
      </div>
      <p className="text-muted-foreground px-2 text-xs">
        Les 200,00 € réduisent le loyer de novembre : ils ne comptent ni comme
        revenu ni dans « Remboursements ».
      </p>
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Opération partagée — A. Une ligne « Partage »
 * ------------------------------------------------------------------------- */

function EditorA() {
  const [screen, setScreen] = useState<'list' | 'share'>('list')
  return (
    <SheetFrame>
      {screen === 'share' ? (
        <ShareScreen onBack={() => setScreen('list')} />
      ) : (
        <>
          <EditorHeader {...RENT_HEADER} />
          <CommonRows>
            <SettingRow
              icon={UsersIcon}
              label="Remboursé"
              value={`${wholeEuros(RENT.repaidCents)} sur ${wholeEuros(RENT.shareCents)}`}
              onClick={() => setScreen('share')}
            />
          </CommonRows>
          <RareRows />
        </>
      )}
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Opération partagée — B. Sous l'en-tête
 * ------------------------------------------------------------------------- */

function ShareBlock({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="bg-muted/60 hover:bg-muted focus-visible:ring-ring/50 block w-full space-y-1.5 rounded-md px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-[3px]"
    >
      <span className="flex items-center gap-2">
        <UsersIcon
          aria-hidden
          className="text-muted-foreground size-[0.8rem] shrink-0"
        />
        <span className="min-w-0 flex-1 break-normal">
          Partagé avec {PARTNER} · 50 %
        </span>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </span>
      <RepaidLine cost={RENT} />
    </button>
  )
}

function EditorB() {
  const [screen, setScreen] = useState<'list' | 'share'>('list')
  return (
    <SheetFrame>
      {screen === 'share' ? (
        <ShareScreen onBack={() => setScreen('list')} />
      ) : (
        <>
          <EditorHeader
            {...RENT_HEADER}
            under={
              <p className="text-muted-foreground text-xs">
                votre part {euros(RENT.paidCents - RENT.shareCents)}
              </p>
            }
          />
          <ShareBlock onOpen={() => setScreen('share')} />
          <CommonRows />
          <RareRows />
        </>
      )}
    </SheetFrame>
  )
}

/** An expense not shared yet: one switch shares it with the default share. */
function EditorBUnshared() {
  const [shared, setShared] = useState(false)
  return (
    <SheetFrame>
      <EditorHeader
        category="groceries"
        name="Courses Monoprix"
        amount={`−${euros(8_640)}`}
        date="2026-11-14"
        under={
          shared ? (
            <p className="text-muted-foreground text-xs">
              votre part {euros(4_320)}
            </p>
          ) : undefined
        }
      />
      {shared && (
        <div className="bg-muted/60 space-y-1.5 rounded-md px-3 py-2.5 text-sm">
          <p className="break-normal">Partagé avec {PARTNER} · 50 %</p>
          <Bar value={0} max={4_320} />
          <p className="text-xs">
            pas encore remboursé ·{' '}
            <span className="text-warning-foreground dark:text-warning">
              reste {euros(4_320)}
            </span>
          </p>
        </div>
      )}
      <div className={GROUP}>
        <SettingRow icon={TagIcon} label="Catégorie" value="Courses" />
        <SettingSwitchRow
          icon={UsersIcon}
          label={`Partager avec ${PARTNER}`}
          checked={shared}
          onCheckedChange={setShared}
        />
        <SettingRow icon={StickyNoteIcon} label="Note" value="Ajouter" />
      </div>
      <RareRows />
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Opération partagée — C. Les montants d'abord
 * ------------------------------------------------------------------------- */

function EditorC() {
  const [screen, setScreen] = useState<'list' | 'share'>('list')
  const rows: { label: string; value: string; className?: string }[] = [
    { label: 'Payé', value: euros(RENT.paidCents) },
    { label: `Part de ${PARTNER} (50 %)`, value: euros(RENT.shareCents) },
    {
      label: 'Remboursé',
      value: euros(RENT.repaidCents),
      className: 'text-chart-delta-good',
    },
    {
      label: 'Reste dû',
      value: euros(leftOf(RENT)),
      className: 'text-warning-foreground dark:text-warning font-medium',
    },
  ]
  return (
    <SheetFrame>
      {screen === 'share' ? (
        <ShareScreen onBack={() => setScreen('list')} />
      ) : (
        <>
          <EditorHeader
            {...RENT_HEADER}
            name="Loyer · votre part"
            amount={`−${euros(RENT.paidCents - RENT.shareCents)}`}
          />
          <dl className={cn(GROUP, 'text-sm')}>
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex min-h-9 items-center justify-between gap-3 px-3"
              >
                <dt className="break-normal">{row.label}</dt>
                <dd
                  className={cn(
                    'whitespace-nowrap tabular-nums',
                    row.className,
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <CommonRows>
            <SettingRow
              icon={UsersIcon}
              label="Partage"
              value={`${PARTNER} · 50 %`}
              onClick={() => setScreen('share')}
            />
          </CommonRows>
          <RareRows />
        </>
      )}
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Lier un remboursement — shared state and pieces
 * ------------------------------------------------------------------------- */

/** Which costs are ticked and the amount typed for each (exact text). */
function useLinks() {
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(SUGGESTED_IDS),
  )
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      UNPAID.map((cost) => [cost.id, centsText(leftOf(cost))]),
    ),
  )
  const amountOf = (id: string) =>
    checked.has(id) ? (parseCents(amounts[id] ?? '') ?? 0) : 0
  const overCost = (cost: SharedCost) => amountOf(cost.id) > leftOf(cost)
  const linked = UNPAID.reduce((sum, cost) => sum + amountOf(cost.id), 0)
  return {
    checked,
    amounts,
    amountOf,
    overCost,
    linked,
    toggle(id: string) {
      setChecked((before) => {
        const next = new Set(before)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    setAmount(id: string, text: string) {
      // Only what can become an amount, as `AmountField` does.
      if (/^[\d\s]*([,.]\d{0,2})?$/.test(text)) {
        setAmounts((before) => ({ ...before, [id]: text }))
      }
    },
  }
}

type Links = ReturnType<typeof useLinks>

/** The transfer the flow starts from. */
function RefundRecap() {
  return (
    <div className="bg-muted/60 flex items-center gap-3 rounded-md px-3 py-2 text-sm">
      <CategoryOf category="refunds" />
      {/* The name on its own line, then the date and the amount. */}
      <span className="min-w-0 flex-1">
        <span className="block font-medium break-normal">{REFUND.display}</span>
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-muted-foreground text-xs">
            {day(REFUND.date)} · Compte courant
          </span>
          <span className="text-chart-delta-good ml-auto font-medium whitespace-nowrap tabular-nums">
            +{euros(REFUND.amountCents)}
          </span>
        </span>
      </span>
    </div>
  )
}

/** What is linked, what stays in « Remboursements », the balance after. */
function LinkSummary({ linked }: { linked: number }) {
  const rest = REFUND.amountCents - linked
  return (
    <div className="space-y-0.5 text-sm">
      {rest >= 0 ? (
        <p className="tabular-nums">
          <span className="font-medium">{euros(linked)} liés</span>
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
        {PARTNER} vous doit {euros(SINCE.owedCents)} →{' '}
        {euros(SINCE.owedCents - Math.min(linked, REFUND.amountCents))}
      </p>
    </div>
  )
}

function canLink(links: Links) {
  return (
    links.linked > 0 &&
    links.linked <= REFUND.amountCents &&
    !UNPAID.some(links.overCost)
  )
}

/** One cost with its tick box and, ticked, its amount field. */
function CostCheckRow({ cost, links }: { cost: SharedCost; links: Links }) {
  const on = links.checked.has(cost.id)
  const over = links.overCost(cost)
  const id = `link-${cost.id}`
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
      <label
        htmlFor={id}
        className="flex min-h-11 min-w-[11rem] flex-1 items-center gap-3"
      >
        <Checkbox
          id={id}
          checked={on}
          onCheckedChange={() => links.toggle(cost.id)}
        />
        <CategoryOf category={cost.category} />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block truncate font-medium">{cost.label}</span>
          <span
            className={cn(
              'block text-xs',
              over ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {day(cost.date)} · reste {euros(leftOf(cost))}
          </span>
        </span>
      </label>
      {on && (
        <span className="ml-auto flex items-center gap-1">
          <Input
            aria-label={`Montant pour ${cost.label}`}
            inputMode="decimal"
            value={links.amounts[cost.id]}
            onChange={(event) => links.setAmount(cost.id, event.target.value)}
            aria-invalid={over || undefined}
            className="h-11 w-[5.5rem] text-right tabular-nums"
          />
          <span className="text-muted-foreground text-sm">€</span>
        </span>
      )}
    </li>
  )
}

/* ---------------------------------------------------------------------------
 * Lier un remboursement — A. Liste cochée
 * ------------------------------------------------------------------------- */

function LinkA() {
  const links = useLinks()
  return (
    <SheetFrame
      footer={
        <>
          <LinkSummary linked={links.linked} />
          <Button className="min-h-11 w-full" disabled={!canLink(links)}>
            Lier
          </Button>
        </>
      }
    >
      <ScreenHeader title="Lier un remboursement" />
      <RefundRecap />
      <p className="text-muted-foreground px-1 text-xs">
        Proposé : les dépenses les plus anciennes, au plus près de{' '}
        {euros(REFUND.amountCents)}. Modifiez les cases ou les montants.
      </p>
      <ul className="divide-y">
        {UNPAID.map((cost) => (
          <CostCheckRow key={cost.id} cost={cost} links={links} />
        ))}
      </ul>
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Lier un remboursement — B. En étapes
 * ------------------------------------------------------------------------- */

function LinkB() {
  const links = useLinks()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const suggested = UNPAID.filter((cost) => SUGGESTED_IDS.includes(cost.id))
  const suggestedCents = suggested.reduce((sum, cost) => sum + leftOf(cost), 0)

  if (step === 1) {
    return (
      <SheetFrame>
        <ScreenHeader title="Quelles dépenses ?" step="Étape 1 sur 3" />
        <RefundRecap />
        <div className="bg-muted/60 space-y-2 rounded-md p-3">
          <p className="text-sm font-medium">
            Suggestion · {euros(suggestedCents)} sur {euros(REFUND.amountCents)}
          </p>
          <ul className="space-y-1">
            {suggested.map((cost) => (
              <li key={cost.id} className="flex items-center gap-2 text-sm">
                <CategoryOf category={cost.category} size="sm" />
                <span className="min-w-0 flex-1 truncate">{cost.label}</span>
                <span className="whitespace-nowrap tabular-nums">
                  {euros(leftOf(cost))}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Les plus anciennes d’abord ;{' '}
            {euros(REFUND.amountCents - suggestedCents)} resteraient en
            Remboursements.
          </p>
        </div>
        <Button className="min-h-11 w-full" onClick={() => setStep(3)}>
          Utiliser la suggestion
        </Button>
        <Button
          variant="secondary"
          className="min-h-11 w-full"
          onClick={() => setStep(2)}
        >
          Choisir moi-même
        </Button>
      </SheetFrame>
    )
  }

  if (step === 2) {
    return (
      <SheetFrame
        footer={
          <>
            <LinkSummary linked={links.linked} />
            <Button
              className="min-h-11 w-full"
              disabled={!canLink(links)}
              onClick={() => setStep(3)}
            >
              Suivant
            </Button>
          </>
        }
      >
        <ScreenHeader
          title="Montants"
          step="Étape 2 sur 3"
          onBack={() => setStep(1)}
        />
        <ul className="divide-y">
          {UNPAID.map((cost) => (
            <CostCheckRow key={cost.id} cost={cost} links={links} />
          ))}
        </ul>
      </SheetFrame>
    )
  }

  const parts = UNPAID.filter((cost) => links.amountOf(cost.id) > 0)
  const rest = REFUND.amountCents - links.linked
  return (
    <SheetFrame
      footer={
        <Button className="min-h-11 w-full" disabled={!canLink(links)}>
          Lier
        </Button>
      }
    >
      <ScreenHeader
        title="Vérifier"
        step="Étape 3 sur 3"
        onBack={() => setStep(2)}
      />
      <RefundRecap />
      <p className="text-muted-foreground px-1 text-xs font-medium">
        Le virement est réparti ainsi
      </p>
      <ul className={cn(GROUP, 'text-sm')}>
        {parts.map((cost) => (
          <li
            key={cost.id}
            className="flex min-h-11 items-center gap-3 px-3 py-1.5"
          >
            <CategoryOf category={cost.category} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {CATEGORIES[cost.category].name}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {cost.label} du {day(cost.date)}
              </span>
            </span>
            <span className="whitespace-nowrap tabular-nums">
              {euros(links.amountOf(cost.id))}
            </span>
          </li>
        ))}
        {rest > 0 && (
          <li className="flex min-h-11 items-center gap-3 px-3 py-1.5">
            <CategoryOf category="refunds" size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">Remboursements</span>
              <span className="text-muted-foreground block truncate text-xs">
                le reste du virement
              </span>
            </span>
            <span className="whitespace-nowrap tabular-nums">
              {euros(rest)}
            </span>
          </li>
        )}
      </ul>
      <p className="text-muted-foreground px-1 text-xs">
        Chaque part réduit les dépenses de sa catégorie (le loyer, les courses…)
        au lieu de compter comme un revenu.
      </p>
      <p className="px-1 text-sm tabular-nums">
        {PARTNER} vous doit {euros(SINCE.owedCents)} →{' '}
        <span className="font-semibold">
          {euros(SINCE.owedCents - links.linked)}
        </span>
      </p>
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Lier un remboursement — C. Jauge à remplir
 * ------------------------------------------------------------------------- */

function suggestedFill(): Record<string, number> {
  let left = REFUND.amountCents
  const fill: Record<string, number> = {}
  for (const cost of UNPAID) {
    if (!SUGGESTED_IDS.includes(cost.id)) continue
    const cents = Math.min(leftOf(cost), left)
    fill[cost.id] = cents
    left -= cents
  }
  return fill
}

function LinkC() {
  const [fill, setFill] = useState<Record<string, number>>(suggestedFill)
  const [editing, setEditing] = useState<string | null>(null)
  const [text, setText] = useState('')
  const linked = Object.values(fill).reduce((sum, cents) => sum + cents, 0)
  const room = REFUND.amountCents - linked

  function toggle(cost: SharedCost) {
    setEditing(null)
    setFill((before) => {
      const next = { ...before }
      if (next[cost.id] !== undefined) delete next[cost.id]
      else {
        const cents = Math.min(leftOf(cost), room)
        if (cents > 0) next[cost.id] = cents
      }
      return next
    })
  }

  function edit(cost: SharedCost) {
    setEditing(cost.id)
    setText(centsText(fill[cost.id] ?? 0))
  }

  function save(cost: SharedCost) {
    const cents = parseCents(text)
    if (cents === null) return
    const others = linked - (fill[cost.id] ?? 0)
    const capped = Math.min(cents, leftOf(cost), REFUND.amountCents - others)
    setFill((before) => ({ ...before, [cost.id]: capped }))
    setEditing(null)
  }

  return (
    <SheetFrame
      footer={
        <>
          <p className="text-muted-foreground text-xs tabular-nums">
            {PARTNER} vous doit {euros(SINCE.owedCents)} →{' '}
            {euros(SINCE.owedCents - linked)}
          </p>
          <Button className="min-h-11 w-full" disabled={linked === 0}>
            Lier {euros(linked)}
          </Button>
        </>
      }
    >
      <ScreenHeader title="Lier un remboursement" />
      <RefundRecap />
      <div className="space-y-1.5 px-1">
        <Bar value={linked} max={REFUND.amountCents} className="h-3" />
        <p className="flex flex-wrap justify-between gap-x-3 text-xs tabular-nums">
          <span className="font-medium">
            {euros(linked)} sur {euros(REFUND.amountCents)}
          </span>
          <span className="text-muted-foreground">
            {room > 0
              ? `${euros(room)} restent en Remboursements`
              : 'tout le virement est lié'}
          </span>
        </p>
      </div>
      <p className="text-muted-foreground px-1 text-xs">
        Touchez une dépense pour y mettre ce qu’il en reste ; le crayon pour un
        autre montant.
      </p>
      <ul className="space-y-1">
        {UNPAID.map((cost) => {
          const cents = fill[cost.id]
          const on = cents !== undefined
          const full = !on && room === 0
          return (
            <li key={cost.id} className="space-y-1">
              <div
                className={cn(
                  'flex items-center gap-1 rounded-md',
                  on && 'bg-primary/10',
                )}
              >
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={full}
                  onClick={() => toggle(cost)}
                  className="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-[3px] disabled:opacity-50"
                >
                  {on ? (
                    <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
                      <CheckIcon aria-hidden className="size-[0.85rem]" />
                    </span>
                  ) : (
                    <CategoryOf category={cost.category} />
                  )}
                  {/* The label on its own line, then the date and what
                      goes in: the label is never cut at 320px. */}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-normal">
                      {cost.label}
                    </span>
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                      <span className="text-muted-foreground">
                        {day(cost.date)}
                      </span>
                      {on ? (
                        <span className="ml-auto whitespace-nowrap tabular-nums">
                          <span className="text-sm font-medium">
                            {euros(cents)}
                          </span>
                          {cents < leftOf(cost) && (
                            <span className="text-muted-foreground">
                              {' '}
                              sur {euros(leftOf(cost))}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground ml-auto whitespace-nowrap tabular-nums">
                          reste {euros(leftOf(cost))}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
                {on && (
                  <Button
                    ghost
                    variant="secondary"
                    iconOnly
                    className="size-11 shrink-0"
                    aria-label={`Autre montant pour ${cost.label}`}
                    onClick={() => edit(cost)}
                  >
                    <PencilIcon aria-hidden />
                  </Button>
                )}
              </div>
              {editing === cost.id && (
                <div className="flex items-center gap-2 px-2">
                  <Input
                    autoFocus
                    aria-label={`Montant pour ${cost.label}`}
                    inputMode="decimal"
                    value={text}
                    onChange={(event) => {
                      if (/^[\d\s]*([,.]\d{0,2})?$/.test(event.target.value)) {
                        setText(event.target.value)
                      }
                    }}
                    className="h-11 min-w-0 flex-1 text-right tabular-nums"
                  />
                  <span className="text-muted-foreground text-sm">€</span>
                  <Button className="min-h-11" onClick={() => save(cost)}>
                    OK
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const OperationA: StoryObj = {
  name: 'Opération partagée · A. Une ligne « Partage »',
  render: () => (
    <Panels
      title="Opération partagée · A. Une ligne « Partage »"
      description={
        <>
          <p>
            La liste de réglages de l’opération gagne une ligne « Remboursé :
            200 € sur 400 € » (« Partage : Non » quand elle n’est pas partagée).
            Elle ouvre son écran : la part (Non, 50 %, Autre), la part de
            chacun, la barre de ce qui est revenu, les remboursements liés et «
            Lier un remboursement ».
          </p>
          <p>
            Le virement de {PARTNER}, de son côté, dit ce qu’il rembourse (même
            chose en B et C). Touchez « Partage » pour ouvrir l’écran.
          </p>
        </>
      }
      panels={[
        { caption: '320px', width: 320, node: <EditorA /> },
        { caption: '375px', node: <EditorA /> },
        { caption: 'Écran « Partage »', node: <ShareScreenFrame /> },
        { caption: 'Le virement lié', node: <RefundEditor /> },
      ]}
    />
  ),
}

function ShareScreenFrame() {
  return (
    <SheetFrame>
      <ShareScreen />
    </SheetFrame>
  )
}

export const OperationB: StoryObj = {
  name: 'Opération partagée · B. Sous l’en-tête',
  render: () => (
    <Panels
      title="Opération partagée · B. Sous l’en-tête"
      description={
        <>
          <p>
            Le partage est en vue dès l’ouverture : « votre part 400,00 € » sous
            le montant, puis un bloc « Partagé avec {PARTNER} · 50 % » avec la
            barre et « remboursé 200,00 € sur 400,00 € · reste 200,00 € », qui
            ouvre le même écran qu’en A.
          </p>
          <p>
            Une dépense pas encore partagée (les courses) a un interrupteur «
            Partager avec {PARTNER} » dans ses réglages ; allumé, le bloc
            apparaît.
          </p>
        </>
      }
      panels={[
        { caption: '320px', width: 320, node: <EditorB /> },
        { caption: '375px', node: <EditorB /> },
        { caption: 'Une dépense à partager', node: <EditorBUnshared /> },
      ]}
    />
  ),
}

export const OperationC: StoryObj = {
  name: 'Opération partagée · C. Les montants d’abord',
  render: () => (
    <Panels
      title="Opération partagée · C. Les montants d’abord"
      description={
        <>
          <p>
            L’en-tête donne ce que la dépense vous coûte vraiment : « Loyer ·
            votre part −400,00 € ». Dessous, un petit tableau : payé, part de{' '}
            {PARTNER}, remboursé, reste dû. « Partage » dans les réglages ouvre
            le même écran qu’en A.
          </p>
        </>
      }
      panels={[
        { caption: '320px', width: 320, node: <EditorC /> },
        { caption: '375px', node: <EditorC /> },
      ]}
    />
  ),
}

export const LinkStoryA: StoryObj = {
  name: 'Lier un remboursement · A. Liste cochée',
  render: () => (
    <Panels
      title="Lier un remboursement · A. Liste cochée"
      description={
        <>
          <p>
            Ouvert depuis le virement (« Lier un remboursement » dans son
            éditeur) ou depuis la carte. Toutes les dépenses pas encore
            remboursées, la plus ancienne d’abord ; la suggestion est déjà
            cochée, chaque case cochée a son montant (ce qui reste, à modifier).
          </p>
          <p>
            En bas : ce qui est lié, ce qui reste en Remboursements et ce que{' '}
            {PARTNER} vous doit avant → après. « Lier » est grisé au-delà du
            virement ou d’une dépense. Essayez de cocher Netflix.
          </p>
        </>
      }
      panels={[
        { caption: '320px', width: 320, node: <LinkA /> },
        { caption: '375px', node: <LinkA /> },
      ]}
    />
  ),
}

export const LinkStoryB: StoryObj = {
  name: 'Lier un remboursement · B. En étapes',
  render: () => (
    <Panels
      title="Lier un remboursement · B. En étapes"
      description={
        <>
          <p>
            Comme la saisie d’une opération : une décision par écran. 1. La
            suggestion à accepter d’un geste, ou « Choisir moi-même » ; 2. les
            dépenses et leurs montants ; 3. « Vérifier » : les parts du virement
            par catégorie, le reste en Remboursements, ce que {PARTNER} vous
            doit avant → après, puis « Lier ».
          </p>
        </>
      }
      panels={[
        { caption: '320px', width: 320, node: <LinkB /> },
        { caption: '375px', node: <LinkB /> },
      ]}
    />
  ),
}

export const LinkStoryC: StoryObj = {
  name: 'Lier un remboursement · C. Jauge à remplir',
  render: () => (
    <Panels
      title="Lier un remboursement · C. Jauge à remplir"
      description={
        <>
          <p>
            Le virement est une jauge à remplir. Toucher une dépense y met ce
            qu’il en reste (ou ce qui reste du virement) ; la retoucher l’enlève
            ; le crayon donne un autre montant. La suggestion est déjà mise.
            Plus rien ne rentre quand la jauge est pleine.
          </p>
        </>
      }
      panels={[
        { caption: '320px', width: 320, node: <LinkC /> },
        { caption: '375px', node: <LinkC /> },
      ]}
    />
  ),
}
