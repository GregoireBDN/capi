import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  LandmarkIcon,
  PencilIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { EnvelopeDetailDto } from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { CategoryAvatar } from '#/components/categories/category-icons'
import { formatShortMonth } from '#/lib/calendar'
import { formatCents, formatWholeEuros } from '#/lib/money'
import { categoriesQuery } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { EnvelopeAvatar, Gauge, SplitBar } from './EnvelopeAvatar'
import { EnvelopeEditor } from './EnvelopeEditor'
import { dueText, envelopeColor, planText } from './format'
import { AddWithdrawSheet } from './AddWithdrawSheet'
import type { AddOrWithdraw } from './AddWithdrawSheet'
import { envelopeErrorMessage, envelopeQuery } from './queries'

const BACK = { label: 'Épargne', to: ROUTES.savings } as const

/** Account colours, in the order the envelope lists them. */
const ACCOUNT_COLORS = [
  'var(--chart-1)',
  'var(--chart-3)',
  'var(--chart-7)',
  'var(--chart-4)',
  'var(--chart-2)',
  'var(--chart-6)',
]

/**
 * An envelope's page (#428, « A. Jauge »): the total over its target with
 * a gauge in its colour and what it takes per month, « Ajouter », « Retirer » and
 * « Modifier »; then « Par compte », « Évolution » and « Paie pour ». On a
 * computer the first card spans both columns.
 */
export function EnvelopePage({ envelopeId }: { envelopeId: string }) {
  const detail = useQuery(envelopeQuery(envelopeId))
  const [moving, setMoving] = useState<AddOrWithdraw | null>(null)
  const [editing, setEditing] = useState(false)

  if (detail.isPending) {
    return (
      <div className="@container space-y-6">
        <PageHeader title="…" back={BACK} />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }
  if (detail.isError) {
    return (
      <div className="@container space-y-6">
        <PageHeader title="Enveloppe" back={BACK} />
        <p className="text-destructive text-sm">
          {envelopeErrorMessage(detail.error)}
        </p>
      </div>
    )
  }
  const envelope = detail.data
  const color = envelopeColor(envelope)
  const accountColor = new Map(
    envelope.accounts.map((a, i) => [
      a.accountId,
      ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
    ]),
  )
  const plan = planText(envelope)

  return (
    <div className="@container space-y-6">
      <PageHeader
        title={envelope.name}
        compactTitle
        back={BACK}
        crumb="Enveloppe"
        titleAddon={
          envelope.archived ? <Badge variant="secondary">Archivée</Badge> : null
        }
        description={dueText(envelope.dueDate)}
        actions={[
          {
            label: 'Modifier',
            icon: <PencilIcon />,
            onSelect: () => setEditing(true),
          },
        ]}
      />

      <div className="grid items-start gap-4 @3xl:grid-cols-2">
        <Card className="@3xl:col-span-2">
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <EnvelopeAvatar envelope={envelope} size="lg" />
              <p className="min-w-0">
                <span className="block text-3xl font-semibold whitespace-nowrap tabular-nums">
                  {formatWholeEuros(envelope.totalCents)}
                </span>
                {envelope.targetCents !== null && (
                  <span className="text-muted-foreground text-sm whitespace-nowrap">
                    sur {formatWholeEuros(envelope.targetCents)}
                  </span>
                )}
              </p>
            </div>
            {envelope.targetCents !== null && (
              <Gauge
                value={envelope.totalCents}
                max={envelope.targetCents}
                color={color}
              />
            )}
            {plan && <p className="text-sm font-medium">{plan}</p>}
            {envelope.accounts.length === 1 && (
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <LandmarkIcon aria-hidden className="size-[0.8rem]" />
                Sur {envelope.accounts[0].accountName}
              </p>
            )}
            {envelope.paidCents !== 0 && (
              <p className="text-muted-foreground text-sm">
                A payé {formatWholeEuros(envelope.paidCents)}
              </p>
            )}
            {!envelope.archived && (
              <div className="flex flex-wrap gap-2">
                <Button
                  iconStart={<ArrowDownToLineIcon />}
                  onClick={() => setMoving('add')}
                >
                  Ajouter
                </Button>
                <Button
                  variant="secondary"
                  outline
                  iconStart={<ArrowUpFromLineIcon />}
                  disabled={envelope.totalCents <= 0}
                  onClick={() => setMoving('withdraw')}
                >
                  Retirer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* One account: « Sur Livret A » in the card above (#430). */}
        {envelope.accounts.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Par compte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SplitBar
                segments={envelope.accounts.map((a) => ({
                  id: a.accountId,
                  label: a.accountName,
                  cents: a.amountCents,
                  color: accountColor.get(a.accountId)!,
                }))}
              />
              <ul className="space-y-2 text-sm">
                {envelope.accounts.map((a) => (
                  <li key={a.accountId} className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: accountColor.get(a.accountId) }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {a.accountName}
                    </span>
                    <span className="font-semibold whitespace-nowrap tabular-nums">
                      {formatCents(a.amountCents)}
                    </span>
                    {envelope.totalCents > 0 && (
                      <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
                        {Math.round(
                          (a.amountCents / envelope.totalCents) * 100,
                        )}{' '}
                        %
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {envelope.history.some((m) => m.totalCents !== 0) && (
          <EvolutionCard envelope={envelope} colors={accountColor} />
        )}
        <PaysForCard envelope={envelope} />
      </div>

      <AddWithdrawSheet
        mode={moving}
        onClose={() => setMoving(null)}
        envelope={envelope}
      />
      <EnvelopeEditor
        open={editing}
        onOpenChange={setEditing}
        envelope={envelope}
      />
    </div>
  )
}

/** « Évolution »: a bar per month end, stacked by account. */
function EvolutionCard({
  envelope,
  colors,
}: {
  envelope: EnvelopeDetailDto
  colors: Map<string, string>
}) {
  const months = envelope.history
  const max = Math.max(1, ...months.map((m) => m.totalCents))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Évolution</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          role="img"
          aria-label={months
            .map(
              (m) =>
                `${formatShortMonth(m.month)} ${formatWholeEuros(m.totalCents)}`,
            )
            .join(', ')}
          className="flex h-32 items-end gap-1"
        >
          {months.map((m) => (
            <div
              key={m.month}
              className="flex h-full min-w-0 flex-1 flex-col items-stretch justify-end gap-1"
            >
              <div
                className="flex flex-col-reverse overflow-hidden rounded-t-sm"
                style={{
                  height: `${(Math.max(0, m.totalCents) / max) * 100}%`,
                }}
              >
                {m.accounts
                  .filter((a) => a.amountCents > 0)
                  .map((a) => (
                    <span
                      key={a.accountId}
                      style={{
                        flexGrow: a.amountCents,
                        flexBasis: 0,
                        background:
                          colors.get(a.accountId) ?? 'var(--chart-other)',
                      }}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
        <div className="text-muted-foreground mt-1 flex justify-between text-xs">
          <span>{months[0] ? formatShortMonth(months[0].month) : ''}</span>
          <span>
            {months.at(-1) ? formatShortMonth(months.at(-1)!.month) : ''}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/** « Paie pour »: its categories, or a line saying it is done by hand. */
function PaysForCard({ envelope }: { envelope: EnvelopeDetailDto }) {
  const categories = useQuery(categoriesQuery)
  const named = envelope.categoryIds.flatMap((id) => {
    const found = (categories.data ?? []).find((c) => c.id === id)
    return found ? [found] : []
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Paie pour</CardTitle>
      </CardHeader>
      <CardContent>
        {named.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Attachez ses dépenses depuis l’opération.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {named.map((category) => (
              <li key={category.id} className="flex items-center gap-2.5">
                <CategoryAvatar category={category} />
                {category.name}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
