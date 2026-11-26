import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, Card, CardContent, Input, cn } from '@capi/ui'
import { ChevronDownIcon, CircleAlertIcon, FileTextIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Prototypes for #433: how the top of an unreadable line's card shows what the
 * file holds. Five directions for the owner to choose from, on the same three
 * synthetic lines. The PR that builds the chosen one deletes this file (#351).
 */

const meta = {
  title: 'Prototypes/Ligne illisible (#433)',
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

const BAD_FRAGMENT: Record<number, string[]> = {
  6: ['31/11/2026'],
  7: ['-5,00', '5,00'],
  8: ['"CB GUILLEMET FICTIF;'],
}

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

// --- A. Current: the file's row ---------------------------------------------------

function RowStrip({ issue }: { issue: Issue }) {
  if (!issue.cells) return <Unsplit />
  return (
    <ul className="bg-border flex flex-wrap gap-px overflow-hidden rounded-xl border">
      {issue.cells.map((cell) => (
        <li
          key={cell.column}
          className={cn(
            'min-w-0 flex-auto px-3 py-1.5',
            cell.bad
              ? 'bg-[color-mix(in_oklab,var(--destructive)_10%,var(--card))]'
              : 'bg-card',
          )}
        >
          <p
            className={cn(
              'flex items-center gap-1 text-xs',
              cell.bad ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {cell.bad && <CircleAlertIcon className="size-3.5" />}
            {cell.column}
          </p>
          <p
            className={cn(
              'truncate font-mono text-sm',
              cell.bad && 'text-destructive font-medium',
            )}
          >
            {cell.value}
          </p>
        </li>
      ))}
    </ul>
  )
}

export const A_RangeeDuFichier: Story = {
  name: 'A. Rangée du fichier (actuel)',
  render: () => (
    <Page
      title="A. Rangée du fichier"
      description="Ce qui est en place : les cellules côte à côte, la fautive en rouge."
      render={(issue) => <RowStrip issue={issue} />}
    />
  ),
}

// --- B. The raw line, as in the file ------------------------------------------

function RawLine({ issue }: { issue: Issue }) {
  const bad = BAD_FRAGMENT[issue.line] ?? []
  // Highlight the blamed cells inside the raw text, cell by cell.
  const parts = issue.cells
    ? issue.raw.split(';').map((part, i, all) => (
        <span key={i}>
          <span
            className={cn(
              bad.includes(part) &&
                'bg-destructive/15 text-destructive rounded px-0.5 font-semibold',
            )}
          >
            {part}
          </span>
          {i < all.length - 1 && (
            <span className="text-muted-foreground/60">;</span>
          )}
        </span>
      ))
    : [
        <span
          key="all"
          className="decoration-destructive underline decoration-wavy underline-offset-4"
        >
          {issue.raw}
        </span>,
      ]
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <FileTextIcon className="size-3.5" />
        Dans le fichier, {issue.why}
      </p>
      <p className="bg-muted/60 overflow-x-auto rounded-lg px-3 py-2 font-mono text-sm break-all whitespace-pre-wrap">
        {parts}
      </p>
    </div>
  )
}

export const B_LigneBrute: Story = {
  name: 'B. Ligne brute',
  render: () => (
    <Page
      title="B. Ligne brute"
      description="La ligne telle qu’elle est écrite dans le fichier, le morceau fautif surligné, la raison en une phrase au-dessus."
      render={(issue) => <RawLine issue={issue} />}
    />
  ),
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

export const C_Phrase: Story = {
  name: 'C. Une phrase',
  render: () => (
    <Page
      title="C. Une phrase"
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

export const D_Fiche: Story = {
  name: 'D. Fiche',
  render: () => (
    <Page
      title="D. Fiche"
      description="Un champ par ligne, nom à gauche, valeur à droite, comme une fiche ; la ligne fautive teintée."
      render={(issue) => <FieldList issue={issue} />}
    />
  ),
}

// --- E. The problem only, the rest folded ---------------------------------------

function ProblemFirst({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false)
  const bad = issue.cells?.filter((c) => c.bad) ?? []
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {issue.cells ? (
          bad.map((c, i) => (
            <span key={c.column} className="flex items-center gap-2">
              {i > 0 && (
                <span className="text-muted-foreground text-sm">et</span>
              )}
              <span className="border-destructive/40 bg-destructive/8 inline-flex flex-col rounded-lg border px-3 py-1">
                <span className="text-destructive text-xs">{c.column}</span>
                <span className="text-destructive font-mono text-base font-semibold">
                  {c.value}
                </span>
              </span>
            </span>
          ))
        ) : (
          <span className="border-destructive/40 bg-destructive/8 text-destructive rounded-lg border px-3 py-1 font-mono text-sm break-all">
            {issue.raw}
          </span>
        )}
        <span className="text-muted-foreground text-sm">{issue.why}</span>
      </div>
      {issue.cells && (
        <div>
          <button
            type="button"
            className="text-muted-foreground flex min-h-11 items-center gap-1 text-xs"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <ChevronDownIcon
              className={cn(
                'size-3.5 transition-transform',
                open && 'rotate-180',
              )}
            />
            Toute la ligne
          </button>
          {open && (
            <p className="text-muted-foreground bg-muted/60 rounded-lg px-3 py-2 font-mono text-xs break-all">
              {issue.raw}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export const E_ProblemeSeul: Story = {
  name: 'E. Le problème seul',
  render: () => (
    <Page
      title="E. Le problème seul"
      description="Seule la cellule fautive, en grand, avec la raison ; le reste de la ligne replié sous « Toute la ligne »."
      render={(issue) => <ProblemFirst issue={issue} />}
    />
  ),
}
