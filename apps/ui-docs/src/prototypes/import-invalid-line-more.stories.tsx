import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, Card, CardContent, Input, cn } from '@capi/ui'
import { CircleAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Prototypes for #433: how the top of an unreadable line's card shows what the
 * file holds. Two more directions (beside « Ligne illisible (#433) ») for the owner to choose from, on the same three
 * synthetic lines. The PR that builds the chosen one deletes this file (#351).
 */

const meta = {
  title: 'Prototypes/Ligne illisible, autres pistes (#433)',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// --- Synthetic lines -------------------------------------------------------------

interface Cell {
  column: string
  value: string
  bad?: boolean
}

interface Issue {
  line: number
  title: string
  /** Why the blamed cell is wrong, in words. */
  why: string
  /** The line as written in the file. */
  raw: string
  /** null: the line could not be split into columns. */
  cells: Cell[] | null
}

const ISSUES: Issue[] = [
  {
    line: 6,
    title: 'Date invalide ou manquante',
    why: 'le 31 novembre n’existe pas',
    raw: '31/11/2026;20/11/2026;-8,00;;PAIEMENT CB 2011 KIOSQUE FICTIF CARTE 4242;',
    cells: [
      { column: 'Date', value: '31/11/2026', bad: true },
      { column: 'Date de valeur', value: '20/11/2026' },
      { column: 'Débit', value: '-8,00' },
      {
        column: 'Libellé',
        value: 'PAIEMENT CB 2011 KIOSQUE FICTIF CARTE 4242',
      },
    ],
  },
  {
    line: 7,
    title: 'Débit et crédit tous deux remplis',
    why: 'une opération est soit un débit, soit un crédit',
    raw: '19/11/2026;19/11/2026;-5,00;5,00;CB DOUBLE FICTIF;',
    cells: [
      { column: 'Date', value: '19/11/2026' },
      { column: 'Date de valeur', value: '19/11/2026' },
      { column: 'Débit', value: '-5,00', bad: true },
      { column: 'Crédit', value: '5,00', bad: true },
      { column: 'Libellé', value: 'CB DOUBLE FICTIF' },
    ],
  },
  {
    line: 8,
    title: 'Guillemet non fermé',
    why: 'la ligne n’a pas pu être découpée en colonnes',
    raw: '19/11/2026;19/11/2026;-3,00;;"CB GUILLEMET FICTIF;',
    cells: null,
  },
]

// --- The card around the variants (the same in every direction) ------------------

function IssueShell({
  issue,
  children,
}: {
  issue: Issue
  children: ReactNode
}) {
  return (
    <li>
      <Card size="sm">
        <CardContent className="@container space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-destructive flex items-center gap-1.5 text-sm font-medium">
              <CircleAlertIcon className="size-4 shrink-0" />
              {issue.title}
            </p>
            <span className="text-muted-foreground text-xs">
              Ligne {issue.line}
            </span>
          </div>
          {children}
          <FakeForm />
        </CardContent>
      </Card>
    </li>
  )
}

/** A stand-in for the fix form, greyed out: only the part above it changes. */
function FakeForm() {
  return (
    <div className="pointer-events-none grid gap-3 opacity-40 @md:grid-cols-2">
      <Input placeholder="Date" />
      <Input placeholder="Montant" />
      <Input placeholder="Libellé" className="@md:col-span-2" />
      <div className="flex justify-end @md:col-span-2">
        <Button size="sm">Vérifier</Button>
      </div>
    </div>
  )
}

function Page({
  title,
  description,
  render,
}: {
  title: string
  description: string
  render: (issue: Issue) => ReactNode
}) {
  return (
    <div className="bg-background min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <ul className="space-y-3">
          {ISSUES.map((issue) => (
            <IssueShell key={issue.line} issue={issue}>
              {render(issue)}
            </IssueShell>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Unsplit() {
  return (
    <p className="text-muted-foreground text-xs">
      La ligne n’a pas pu être découpée en colonnes : saisissez-la d’après le
      fichier.
    </p>
  )
}

// --- C. One sentence ---------------------------------------------------------

function Sentence({ issue }: { issue: Issue }) {
  if (!issue.cells) {
    return (
      <p className="text-sm">
        Cette ligne n’a pas pu être lue :{' '}
        <span className="text-muted-foreground">{issue.why}.</span>
        <span className="text-muted-foreground mt-1 block font-mono text-xs break-all">
          {issue.raw}
        </span>
      </p>
    )
  }
  const bad = issue.cells.filter((c) => c.bad)
  const rest = issue.cells.filter((c) => !c.bad)
  return (
    <div className="space-y-1">
      <p className="text-sm">
        {bad.map((c, i) => (
          <span key={c.column}>
            {i > 0 && ' et '}
            {c.column} :{' '}
            <span className="text-destructive font-mono font-semibold">
              {c.value}
            </span>
          </span>
        ))}{' '}
        <span className="text-muted-foreground">— {issue.why}.</span>
      </p>
      <p className="text-muted-foreground truncate text-xs">
        {rest.map((c) => c.value).join(' · ')}
      </p>
    </div>
  )
}

export const E_Phrase: Story = {
  name: 'E · Une phrase',
  render: () => (
    <Page
      title="E · Une phrase"
      description="Seulement le problème, dit en clair ; le reste de la ligne en petit dessous, pour se repérer."
      render={(issue) => <Sentence issue={issue} />}
    />
  ),
}

// --- D. A small table, one field per row -----------------------------------------

function FieldList({ issue }: { issue: Issue }) {
  if (!issue.cells) return <Unsplit />
  return (
    <dl className="divide-y overflow-hidden rounded-xl border text-sm">
      {issue.cells.map((cell) => (
        <div
          key={cell.column}
          className={cn(
            'flex items-baseline gap-3 px-3 py-1.5',
            cell.bad && 'bg-destructive/8',
          )}
        >
          <dt
            className={cn(
              'w-32 shrink-0 text-xs',
              cell.bad ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {cell.column}
          </dt>
          <dd
            className={cn(
              'min-w-0 flex-1 truncate font-mono',
              cell.bad && 'text-destructive font-semibold',
            )}
          >
            {cell.value}
          </dd>
          {cell.bad && (
            <CircleAlertIcon className="text-destructive size-4 shrink-0 self-center" />
          )}
        </div>
      ))}
    </dl>
  )
}

export const F_Fiche: Story = {
  name: 'F · Fiche',
  render: () => (
    <Page
      title="F · Fiche"
      description="Un champ par ligne, nom à gauche, valeur à droite, comme une fiche ; la ligne fautive teintée."
      render={(issue) => <FieldList issue={issue} />}
    />
  ),
}
