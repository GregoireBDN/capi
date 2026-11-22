import { Button, Sheet, SheetContent, useIsMobile } from '@finances/ui'
import { ClipboardPasteIcon, PlusIcon } from 'lucide-react'
import type { SnapshotDto } from '#/api/types.gen'
import {
  EditorHeader,
  editorSide,
  FORM_SHEET_SCREEN,
  FORM_SHEET_SIDE,
  SheetScroll,
} from '#/components/sheets/form-sheet'
import { plural } from '#/lib/plural'
import { SnapshotRows } from './SnapshotList'

/** What the values of an account are, which changes their words. */
export type ValueHistoryKind = 'values' | 'statements'

const WORDS: Record<
  ValueHistoryKind,
  {
    one: string
    many: string
    none: string
    about: string
    add: string
    editLabel: string
    listLabel: string
  }
> = {
  values: {
    one: 'valeur enregistrée',
    many: 'valeurs enregistrées',
    none: 'Aucune valeur enregistrée.',
    about: 'La valeur du compte à chaque relevé ou mise à jour.',
    add: 'Ajouter une valeur',
    editLabel: 'Modifier la valeur du',
    listLabel: 'Valeurs enregistrées',
  },
  statements: {
    one: 'solde de relevé',
    many: 'soldes de relevés',
    none: 'Aucun solde de relevé.',
    about:
      'Le solde indiqué sur un relevé, à sa date : il sert de point de départ quand les opérations n’ont pas de solde (historique saisi à la main).',
    add: 'Ajouter un solde de relevé',
    editLabel: 'Modifier le solde du',
    listLabel: 'Soldes de relevés',
  },
}

/**
 * An account's recorded values in a screen of their own (#420): the list
 * took room on the account page while it is rarely read. Opened from the
 * page's « Historique des valeurs »; full screen on phones, a centred modal
 * elsewhere (#385, #394). Newest first, a tap opens a value in
 * `SnapshotEditor` (correct or delete it); adding one or pasting a history
 * from here too.
 */
export function ValueHistorySheet({
  open,
  onOpenChange,
  kind,
  snapshots,
  withContributions,
  invested,
  onEdit,
  onAdd,
  onPaste,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: ValueHistoryKind
  snapshots: SnapshotDto[]
  withContributions: boolean
  /** The invested amount that counts at each date (#360). */
  invested?: ReadonlyMap<string, number | null>
  /** Absent when the account can't be changed (archived). */
  onEdit?: (snapshot: SnapshotDto) => void
  onAdd?: () => void
  onPaste?: () => void
}) {
  const isMobile = useIsMobile()
  const words = WORDS[kind]
  const count =
    snapshots.length === 0
      ? words.none
      : plural(snapshots.length, words.one, words.many)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className={isMobile ? FORM_SHEET_SCREEN : FORM_SHEET_SIDE}
      >
        <EditorHeader title="Historique des valeurs" description={count} />
        <SheetScroll className="space-y-4 px-4 pb-6">
          <p className="text-muted-foreground text-sm">{words.about}</p>
          {(onAdd || onPaste) && (
            <div className="@container">
              <div className="grid gap-2 @md:grid-cols-2">
                {onAdd && (
                  <Button
                    outline
                    variant="secondary"
                    iconStart={<PlusIcon />}
                    onClick={onAdd}
                  >
                    {words.add}
                  </Button>
                )}
                {onPaste && (
                  <Button
                    outline
                    variant="secondary"
                    iconStart={<ClipboardPasteIcon />}
                    onClick={onPaste}
                  >
                    Coller un historique
                  </Button>
                )}
              </div>
            </div>
          )}
          {snapshots.length > 0 && (
            <SnapshotRows
              snapshots={snapshots}
              withContributions={withContributions}
              invested={invested}
              onEdit={onEdit}
              label={words.listLabel}
              editLabel={words.editLabel}
            />
          )}
        </SheetScroll>
      </SheetContent>
    </Sheet>
  )
}
