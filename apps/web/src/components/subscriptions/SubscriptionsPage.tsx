import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  EmptyState,
  Skeleton,
  Spinner,
  cn,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  CalendarClockIcon,
  RepeatIcon,
  ScanSearchIcon,
  UploadIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { RecurringItemDto } from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { plural } from '#/lib/plural'
import { categoriesQuery } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { ROW_BUTTON, ROW_LIST } from '#/lib/row-list'
import { groupItems, todayInParis } from './format'
import {
  afterRecurringChanged,
  detectRecurring,
  recurringErrorMessage,
  recurringListQuery,
} from './queries'
import { AddPrepaidSheet } from './AddPrepaidSheet'
import { EndedSection } from './EndedSection'
import { EndRecurringSheet } from './EndRecurringSheet'
import { RecurringEditor } from './RecurringEditor'
import { RecurringKpis } from './RecurringKpis'
import { RecurringList } from './RecurringList'
import { RenewalReminders } from './RenewalReminders'
import { SuggestionsSection } from './SuggestionsSection'
import { UpcomingTimeline } from './UpcomingTimeline'

function PageSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-36 w-full rounded-xl" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  )
}

/**
 * Subscriptions and fixed costs: recurring series detected from the
 * transactions (transfers and one-offs never count), reviewed by the user,
 * with their monthly and yearly costs, price changes and the next debits.
 */
export function SubscriptionsPage() {
  const today = todayInParis()
  const queryClient = useQueryClient()
  const list = useQuery(recurringListQuery)
  const categories = useQuery(categoriesQuery)
  const [editing, setEditing] = useState<RecurringItemDto | null>(null)
  const [ending, setEnding] = useState<RecurringItemDto | null>(null)
  const [addingPrepaid, setAddingPrepaid] = useState(false)

  const detect = useMutation({
    // `automatic`: run on its own when the page has nothing to show.
    mutationFn: (_: { automatic: boolean }) => detectRecurring(),
    onSuccess: async (result, { automatic }) => {
      if (!automatic || result.createdCount > 0) {
        toast.success(
          result.createdCount > 0
            ? `${plural(result.createdCount, 'nouvelle suggestion', 'nouvelles suggestions')}`
            : 'Analyse terminée : aucune nouvelle suggestion',
        )
      }
      await afterRecurringChanged(queryClient)
    },
    onError: (error, { automatic }) => {
      if (!automatic) toast.error(recurringErrorMessage(error))
    },
  })

  const groups = list.data ? groupItems(list.data) : null
  const confirmedCount = groups
    ? groups.subscriptions.length +
      groups.fixed.length +
      groups.variable.length +
      groups.incomes.length
    : 0
  const empty =
    groups !== null &&
    confirmedCount === 0 &&
    groups.suggestions.length === 0 &&
    groups.ended.length === 0

  // Nothing found yet (history imported before the detection ran on
  // imports, or never analysed): look once, without waiting for the button.
  const autoDetected = useRef(false)
  const mutateDetect = detect.mutate
  useEffect(() => {
    if (!empty || autoDetected.current) return
    autoDetected.current = true
    mutateDetect({ automatic: true })
  }, [empty, mutateDetect])
  const searching = empty && detect.isPending

  const analyse = (
    <Button
      iconStart={<ScanSearchIcon />}
      loading={detect.isPending}
      onClick={() => detect.mutate({ automatic: false })}
    >
      Analyser mes opérations
    </Button>
  )

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Abonnements"
        description="Abonnements, charges fixes et revenus qui reviennent chaque semaine, mois ou année."
        actions={[
          {
            label: 'Ajouter un abonnement prépayé',
            icon: <CalendarClockIcon />,
            onSelect: () => setAddingPrepaid(true),
          },
        ]}
      />

      {list.isPending && <PageSkeleton />}

      {list.isError && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger les abonnements.</AlertTitle>
          <AlertDescription>
            <Button size="sm" outline onClick={() => void list.refetch()}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {empty && (
        <EmptyState
          icon={searching ? <Spinner /> : <RepeatIcon />}
          title={
            searching
              ? 'Recherche des opérations récurrentes…'
              : 'Aucune opération récurrente trouvée'
          }
          description={
            searching
              ? 'Loyer, abonnements, assurances ou salaire sont repérés dans vos opérations importées.'
              : 'Il faut quelques mois d’opérations pour repérer loyer, abonnements ou salaire. L’analyse se relance à chaque import.'
          }
          actions={
            searching ? undefined : (
              <>
                <Button asChild>
                  <Link to={ROUTES.import}>
                    <UploadIcon aria-hidden />
                    Importer un relevé
                  </Link>
                </Button>
                <Button
                  outline
                  variant="secondary"
                  iconStart={<ScanSearchIcon />}
                  onClick={() => detect.mutate({ automatic: false })}
                >
                  Relancer l’analyse
                </Button>
              </>
            )
          }
        />
      )}

      {groups && !empty && (
        <>
          <div className="flex justify-end">{analyse}</div>
          <RecurringKpis groups={groups} />

          <RenewalReminders
            items={list.data ?? []}
            today={today}
            onEnd={setEnding}
          />

          {groups.suggestions.length > 0 && (
            <SuggestionsSection
              suggestions={groups.suggestions}
              onEdit={setEditing}
            />
          )}

          {confirmedCount > 0 && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @3xl:items-start">
              <section
                aria-label="Opérations récurrentes"
                className="space-y-5"
              >
                <RecurringList
                  title="Abonnements"
                  items={groups.subscriptions}
                  today={today}
                  onEdit={setEditing}
                />
                <RecurringList
                  title="Autres charges fixes"
                  items={groups.fixed}
                  today={today}
                  onEdit={setEditing}
                />
                <RecurringList
                  title="Charges variables"
                  description="Récurrentes, mais pas comptées comme charges fixes."
                  items={groups.variable}
                  today={today}
                  onEdit={setEditing}
                />
                <RecurringList
                  title="Revenus récurrents"
                  items={groups.incomes}
                  today={today}
                  onEdit={setEditing}
                />
              </section>
              <UpcomingTimeline items={list.data ?? []} today={today} />
            </div>
          )}

          <EndedSection
            items={groups.ended}
            today={today}
            onEdit={setEditing}
          />

          {groups.dismissed.length > 0 && (
            <details className="group">
              <summary className="text-muted-foreground cursor-pointer text-sm">
                {plural(
                  groups.dismissed.length,
                  'élément ignoré',
                  'éléments ignorés',
                )}
              </summary>
              <ul className={cn('mt-2', ROW_LIST)}>
                {groups.dismissed.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(ROW_BUTTON, 'truncate p-3 text-sm')}
                      onClick={() => setEditing(item)}
                    >
                      {item.name}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <RecurringEditor
        item={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        categories={categories.data ?? []}
        today={today}
        onEnd={(item) => {
          setEditing(null)
          setEnding(item)
        }}
      />
      <AddPrepaidSheet
        open={addingPrepaid}
        onOpenChange={setAddingPrepaid}
        today={today}
      />
      <EndRecurringSheet
        item={ending}
        onOpenChange={(open) => {
          if (!open) setEnding(null)
        }}
        today={today}
      />
    </div>
  )
}
