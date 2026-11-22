import type { Meta, StoryObj } from '@storybook/react-vite'
import { Alert, AlertDescription, AlertTitle, Button, cn } from '@finances/ui'
import {
  ArrowRightIcon,
  ArrowRightLeftIcon,
  CheckIcon,
  MinusIcon,
  PlusIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useState } from 'react'

import {
  ACCOUNT,
  Dot,
  ENVELOPE,
  EnvelopeIcon,
  euros,
  Frame,
  FREE_COLOR,
  Gauge,
  Line,
  Screen,
  SideBySide,
  SimpleCard,
  StackedBar,
  WIDTH_ARG,
  type Width,
} from './shared'

/**
 * The three proposals to settle with the directions (#428). Clickable
 * mockups with synthetic data, not app code.
 *
 * 1. Virement : a transfer out of an account is offered for attachment to
 *    one of that account's envelopes; once attached, the envelope's amount
 *    follows the money to the other account (net worth unchanged).
 * 2. Solde sous les enveloppes : when an account's balance falls under what
 *    its envelopes hold, the account says so and lets the owner choose
 *    which to reduce; nothing is reduced alone, « Plus tard » keeps the
 *    warning.
 * 3. « Budgets suivis » : the dashboard's current « Enveloppes » card
 *    (tracked budget lines, spent / target and the even pace) is renamed,
 *    so « Enveloppes » means only the new money set aside.
 */
const meta: Meta<Args> = {
  title: 'Prototypes/Enveloppes (#428)/5. Propositions',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
}

export default meta

type Proposal = 'virement' | 'alerte' | 'renommage'

interface Args {
  proposition: Proposal
  width: Width
}

/* ---------------------------------------------------------------------------
 * 1. A transfer offered for attachment
 * ------------------------------------------------------------------------- */

const TRANSFER = 30000

function TransferProposal({ width }: { width: Width }) {
  const livret = ACCOUNT.livret
  const [chosen, setChosen] = useState<string | null>('velo')
  const [done, setDone] = useState(false)
  const envelope = chosen ? ENVELOPE[chosen] : null
  const on = (accountId: string) =>
    ACCOUNT[accountId].allocations.find((a) => a.envelopeId === chosen)
      ?.cents ?? 0
  return (
    <Frame
      width={width}
      back="Opérations"
      crumbs={['Opérations', 'Virement']}
      active="Mouvements"
    >
      <div className="space-y-1 text-center">
        <p className="text-muted-foreground text-sm">3 nov. 2026 · Virement</p>
        <p className="text-3xl font-semibold tabular-nums">
          {euros(-TRANSFER)}
        </p>
        <p className="inline-flex flex-wrap items-center justify-center gap-1.5 text-sm">
          Livret A <ArrowRightIcon className="size-4" aria-hidden /> Compte
          courant
        </p>
      </div>
      <SimpleCard title="Pour une enveloppe ?">
        {done && envelope ? (
          <p className="inline-flex items-center gap-2 text-sm">
            <CheckIcon className="text-chart-delta-good size-4" aria-hidden />
            Rattaché à « {envelope.name} »
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {livret.allocations.map((a) => {
                const e = ENVELOPE[a.envelopeId]
                const selected = chosen === e.id
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setChosen(e.id)}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-full border py-1 pr-4 pl-1 text-sm',
                      selected
                        ? 'border-primary bg-primary/10 font-medium'
                        : 'hover:bg-muted/60',
                    )}
                  >
                    <EnvelopeIcon envelope={e} size="sm" />
                    {e.name}
                  </button>
                )
              })}
              <button
                type="button"
                aria-pressed={chosen === null}
                onClick={() => setChosen(null)}
                className={cn(
                  'min-h-11 rounded-full border px-4 text-sm',
                  chosen === null
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'hover:bg-muted/60',
                )}
              >
                Non
              </button>
            </div>
            {envelope && (
              <div className="bg-muted/60 space-y-1 rounded-md p-3 text-sm">
                <p className="font-medium">{envelope.name}</p>
                <p className="flex justify-between gap-2">
                  <span>Livret A</span>
                  <span className="tabular-nums whitespace-nowrap">
                    {euros(on('livret'), true)} →{' '}
                    {euros(Math.max(0, on('livret') - TRANSFER), true)}
                  </span>
                </p>
                <p className="flex justify-between gap-2">
                  <span>Compte courant</span>
                  <span className="tabular-nums whitespace-nowrap">
                    {euros(on('courant'), true)} →{' '}
                    {euros(on('courant') + TRANSFER, true)}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Le total de l’enveloppe ne change pas.
                </p>
              </div>
            )}
            <Button
              fullWidth
              disabled={!envelope}
              onClick={() => setDone(true)}
            >
              Rattacher
            </Button>
          </>
        )}
      </SimpleCard>
      <p className="text-muted-foreground text-sm">
        Proposé aussi dans la file à revoir, après un import, pour chaque
        virement sortant d’un compte qui a des enveloppes.
      </p>
    </Frame>
  )
}

/* ---------------------------------------------------------------------------
 * 2. A balance under its envelopes
 * ------------------------------------------------------------------------- */

const LOW_BALANCE = 80000

function LowBalanceProposal({ width }: { width: Width }) {
  const account = ACCOUNT.courant
  const held = account.allocations.reduce((s, a) => s + a.cents, 0)
  const gap = held - LOW_BALANCE
  const [open, setOpen] = useState(false)
  const [cuts, setCuts] = useState<Record<string, number>>({})
  const cut = Object.values(cuts).reduce((s, c) => s + c, 0)
  const [settled, setSettled] = useState(false)
  return (
    <Frame
      width={width}
      back="Comptes"
      crumbs={['Comptes', account.name]}
      title={account.name}
      description={account.institution}
      overlay={
        open && (
          <Screen
            width={width}
            title="Réduire des enveloppes"
            onClose={() => setOpen(false)}
            footer={
              <Button
                fullWidth
                disabled={cut !== gap}
                onClick={() => {
                  setSettled(true)
                  setOpen(false)
                }}
              >
                {cut === gap
                  ? `Réduire de ${euros(gap, true)}`
                  : `Encore ${euros(gap - cut, true)} à choisir`}
              </Button>
            }
          >
            <p className="text-sm">
              Le solde est de {euros(LOW_BALANCE, true)}, vos enveloppes en
              tiennent {euros(held, true)} :{' '}
              <span className="font-semibold">{euros(gap, true)}</span> à
              retirer.
            </p>
            <div className="divide-y">
              {account.allocations.map((a) => {
                const e = ENVELOPE[a.envelopeId]
                const value = cuts[e.id] ?? 0
                return (
                  <div
                    key={e.id}
                    className="flex min-h-12 flex-wrap items-center gap-x-3 py-2"
                  >
                    <EnvelopeIcon envelope={e} size="sm" />
                    <div className="min-w-[7rem] flex-1">
                      <p className="break-normal">{e.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {euros(a.cents - value, true)} ici
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        iconOnly
                        variant="secondary"
                        aria-label={`Moins retiré de ${e.name}`}
                        disabled={value <= 0}
                        onClick={() =>
                          setCuts({ ...cuts, [e.id]: value - 5000 })
                        }
                      >
                        <MinusIcon />
                      </Button>
                      <span className="w-16 text-center font-medium tabular-nums">
                        −{euros(value, true)}
                      </span>
                      <Button
                        iconOnly
                        variant="secondary"
                        aria-label={`Plus retiré de ${e.name}`}
                        disabled={cut + 5000 > gap || value + 5000 > a.cents}
                        onClick={() =>
                          setCuts({ ...cuts, [e.id]: value + 5000 })
                        }
                      >
                        <PlusIcon />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-muted-foreground text-sm">
              Ou remettez de l’argent sur le compte : l’avertissement s’en va de
              lui-même.
            </p>
          </Screen>
        )
      }
    >
      {!settled && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>Solde sous vos enveloppes</AlertTitle>
          <AlertDescription>
            Il manque {euros(gap, true)} pour les couvrir. Rien n’est réduit
            sans vous.
          </AlertDescription>
          <div className="col-start-2 mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setOpen(true)}>
              Choisir quoi réduire
            </Button>
            <Button size="sm" variant="secondary">
              Plus tard
            </Button>
          </div>
        </Alert>
      )}
      <SimpleCard title="Solde">
        <p className="text-3xl font-semibold tabular-nums">
          {euros(LOW_BALANCE)}
        </p>
        <StackedBar
          tall
          segments={
            settled
              ? account.allocations.map((a) => ({
                  id: a.envelopeId,
                  label: ENVELOPE[a.envelopeId].name,
                  cents: a.cents - (cuts[a.envelopeId] ?? 0),
                  color: ENVELOPE[a.envelopeId].color,
                }))
              : [
                  ...account.allocations.map((a) => ({
                    id: a.envelopeId,
                    label: ENVELOPE[a.envelopeId].name,
                    cents: a.cents,
                    color: ENVELOPE[a.envelopeId].color,
                  })),
                ]
          }
        />
        <div className="divide-y">
          {account.allocations.map((a) => (
            <Line
              key={a.envelopeId}
              leading={<Dot color={ENVELOPE[a.envelopeId].color} />}
              label={ENVELOPE[a.envelopeId].name}
              value={euros(a.cents - (settled ? (cuts[a.envelopeId] ?? 0) : 0))}
            />
          ))}
          <Line
            leading={<Dot color={FREE_COLOR} />}
            label="Libre"
            value={settled ? euros(0) : euros(-gap)}
            tone={settled ? 'muted' : 'warning'}
            strong
          />
        </div>
      </SimpleCard>
    </Frame>
  )
}

/* ---------------------------------------------------------------------------
 * 3. « Enveloppes » becomes « Budgets suivis »
 * ------------------------------------------------------------------------- */

const TRACKED = [
  { name: 'Courses', spent: 31240, target: 45000, pace: 33000 },
  { name: 'Restaurants', spent: 9810, target: 12000, pace: 8800 },
  { name: 'Loisirs', spent: 6420, target: 8000, pace: 5870 },
]

function TrackedCard({ title }: { title: string }) {
  return (
    <SimpleCard title={title}>
      {TRACKED.map((line) => (
        <div key={line.name} className="space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="flex-1">{line.name}</span>
            <span className="ml-auto text-sm whitespace-nowrap tabular-nums">
              {euros(line.spent, true)}{' '}
              <span className="text-muted-foreground">
                / {euros(line.target, true)}
              </span>
            </span>
          </div>
          <Gauge
            value={line.spent}
            max={line.target}
            mark={line.pace}
            color={
              line.spent > line.pace
                ? 'var(--chart-delta-bad)'
                : 'var(--primary)'
            }
          />
        </div>
      ))}
    </SimpleCard>
  )
}

function EnvelopesTeaser() {
  const ids = ['japon', 'apport', 'velo']
  return (
    <SimpleCard
      title="Enveloppes"
      action={
        <Button
          size="sm"
          variant="secondary"
          iconStart={<ArrowRightLeftIcon />}
        >
          Voir
        </Button>
      }
    >
      <div className="divide-y">
        {ids.map((id) => {
          const e = ENVELOPE[id]
          return (
            <Line
              key={id}
              leading={<EnvelopeIcon envelope={e} size="sm" />}
              label={e.name}
              value={euros(
                ['livret', 'courant', 'ldds'].reduce(
                  (s, acc) =>
                    s +
                    (ACCOUNT[acc].allocations.find((a) => a.envelopeId === id)
                      ?.cents ?? 0),
                  0,
                ),
                true,
              )}
            />
          )
        })}
      </div>
    </SimpleCard>
  )
}

function RenameProposal({ width }: { width: Width }) {
  return (
    <Frame
      width={width}
      crumbs={['Tableau de bord']}
      active="Tableau de bord"
      title="Tableau de bord"
    >
      <div
        className={cn(
          'space-y-6',
          width >= 768 && 'grid grid-cols-2 items-start gap-6 space-y-0',
        )}
      >
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            La carte « Enveloppes » d’aujourd’hui, renommée :
          </p>
          <TrackedCard title="Budgets suivis" />
        </div>
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            Et les nouvelles enveloppes, si le tableau de bord en montre :
          </p>
          <EnvelopesTeaser />
        </div>
      </div>
    </Frame>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

function Proposal({ proposition, width }: Args) {
  if (proposition === 'virement') return <TransferProposal width={width} />
  if (proposition === 'alerte') return <LowBalanceProposal width={width} />
  return <RenameProposal width={width} />
}

export const UneProposition: StoryObj<Args> = {
  name: 'Une proposition',
  args: { proposition: 'virement', width: 390 },
  argTypes: {
    proposition: {
      control: 'inline-radio',
      options: ['virement', 'alerte', 'renommage'],
    },
    width: WIDTH_ARG,
  },
  render: (args) => <Proposal {...args} />,
}

export const LesTrois: StoryObj<Args> = {
  name: 'Les trois',
  args: { width: 390 },
  argTypes: { width: { control: 'inline-radio', options: [320, 390] } },
  render: ({ width }) => (
    <SideBySide
      items={[
        {
          label: '1. Virement rattaché',
          node: <TransferProposal width={width} />,
        },
        {
          label: '2. Solde sous les enveloppes',
          node: <LowBalanceProposal width={width} />,
        },
        {
          label: '3. « Budgets suivis »',
          node: <RenameProposal width={width} />,
        },
      ]}
    />
  ),
}
