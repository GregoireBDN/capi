import { Button } from '@finances/ui'
import { SparklesIcon, XIcon } from 'lucide-react'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import { CategoryBadge } from './CategoryBadge'
import { displayLabel } from './labels'

/** The correction a rule can be created from. */
export interface RuleOffer {
  transaction: TransactionDto
  category: CategoryDto
}

interface RuleOfferBannerProps {
  offer: RuleOffer
  /** Opens `RuleFromCorrectionDialog`. */
  onCreateRule: () => void
  onDismiss: () => void
}

/**
 * Sticky banner shown after a category correction, offering to turn it into a
 * rule for similar transactions.
 */
export function RuleOfferBanner({
  offer,
  onCreateRule,
  onDismiss,
}: RuleOfferBannerProps) {
  return (
    <div
      role="region"
      aria-label="Créer une règle"
      className="bg-card sticky top-4 z-10 flex flex-col gap-3 rounded-xl border p-3 shadow-sm lg:flex-row lg:items-center"
    >
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm">
        <span className="break-words">
          « {displayLabel(offer.transaction)} » classée dans
        </span>
        <CategoryBadge category={offer.category} />
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          iconStart={<SparklesIcon />}
          className="h-auto min-h-8 flex-1 py-1.5 whitespace-normal lg:flex-none"
          onClick={onCreateRule}
        >
          Créer une règle pour les opérations similaires
        </Button>
        <Button
          size="sm"
          variant="secondary"
          ghost
          iconOnly
          aria-label="Ignorer"
          onClick={onDismiss}
        >
          <XIcon />
        </Button>
      </div>
    </div>
  )
}
