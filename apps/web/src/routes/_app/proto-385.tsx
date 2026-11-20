import { Button, setSheetBarStyle, type SheetBarStyle } from '@finances/ui'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageHeader } from '#/components/app-shell/PageHeader'

// Throwaway page of #385: picks the full-screen editors' header style for
// this browser, to compare them on the phone. Deleted with the switch.

export const Route = createFileRoute('/_app/proto-385')({
  head: () => ({ meta: [{ title: 'En-têtes · Finances' }] }),
  component: ProtoPage,
})

const STYLES: { id: SheetBarStyle; name: string; text: string }[] = [
  {
    id: 'ronds',
    name: 'Ronds',
    text: '✕ dans un rond gris, le titre au milieu, ✓ dans un rond bleu.',
  },
  {
    id: 'pastilles',
    name: 'Pastilles',
    text: '« Annuler » en pastille grise, le titre au milieu, « Enregistrer » en pastille bleue.',
  },
  {
    id: 'discret',
    name: 'Discret',
    text: '✕ sans fond, le titre à gauche à côté, « Enregistrer » en pastille bleue à droite.',
  },
  {
    id: 'grand',
    name: 'Grand titre',
    text: 'Une barre fine (✕ sans fond, « Enregistrer » en pastille), puis le titre en grand, à gauche.',
  },
]

const PLACES = [
  ['Comptes › PEA › ⋮ › Mettre à jour la valeur', 'court, Note en bas'],
  ['Comptes › PEA › ⋮ › Modifier', 'Nom, Établissement, Supprimer'],
  ['Comptes › PEA › « Modifier » sous Investi', 'Montant investi, par étapes'],
  ['Comptes › PEA › toucher une valeur de la liste', 'avec « Supprimer »'],
  ['Épargne › Ajouter un placement', 'long'],
  ['Épargne › un objectif', 'montant, date'],
  ['Comptes › Ledger › une ligne', 'ligne crypto, par étapes'],
  ['Entre proches › Payé pour moi', 'avec « Je dois à … » en bas'],
  ['Réglages › Contacts › un contact', 'court'],
] as const

function ProtoPage() {
  const [style, setStyle] = useState<SheetBarStyle>('ronds')
  useEffect(() => {
    try {
      const stored = localStorage.getItem('proto-385-bar') as SheetBarStyle
      if (STYLES.some((s) => s.id === stored)) setStyle(stored)
    } catch {
      // Default style.
    }
  }, [])
  const current = STYLES.find((s) => s.id === style) ?? STYLES[0]
  return (
    <div className="@container space-y-6">
      <PageHeader
        title="En-têtes plein écran"
        description="#385 : choisissez un style, puis ouvrez les panneaux ci-dessous."
      />
      <section className="bg-card space-y-3 rounded-xl border p-4">
        <div
          className="grid grid-cols-2 gap-2"
          role="group"
          aria-label="Style de l’en-tête"
        >
          {STYLES.map((s) => (
            <Button
              key={s.id}
              variant={s.id === style ? 'primary' : 'secondary'}
              outline={s.id !== style}
              aria-pressed={s.id === style}
              className="min-h-11"
              onClick={() => {
                setStyle(s.id)
                setSheetBarStyle(s.id)
              }}
            >
              {s.name}
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-sm">{current.text}</p>
      </section>
      <section className="bg-card space-y-2 rounded-xl border p-4">
        <h2 className="font-heading text-base font-medium">Où l’essayer</h2>
        <ul className="space-y-2 text-sm">
          {PLACES.map(([where, what]) => (
            <li key={where}>
              {where} <span className="text-muted-foreground">· {what}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-sm">
          Raccourcis :{' '}
          <Link to="/accounts" className="underline">
            Comptes
          </Link>{' '}
          ·{' '}
          <Link to="/savings" className="underline">
            Épargne
          </Link>{' '}
          ·{' '}
          <Link to="/owed" className="underline">
            Entre proches
          </Link>
        </p>
      </section>
    </div>
  )
}
