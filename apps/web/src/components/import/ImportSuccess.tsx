import { Link } from '@tanstack/react-router'
import { Button, Card, CardContent } from '@finances/ui'
import { CircleCheckIcon } from 'lucide-react'
import { ROUTES } from '#/lib/routes'
import { REVIEW_PATH } from './api'
import { formatPeriod, plural } from './format'
import type { CommitOutcome } from './ImportPreview'

interface ImportSuccessProps {
  outcome: CommitOutcome
  onAnother: () => void
}

export function ImportSuccess({ outcome, onAnother }: ImportSuccessProps) {
  const { detail, forReview } = outcome
  const { counts } = detail
  const details = [
    counts.duplicates > 0 &&
      plural(counts.duplicates, 'doublon ignoré', 'doublons ignorés'),
    counts.skipped > 0 &&
      plural(counts.skipped, 'opération écartée', 'opérations écartées'),
    counts.issues > 0 &&
      plural(counts.issues, 'ligne illisible', 'lignes illisibles'),
  ].filter(Boolean)

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-4 text-center">
        <CircleCheckIcon className="text-success-foreground dark:text-success size-10" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Import terminé</h2>
          <p className="text-sm">
            {plural(
              counts.inserted,
              'opération ajoutée',
              'opérations ajoutées',
            )}{' '}
            à {detail.accountName}{' '}
            {formatPeriod(detail.periodStart, detail.periodEnd)}.
          </p>
          {details.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {details.join(' · ')}
            </p>
          )}
          {forReview > 0 && (
            <p className="text-sm">
              {plural(forReview, 'opération', 'opérations')} sans catégorie{' '}
              {forReview > 1 ? 'attendent' : 'attend'} votre revue.
            </p>
          )}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button asChild>
            <Link to={ROUTES.transactions}>Voir les opérations</Link>
          </Button>
          {forReview > 0 && (
            <Button asChild variant="warning" outline>
              {/* Plain link: the review queue route ships separately (#14). */}
              <a href={REVIEW_PATH}>À revoir</a>
            </Button>
          )}
          <Button variant="secondary" ghost onClick={onAnother}>
            Importer un autre fichier
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
