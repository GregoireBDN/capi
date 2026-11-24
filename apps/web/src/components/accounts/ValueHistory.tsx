import { Button } from '@capi/ui'
import { ClipboardPasteIcon, HistoryIcon, PlusIcon } from 'lucide-react'
import type { SnapshotDto } from '#/api/types.gen'
import { plural } from '#/lib/plural'
import type { AccountDetail } from './AccountDetails'
import { SnapshotRows } from './SnapshotList'

/** What the values of an account are, which changes their words. */
export type ValueHistoryKind = 'values' | 'statements'

const WORDS: Record<
  ValueHistoryKind,
  {
    label: string
    one: string
    many: string
    none: string
    about: string
    add: string
    editLabel: string
  }
> = {
  values: {
    label: 'Historique des valeurs',
    one: 'valeur',
    many: 'valeurs',
    none: 'aucune',
    about: 'La valeur du compte à chaque relevé ou mise à jour.',
    add: 'Ajouter une valeur',
    editLabel: 'Modifier la valeur du',
  },
  statements: {
    label: 'Soldes de relevés',
    one: 'solde',
    many: 'soldes',
    none: 'aucun',
    about:
      'Le solde indiqué sur un relevé, à sa date : il sert de point de départ quand les opérations n’ont pas de solde (historique saisi à la main).',
    add: 'Ajouter un solde de relevé',
    editLabel: 'Modifier le solde du',
  },
}

/**
 * An account's recorded values (#420): one row of « Plus d’informations »
 * (#447), whose screen lists them newest first, a tap opening one in
 * `SnapshotEditor` (correct, delete), with adding one and pasting a history.
 * An investment's values with the invested amount that counts, a bank
 * account's statement balances, a meal-voucher card's corrections. Absent
 * on an archived account without any.
 */
export function valueHistoryDetail({
  kind,
  snapshots,
  withContributions,
  invested,
  onEdit,
  onAdd,
  onPaste,
}: {
  kind: ValueHistoryKind
  snapshots: SnapshotDto[]
  withContributions: boolean
  /** The invested amount that counts at each date (#360). */
  invested?: ReadonlyMap<string, number | null>
  /** Absent when the account can't be changed (archived). */
  onEdit?: (snapshot: SnapshotDto) => void
  onAdd?: () => void
  onPaste?: () => void
}): AccountDetail | null {
  if (snapshots.length === 0 && !onAdd) return null
  const words = WORDS[kind]
  return {
    id: `value-history-${kind}`,
    icon: HistoryIcon,
    label: words.label,
    summary:
      snapshots.length === 0
        ? words.none
        : plural(snapshots.length, words.one, words.many),
    description: words.about,
    content: (
      <>
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
            label={words.label}
            editLabel={words.editLabel}
          />
        )}
      </>
    ),
  }
}
