import { Button, cn } from '@capi/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { EnvelopeMonthItemDto } from '#/api/types.gen'
import { CategoryAvatar } from '#/components/categories/category-icons'
import { formatWholeEuros } from '#/lib/money'
import { categoriesQuery } from '#/lib/queries'
import { ChoiceList } from './ChoiceList'
import { EnvelopeAvatar, Gauge } from './EnvelopeAvatar'
import { EnvelopeSheet } from './EnvelopeSheet'
import { envelopeColor } from './format'
import {
  afterEnvelopesChanged,
  envelopeErrorMessage,
  envelopeMonthQuery,
  envelopeQuery,
  envelopesQuery,
  moveEnvelopeMoney,
} from './queries'

/**
 * The month's budget, « C. Une ligne Enveloppe » (#428): an envelope that
 * paid this month is a line among the categories, « 715 € / 800 € » (paid /
 * put aside) on a gauge in its colour; it opens to what it paid per category
 * and what is left.
 */
export function EnvelopeMonthLines({ month }: { month: string }) {
  const data = useQuery(envelopeMonthQuery(month))
  const [open, setOpen] = useState<EnvelopeMonthItemDto | null>(null)
  const items = data.data?.envelopes ?? []
  if (items.length === 0) return null
  return (
    <>
      <ul className="space-y-2" aria-label="Enveloppes du mois">
        {items.map((item) => (
          <li key={item.envelopeId}>
            <button
              type="button"
              onClick={() => setOpen(item)}
              aria-label={`Enveloppe ${item.name}`}
              className="bg-card hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full items-center gap-2.5 rounded-xl border p-3 text-left outline-none focus-visible:ring-[3px]"
            >
              <EnvelopeAvatar envelope={item} size="sm" />
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                  <span className="min-w-0 truncate font-medium">
                    {item.name}
                  </span>
                  <span className="font-semibold whitespace-nowrap tabular-nums">
                    {formatWholeEuros(item.paidCents)}
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      / {formatWholeEuros(item.putAsideCents)}
                    </span>
                  </span>
                </span>
                <Gauge
                  value={item.paidCents}
                  max={item.putAsideCents}
                  color={envelopeColor(item)}
                  className="h-1.5"
                />
              </span>
              <ChevronRightIcon
                aria-hidden
                className="text-muted-foreground size-4 shrink-0"
              />
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <EnvelopeMonthSheet
          item={items.find((i) => i.envelopeId === open.envelopeId) ?? open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

function EnvelopeMonthSheet({
  item,
  onClose,
}: {
  item: EnvelopeMonthItemDto
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const categories = useQuery(categoriesQuery)
  const detail = useQuery(envelopeQuery(item.envelopeId))
  const all = useQuery(envelopesQuery())
  const [choosing, setChoosing] = useState(false)
  const [target, setTarget] = useState<string | null>(null)

  const move = useMutation({
    mutationFn: async (to: string | null) => {
      for (const account of detail.data?.accounts ?? []) {
        if (account.amountCents <= 0) continue
        await moveEnvelopeMoney({
          accountId: account.accountId,
          fromEnvelopeId: item.envelopeId,
          toEnvelopeId: to,
          amountCents: account.amountCents,
        })
      }
    },
    onSuccess: () => {
      toast.success('Argent déplacé')
      onClose()
    },
    onError: (e) => toast.error(envelopeErrorMessage(e)),
    onSettled: () => afterEnvelopesChanged(queryClient),
  })
  const others = (all.data ?? []).filter((e) => e.id !== item.envelopeId)

  return (
    <EnvelopeSheet
      open
      onOpenChange={(next) => !next && onClose()}
      title={item.name}
      description={`${formatWholeEuros(item.paidCents)} payés ce mois`}
      actionLabel={choosing ? 'Déplacer' : 'Fermer'}
      loading={move.isPending}
      disabled={choosing && target === null}
      onSubmit={() => (choosing ? move.mutate(target) : onClose())}
    >
      <ul className="space-y-2 text-sm" aria-label="Payé par catégorie">
        {item.categories.map((paid) => {
          const category =
            (categories.data ?? []).find((c) => c.id === paid.categoryId) ??
            null
          return (
            <li key={paid.categoryId ?? 'none'} className="flex items-center gap-2.5">
              <CategoryAvatar category={category} />
              <span className="min-w-0 flex-1 truncate">
                {category?.name ?? 'Sans catégorie'}
              </span>
              <span className="font-semibold tabular-nums">
                {formatWholeEuros(paid.paidCents)}
              </span>
            </li>
          )
        })}
      </ul>
      {item.leftCents > 0 && (
        <div className="space-y-3 rounded-xl border p-3">
          <p className="text-lg font-semibold">
            Il reste {formatWholeEuros(item.leftCents)}
          </p>
          {!choosing ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                loading={move.isPending}
                disabled={!detail.data}
                onClick={() => move.mutate(null)}
              >
                Rendre à « libre »
              </Button>
              <Button
                type="button"
                variant="secondary"
                outline
                disabled={others.length === 0}
                onClick={() => setChoosing(true)}
              >
                Vers une autre enveloppe
              </Button>
            </div>
          ) : (
            <ChoiceList
              label="Vers"
              value={target}
              onChange={setTarget}
              choices={others.map((e) => ({
                id: e.id,
                icon: <EnvelopeAvatar envelope={e} size="sm" />,
                label: e.name,
              }))}
            />
          )}
        </div>
      )}
      <p className={cn('text-muted-foreground text-xs')}>
        Ce qu’elle a payé s’ajoute au budget de ces catégories.
      </p>
    </EnvelopeSheet>
  )
}
