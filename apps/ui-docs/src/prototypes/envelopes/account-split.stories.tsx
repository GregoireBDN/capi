import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Button,
  Card,
  cn,
  NativeSelect,
  NativeSelectOption,
  Slider,
} from '@finances/ui'
import {
  ArrowRightLeftIcon,
  ChevronRightIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  ACCOUNT,
  accountSegments,
  allocatedCents,
  Dot,
  ENVELOPE,
  ENVELOPES,
  EnvelopeIcon,
  euros,
  FREE_COLOR,
  FREE_ICON,
  Frame,
  freeCents,
  Line,
  percent,
  Screen,
  SideBySide,
  SimpleCard,
  StackedBar,
  WIDTH_ARG,
  type Account,
  type Width,
} from './shared'

/**
 * Prototypes of an account's split (#428): its balance shared between its
 * envelopes and « libre », in one stacked bar, and its split key (the
 * percent of each new saving that goes to each envelope, the rest
 * « libre »). Clickable mockups with synthetic data, not app code.
 *
 * A. Barre et liste : the balance, the bar, one row per envelope (amount,
 *    share of the balance), then a « Clé de répartition » card; « Modifier »
 *    opens a screen with − / + per envelope and what the next saving would
 *    give.
 * B. Clé dans chaque ligne : each envelope row says its key under its
 *    amount (« 30 % de chaque épargne »); « Modifier la clé » turns the rows
 *    into sliders, in place.
 * C. Libre d’abord : the big figure is what is free (« Libre »), the
 *    balance under it; envelopes as tiles; the key on one line that opens
 *    the editor, a bar of the key above the − / +.
 */
const meta: Meta<PageArgs> = {
  title: 'Prototypes/Enveloppes (#428)/1. Page de compte',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
}

export default meta

type Direction = 'A' | 'B' | 'C'
type AccountId = 'livret' | 'courant' | 'ldds'

interface PageArgs {
  direction: Direction
  compte: AccountId
  width: Width
  /** The page, or the split key being edited. */
  vue: 'page' | 'cle'
}

/* ---------------------------------------------------------------------------
 * The key being edited
 * ------------------------------------------------------------------------- */

type Key = Record<string, number>

function initialKey(account: Account): Key {
  const key: Key = {}
  for (const id of envelopeIdsOf(account)) key[id] = 0
  for (const k of account.key) key[k.envelopeId] = k.basisPoints
  return key
}

/** The account's envelopes, then those it doesn't hold yet. */
function envelopeIdsOf(account: Account): string[] {
  const held = account.allocations.map((a) => a.envelopeId)
  return [
    ...held,
    ...ENVELOPES.map((e) => e.id).filter((id) => !held.includes(id)),
  ]
}

function keyFree(key: Key): number {
  return 10000 - Object.values(key).reduce((sum, bp) => sum + bp, 0)
}

const NEXT_SAVING = 30000

/** What the next 300 € would give each envelope. */
function NextSaving({ keyBp }: { keyBp: Key }) {
  const free = keyFree(keyBp)
  return (
    <div className="bg-muted/60 space-y-1 rounded-md p-3 text-sm">
      <p className="font-medium">
        Pour {euros(NEXT_SAVING, true)} épargnés sur ce compte
      </p>
      {Object.entries(keyBp)
        .filter(([, bp]) => bp > 0)
        .map(([id, bp]) => (
          <p key={id} className="flex items-center gap-2">
            <Dot color={ENVELOPE[id].color} />
            <span className="flex-1">{ENVELOPE[id].name}</span>
            <span className="tabular-nums">
              {euros((NEXT_SAVING * bp) / 10000)}
            </span>
          </p>
        ))}
      <p className="flex items-center gap-2">
        <Dot color={FREE_COLOR} />
        <span className="flex-1">Libre</span>
        <span className="tabular-nums">
          {euros((NEXT_SAVING * Math.max(0, free)) / 10000)}
        </span>
      </p>
    </div>
  )
}

function KeyStepper({
  name,
  color,
  icon,
  bp,
  onChange,
  canAdd,
}: {
  name: string
  color: string
  icon: (typeof ENVELOPES)[number]['icon']
  bp: number
  onChange: (bp: number) => void
  canAdd: boolean
}) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <EnvelopeIcon envelope={{ icon, color }} size="sm" />
      <span className="min-w-0 flex-1 break-normal">{name}</span>
      <Button
        iconOnly
        variant="secondary"
        aria-label={`Moins pour ${name}`}
        disabled={bp <= 0}
        onClick={() => onChange(Math.max(0, bp - 500))}
      >
        <MinusIcon />
      </Button>
      <span className="w-12 text-center font-medium tabular-nums">
        {percent(bp)}
      </span>
      <Button
        iconOnly
        variant="secondary"
        aria-label={`Plus pour ${name}`}
        disabled={!canAdd}
        onClick={() => onChange(bp + 500)}
      >
        <PlusIcon />
      </Button>
    </div>
  )
}

function KeyEditor({
  account,
  width,
  withBar,
  onClose,
}: {
  account: Account
  width: Width
  withBar: boolean
  onClose: () => void
}) {
  const [key, setKey] = useState(() => initialKey(account))
  const free = keyFree(key)
  return (
    <Screen
      width={width}
      title="Clé de répartition"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Annuler
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Enregistrer
          </Button>
        </>
      }
    >
      <p className="text-muted-foreground text-sm">
        La part de chaque épargne arrivant sur {account.name} qui va à chaque
        enveloppe. Proposée à chaque fois, jamais appliquée sans vous.
      </p>
      {withBar && (
        <StackedBar
          tall
          segments={[
            ...Object.entries(key).map(([id, bp]) => ({
              id,
              label: ENVELOPE[id].name,
              cents: bp,
              color: ENVELOPE[id].color,
            })),
            {
              id: 'libre',
              label: 'Libre',
              cents: free,
              color: FREE_COLOR,
              hatched: true,
            },
          ]}
        />
      )}
      <div className="divide-y">
        {Object.entries(key).map(([id, bp]) => (
          <KeyStepper
            key={id}
            name={ENVELOPE[id].name}
            color={ENVELOPE[id].color}
            icon={ENVELOPE[id].icon}
            bp={bp}
            canAdd={free >= 500}
            onChange={(next) => setKey({ ...key, [id]: next })}
          />
        ))}
        <div className="flex min-h-11 items-center gap-3">
          <EnvelopeIcon
            envelope={{ icon: FREE_ICON, color: FREE_COLOR }}
            size="sm"
          />
          <span className="flex-1">Libre</span>
          <span className="w-12 text-center font-semibold tabular-nums">
            {percent(free)}
          </span>
          <span className="w-[4.5rem]" />
        </div>
      </div>
      <NextSaving keyBp={key} />
    </Screen>
  )
}

/** Moving money between envelopes and « libre », on this account. */
function MoveScreen({
  account,
  width,
  onClose,
}: {
  account: Account
  width: Width
  onClose: () => void
}) {
  return (
    <Screen
      width={width}
      title="Déplacer"
      onClose={onClose}
      footer={
        <Button fullWidth onClick={onClose}>
          Déplacer 100,00 €
        </Button>
      }
    >
      <p className="text-muted-foreground text-sm">
        Sur {account.name}. Le solde ne bouge pas.
      </p>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">De</span>
        <NativeSelect className="w-full" defaultValue="libre">
          <NativeSelectOption value="libre">
            Libre · {euros(freeCents(account))}
          </NativeSelectOption>
          {account.allocations.map((a) => (
            <NativeSelectOption key={a.envelopeId} value={a.envelopeId}>
              {ENVELOPE[a.envelopeId].name} · {euros(a.cents)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Vers</span>
        <NativeSelect className="w-full" defaultValue="japon">
          {ENVELOPES.map((e) => (
            <NativeSelectOption key={e.id} value={e.id}>
              {e.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <p className="text-3xl font-semibold tabular-nums">100,00 €</p>
    </Screen>
  )
}

/* ---------------------------------------------------------------------------
 * A. Barre et liste
 * ------------------------------------------------------------------------- */

function EnvelopeRows({ account }: { account: Account }) {
  return (
    <div className="divide-y">
      {account.allocations.map((a) => {
        const envelope = ENVELOPE[a.envelopeId]
        return (
          <Line
            key={a.envelopeId}
            leading={<EnvelopeIcon envelope={envelope} size="sm" />}
            label={envelope.name}
            sub={
              percent((a.cents / account.balanceCents) * 10000) + ' du solde'
            }
            value={euros(a.cents)}
          />
        )
      })}
      <Line
        leading={
          <EnvelopeIcon
            envelope={{ icon: FREE_ICON, color: FREE_COLOR }}
            size="sm"
          />
        }
        label="Libre"
        sub={
          percent((freeCents(account) / account.balanceCents) * 10000) +
          ' du solde'
        }
        value={euros(freeCents(account))}
        strong
      />
    </div>
  )
}

function DirectionA({
  account,
  onKey,
  onMove,
}: {
  account: Account
  onKey: () => void
  onMove: () => void
}) {
  return (
    <>
      <SimpleCard title="Solde">
        <p className="text-3xl font-semibold tabular-nums">
          {euros(account.balanceCents)}
        </p>
        <StackedBar segments={accountSegments(account)} tall />
        <EnvelopeRows account={account} />
        <Button
          variant="secondary"
          iconStart={<ArrowRightLeftIcon />}
          onClick={onMove}
        >
          Déplacer
        </Button>
      </SimpleCard>
      <SimpleCard
        title="Clé de répartition"
        action={
          <Button variant="secondary" size="sm" onClick={onKey}>
            Modifier
          </Button>
        }
      >
        <p className="text-muted-foreground text-sm">
          Chaque épargne arrivant ici
        </p>
        <div className="divide-y">
          {account.key.map((k) => (
            <Line
              key={k.envelopeId}
              leading={<Dot color={ENVELOPE[k.envelopeId].color} />}
              label={ENVELOPE[k.envelopeId].name}
              value={percent(k.basisPoints)}
            />
          ))}
          <Line
            leading={<Dot color={FREE_COLOR} />}
            label="Libre"
            value={percent(keyFree(initialKey(account)))}
            tone="muted"
          />
        </div>
      </SimpleCard>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * B. Clé dans chaque ligne
 * ------------------------------------------------------------------------- */

function DirectionB({
  account,
  editing,
  onEditing,
  onMove,
}: {
  account: Account
  editing: boolean
  onEditing: (editing: boolean) => void
  onMove: () => void
}) {
  const [key, setKey] = useState(() => initialKey(account))
  useEffect(() => setKey(initialKey(account)), [account])
  const free = keyFree(key)
  const ids = editing
    ? Object.keys(key)
    : account.allocations.map((a) => a.envelopeId)
  return (
    <>
      <SimpleCard>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-3xl font-semibold tabular-nums">
            {euros(account.balanceCents)}
          </p>
          <p className="text-muted-foreground text-sm whitespace-nowrap">
            dont {euros(allocatedCents(account), true)} en enveloppes
          </p>
        </div>
        <StackedBar segments={accountSegments(account)} tall />
      </SimpleCard>
      <SimpleCard
        title="Répartition"
        action={
          editing ? (
            <Button size="sm" onClick={() => onEditing(false)}>
              Terminé
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              iconStart={<PencilIcon />}
              onClick={() => onEditing(true)}
            >
              Modifier la clé
            </Button>
          )
        }
      >
        <ul className="divide-y">
          {ids.map((id) => {
            const envelope = ENVELOPE[id]
            const cents =
              account.allocations.find((a) => a.envelopeId === id)?.cents ?? 0
            return (
              <li key={id} className="space-y-2 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3">
                  <EnvelopeIcon envelope={envelope} size="sm" />
                  <div className="min-w-[7rem] flex-1">
                    <p className="break-normal">{envelope.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {key[id] > 0
                        ? `${percent(key[id])} de chaque épargne`
                        : 'Hors de la clé'}
                    </p>
                  </div>
                  <p className="ml-auto font-medium whitespace-nowrap tabular-nums">
                    {euros(cents)}
                  </p>
                </div>
                {editing && (
                  <div className="flex items-center gap-3 pl-10">
                    <Slider
                      aria-label={`Part de ${envelope.name}`}
                      value={[key[id]]}
                      min={0}
                      max={10000}
                      step={500}
                      onValueChange={([bp]) =>
                        setKey({ ...key, [id]: Math.min(bp, key[id] + free) })
                      }
                      className="flex-1"
                    />
                    <span className="w-12 text-right text-sm font-medium tabular-nums">
                      {percent(key[id])}
                    </span>
                  </div>
                )}
              </li>
            )
          })}
          <li className="flex flex-wrap items-center gap-x-3 py-2.5">
            <EnvelopeIcon
              envelope={{ icon: FREE_ICON, color: FREE_COLOR }}
              size="sm"
            />
            <div className="min-w-[7rem] flex-1">
              <p className="font-medium">Libre</p>
              <p className="text-muted-foreground text-sm">
                {percent(free)} de chaque épargne
              </p>
            </div>
            <p className="ml-auto font-semibold whitespace-nowrap tabular-nums">
              {euros(freeCents(account))}
            </p>
          </li>
        </ul>
        {editing ? (
          <NextSaving keyBp={key} />
        ) : (
          <Button
            variant="secondary"
            iconStart={<ArrowRightLeftIcon />}
            onClick={onMove}
          >
            Déplacer
          </Button>
        )}
      </SimpleCard>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * C. Libre d’abord
 * ------------------------------------------------------------------------- */

function DirectionC({
  account,
  onKey,
  onMove,
}: {
  account: Account
  onKey: () => void
  onMove: () => void
}) {
  const free = keyFree(initialKey(account))
  return (
    <>
      <SimpleCard>
        <p className="text-muted-foreground text-sm">Libre</p>
        <p className="text-3xl font-semibold tabular-nums">
          {euros(freeCents(account))}
        </p>
        <p className="text-muted-foreground text-sm">
          sur un solde de {euros(account.balanceCents)}
        </p>
        <StackedBar segments={accountSegments(account)} tall />
      </SimpleCard>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Enveloppes</h2>
          <Button
            variant="secondary"
            size="sm"
            iconStart={<ArrowRightLeftIcon />}
            onClick={onMove}
          >
            Déplacer
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 @xs:grid-cols-2 @2xl:grid-cols-3">
          {account.allocations.map((a) => {
            const envelope = ENVELOPE[a.envelopeId]
            return (
              <Card key={a.envelopeId} size="sm" className="min-w-0 px-3">
                <div className="flex items-center gap-2">
                  <EnvelopeIcon envelope={envelope} size="sm" />
                  <p className="min-w-0 text-sm leading-tight break-normal">
                    {envelope.name}
                  </p>
                </div>
                <p className="text-lg font-semibold whitespace-nowrap tabular-nums">
                  {euros(a.cents, true)}
                </p>
              </Card>
            )
          })}
        </div>
      </section>
      <Card size="sm" className="min-w-0 p-0">
        <button
          type="button"
          onClick={onKey}
          className="hover:bg-muted/60 flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Clé de répartition</span>
            <span className="text-muted-foreground block text-sm">
              {account.key
                .map(
                  (k) =>
                    `${ENVELOPE[k.envelopeId].name} ${percent(k.basisPoints)}`,
                )
                .concat(free > 0 ? [`Libre ${percent(free)}`] : [])
                .join(' · ')}
            </span>
          </span>
          <ChevronRightIcon
            className="text-muted-foreground size-5 shrink-0"
            aria-hidden
          />
        </button>
      </Card>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * The page
 * ------------------------------------------------------------------------- */

function AccountPage({ direction, compte, width, vue }: PageArgs) {
  const account = ACCOUNT[compte]
  const [overlay, setOverlay] = useState<'cle' | 'move' | null>(
    vue === 'cle' && direction !== 'B' ? 'cle' : null,
  )
  const [editing, setEditing] = useState(vue === 'cle' && direction === 'B')
  useEffect(() => {
    setOverlay(vue === 'cle' && direction !== 'B' ? 'cle' : null)
    setEditing(vue === 'cle' && direction === 'B')
  }, [vue, direction, compte])
  return (
    <Frame
      key={`${direction}-${compte}`}
      width={width}
      back="Comptes"
      crumbs={['Comptes', account.name]}
      title={account.name}
      description={account.institution}
      overlay={
        overlay === 'cle' ? (
          <KeyEditor
            account={account}
            width={width}
            withBar={direction === 'C'}
            onClose={() => setOverlay(null)}
          />
        ) : overlay === 'move' ? (
          <MoveScreen
            account={account}
            width={width}
            onClose={() => setOverlay(null)}
          />
        ) : null
      }
    >
      <div
        className={cn(
          'space-y-6',
          width >= 768 && 'grid grid-cols-2 items-start gap-6 space-y-0',
          width >= 768 && direction === 'C' && 'block space-y-6',
        )}
      >
        {direction === 'A' && (
          <DirectionA
            account={account}
            onKey={() => setOverlay('cle')}
            onMove={() => setOverlay('move')}
          />
        )}
        {direction === 'B' && (
          <DirectionB
            account={account}
            editing={editing}
            onEditing={setEditing}
            onMove={() => setOverlay('move')}
          />
        )}
        {direction === 'C' && (
          <DirectionC
            account={account}
            onKey={() => setOverlay('cle')}
            onMove={() => setOverlay('move')}
          />
        )}
      </div>
      <SimpleCard title="Dernières opérations">
        <p className="text-muted-foreground text-sm">
          (inchangé : l’évolution, les opérations…)
        </p>
      </SimpleCard>
    </Frame>
  )
}

const argTypes = {
  direction: { control: 'inline-radio', options: ['A', 'B', 'C'] },
  compte: { control: 'inline-radio', options: ['livret', 'courant', 'ldds'] },
  width: WIDTH_ARG,
  vue: { control: 'inline-radio', options: ['page', 'cle'] },
} as const

/**
 * One account page: the direction, the account (a Livret A with three
 * envelopes and 14 % free, a checking account, a LDDS with nothing free),
 * the width, and the page or its split key being edited. Tap « Modifier »,
 * the key row or « Déplacer ».
 */
export const UnePage: StoryObj<PageArgs> = {
  name: 'Une page',
  args: { direction: 'A', compte: 'livret', width: 390, vue: 'page' },
  argTypes,
  render: (args) => <AccountPage {...args} />,
}

const LABELS: Record<Direction, string> = {
  A: 'A. Barre et liste',
  B: 'B. Clé dans chaque ligne',
  C: 'C. Libre d’abord',
}

/** A, B and C side by side, on the page or with the key being edited. */
export const CoteACote: StoryObj<PageArgs> = {
  name: 'Côte à côte',
  args: { compte: 'livret', width: 390, vue: 'page' },
  argTypes: {
    compte: argTypes.compte,
    width: { control: 'inline-radio', options: [320, 390] },
    vue: argTypes.vue,
  },
  render: ({ compte, width, vue }) => (
    <SideBySide
      items={(['A', 'B', 'C'] as const).map((direction) => ({
        label: LABELS[direction],
        node: (
          <AccountPage
            direction={direction}
            compte={compte}
            width={width}
            vue={vue}
          />
        ),
      }))}
    />
  ),
}
