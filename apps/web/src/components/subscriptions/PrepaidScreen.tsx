import type { TransactionDto } from '#/api/types.gen'
import { addMonths, formatDayMonth, todayInParis } from './format'
import { PrepaidTermControl } from './PrepaidTermControl'

/**
 * « Abonnement prépayé » of the transaction editor (#314): declares an
 * expense as a subscription paid upfront for 12, 24 or 36 months, or
 * changes the term of the one it pays (« Non » makes it an ordinary item
 * again). A tap chooses the term (#398: a list, each term's monthly cost
 * and renewal) in the editor's draft, saved with the rest by « Enregistrer »
 * (#435).
 */
export function PrepaidScreen({
  item,
  value,
  onChange,
}: {
  /** The transaction as the draft has it (its amount and day). */
  item: TransactionDto
  /** The term chosen, null when not prepaid. */
  value: number | null
  onChange: (term: number | null) => void
}) {
  const today = todayInParis()
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Payé une fois pour plusieurs mois : compté dans son mois, hors des
        moyennes.
      </p>
      <PrepaidTermControl
        value={value}
        // « Non » once it pays an item, or to take back a term just chosen.
        allowNone={item.prepaidItemId !== null || value !== null}
        amountCents={-item.amountCents}
        detail={(months) =>
          `Renouvellement le ${formatDayMonth(addMonths(item.bookingDate, months), today)}`
        }
        onChange={onChange}
      />
    </div>
  )
}
