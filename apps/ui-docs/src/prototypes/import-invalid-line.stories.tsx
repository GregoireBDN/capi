import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, Card, CardContent, Input, cn } from '@capi/ui'
import { CheckIcon, CircleAlertIcon, FileTextIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Prototypes for #433: four ways to show what an unreadable line of the
 * file holds, above its fix form, for the owner to choose from. Synthetic
 * data only. The PR that builds the chosen one deletes this file (#351).
 */

const meta = {
  title: 'Prototypes/Ligne illisible (#433)',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

interface Cell {
  column: string
  value: string
  bad?: boolean
}

interface BadLine {
  line: number
  reason: string
  /** The problem in one sentence, naming the value. */
  problem: ReactNode
  cells: Cell[]
  form: { date: string; amount: string; label: string }
  /** Field of the form the error is about. */
  badField: 'date' | 'amount'
}

const LINES: BadLine[] = [
  {
    line: 6,
    reason: 'Date invalide ou manquante',
    problem: (
      <>
        La date <Mono>31/11/2026</Mono> n’existe pas.
      </>
    ),
    cells: [
      { column: 'Date', value: '31/11/2026', bad: true },
      { column: 'Date de valeur', value: '20/11/2026' },
      { column: 'Débit', value: '-8,00' },
      {
        column: 'Libellé',
        value: 'PAIEMENT CB 2011 KIOSQUE FICTIF CARTE 4242',
      },
    ],
    form: {
      date: '',
      amount: '8',
      label: 'PAIEMENT CB 2011 KIOSQUE FICTIF CARTE 4242',
    },
    badField: 'date',
  },
  {
    line: 7,
    reason: 'Débit et crédit tous deux remplis',
    problem: (
      <>
        Débit <Mono>-5,00</Mono> et crédit <Mono>5,00</Mono> sont remplis tous
        les deux : lequel garder ?
      </>
    ),
    cells: [
      { column: 'Date', value: '19/11/2026' },
      { column: 'Date de valeur', value: '19/11/2026' },
      { column: 'Débit', value: '-5,00', bad: true },
      { column: 'Crédit', value: '5,00', bad: true },
      { column: 'Libellé', value: 'CB DOUBLE FICTIF' },
    ],
    form: { date: '2026-11-19', amount: '', label: 'CB DOUBLE FICTIF' },
    badField: 'amount',
  },
]

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono">{children}</span>
}

function Frames({ children }: { children: (wide: boolean) => ReactNode }) {
  return (
    <div className="bg-muted/40 flex min-h-screen flex-wrap items-start justify-center gap-8 p-6">
      <div
        className="bg-background w-[390px] shrink-0 overflow-hidden rounded-[2rem] border shadow-lg"
        data-frame="phone"
      >
        <div className="space-y-3 p-4">{children(false)}</div>
      </div>
      <div
        className="bg-background w-[1000px] shrink-0 overflow-hidden rounded-xl border shadow-lg"
        data-frame="wide"
      >
        <div className="space-y-3 p-6">{children(true)}</div>
      </div>
    </div>
  )
}

function Header({ line, title }: { line: BadLine; title?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <span className="text-destructive flex min-w-0 items-start gap-1.5 font-medium">
        <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{title ?? line.reason}</span>
      </span>
      <span className="text-muted-foreground shrink-0 text-xs">
        Ligne {line.line}
      </span>
    </div>
  )
}

/** The fix form, simplified; `hints` shows the file's value under each field. */
function Form({
  line,
  wide,
  hints,
}: {
  line: BadLine
  wide: boolean
  hints?: boolean
}) {
  const cell = (column: string) =>
    line.cells.find((c) => c.column === column)?.value
  const field = (
    label: string,
    input: ReactNode,
    hint: string | undefined,
    bad: boolean,
    className?: string,
  ) => (
    <label className={cn('min-w-0 space-y-1', className)}>
      <span className="text-sm font-medium">{label}</span>
      {input}
      {hints && hint !== undefined && (
        <span
          className={cn(
            'block truncate text-xs',
            bad ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {bad ? 'Dans le fichier : ' : 'Fichier : '}
          <Mono>{hint}</Mono>
        </span>
      )}
    </label>
  )
  const amountHint =
    line.badField === 'amount'
      ? `${cell('Débit')} / ${cell('Crédit')}`
      : cell('Débit')
  return (
    <div
      className={cn(
        'grid items-start gap-3',
        wide ? 'grid-cols-[10rem_9rem_minmax(0,1fr)_auto]' : 'grid-cols-2',
      )}
    >
      {field(
        'Date',
        <Input
          type="date"
          defaultValue={line.form.date}
          aria-invalid={hints && line.badField === 'date'}
        />,
        cell('Date'),
        line.badField === 'date',
      )}
      {field(
        'Montant',
        <Input
          defaultValue={line.form.amount}
          placeholder="−  0,00 €"
          aria-invalid={hints && line.badField === 'amount'}
        />,
        amountHint,
        line.badField === 'amount',
      )}
      {field(
        'Libellé',
        <Input defaultValue={line.form.label} />,
        undefined,
        false,
        cn(!wide && 'col-span-2'),
      )}
      <div className={cn('flex justify-end', wide ? 'pt-7' : 'col-span-2')}>
        <Button>
          <CheckIcon /> Vérifier
        </Button>
      </div>
    </div>
  )
}

function Lines({
  wide,
  top,
  title,
  hints,
}: {
  wide: boolean
  top?: (line: BadLine, wide: boolean) => ReactNode
  title?: (line: BadLine) => ReactNode
  hints?: boolean
}) {
  return (
    <>
      <h3 className="flex items-center gap-2 font-semibold">
        <span className="bg-destructive grid size-6 place-items-center rounded-full text-xs text-white">
          1
        </span>
        Corriger 2 lignes illisibles
      </h3>
      {LINES.map((line) => (
        <Card key={line.line} size="sm" className="border-destructive/30">
          <CardContent className="space-y-3">
            <Header line={line} title={title?.(line)} />
            {top?.(line, wide)}
            <Form line={line} wide={wide} hints={hints} />
          </CardContent>
        </Card>
      ))}
    </>
  )
}

// --- A · Tableau -----------------------------------------------------------------

/** A · the line as a one-row spreadsheet: column names on top, the bad cell red. */
function TableTop(line: BadLine) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-muted-foreground text-xs">
          <tr>
            {line.cells.map((cell) => (
              <th
                key={cell.column}
                className={cn(
                  'px-2.5 py-1 text-left font-normal whitespace-nowrap',
                  cell.bad && 'text-destructive font-medium',
                )}
              >
                {cell.column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {line.cells.map((cell) => (
              <td
                key={cell.column}
                className={cn(
                  'border-t px-2.5 py-1.5 font-mono text-xs whitespace-nowrap',
                  cell.bad &&
                    'bg-destructive/10 text-destructive font-semibold',
                )}
              >
                {cell.value}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export const A_Tableau: Story = {
  name: 'A · Tableau',
  render: () => (
    <Frames>{(wide) => <Lines wide={wide} top={TableTop} />}</Frames>
  ),
}

// --- B · Ligne brute --------------------------------------------------------------

/** B · the line as written in the file, the bad value underlined in red. */
function RawTop(line: BadLine) {
  return (
    <div className="bg-muted/50 space-y-1 rounded-lg px-3 py-2">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <FileTextIcon aria-hidden className="size-3.5" />
        Dans le fichier
      </p>
      <p className="font-mono text-xs leading-relaxed break-all">
        {line.cells.map((cell, index) => (
          <span key={cell.column}>
            {index > 0 && <span className="text-muted-foreground/60">;</span>}
            <span
              title={cell.column}
              className={cn(
                cell.bad &&
                  'text-destructive decoration-destructive bg-destructive/10 rounded-sm px-0.5 font-semibold underline decoration-wavy underline-offset-4',
              )}
            >
              {cell.value}
            </span>
          </span>
        ))}
      </p>
    </div>
  )
}

export const B_LigneBrute: Story = {
  name: 'B · Ligne brute',
  render: () => <Frames>{(wide) => <Lines wide={wide} top={RawTop} />}</Frames>,
}

// --- C · Le problème d'abord -------------------------------------------------------

/** C · one sentence that names the problem, then a short muted summary. */
function SummaryTop(line: BadLine) {
  const good = line.cells.filter((cell) => !cell.bad)
  return (
    <p className="text-muted-foreground truncate text-xs">
      Lu dans le fichier :{' '}
      {good.map((cell, index) => (
        <span key={cell.column}>
          {index > 0 && ' · '}
          <Mono>{cell.value}</Mono>
        </span>
      ))}
    </p>
  )
}

export const C_ProblemeDabord: Story = {
  name: 'C · Le problème d’abord',
  render: () => (
    <Frames>
      {(wide) => (
        <Lines wide={wide} title={(line) => line.problem} top={SummaryTop} />
      )}
    </Frames>
  ),
}

// --- D · Dans le formulaire --------------------------------------------------------

/** D · no block above: each field says what the file held, the bad one in red. */
export const D_DansLeFormulaire: Story = {
  name: 'D · Dans le formulaire',
  render: () => (
    <Frames>
      {(wide) => <Lines wide={wide} title={(line) => line.problem} hints />}
    </Frames>
  ),
}
