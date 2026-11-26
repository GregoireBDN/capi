import { Button } from '@capi/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MinusIcon, PlusIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { AccountEnvelopesDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { EnvelopeAvatar } from './EnvelopeAvatar'
import { EnvelopeSheet } from './EnvelopeSheet'
import {
  afterEnvelopesChanged,
  envelopeErrorMessage,
  moveEnvelopeMoney,
} from './queries'

const STEP_CENTS = 1_000

/**
 * « Choisir quoi réduire » (#428, proposal 2): the balance fell under its
 * envelopes; the owner takes exactly what is missing from the envelopes he
 * picks (− / +), and only then « Réduire » works. Nothing is reduced
 * without him.
 */
export function ReduceSheet({
  open,
  onOpenChange,
  split,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  split: AccountEnvelopesDto
}) {
  const queryClient = useQueryClient()
  const missing = split.shortfallCents
  const [cuts, setCuts] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    if (open) setCuts(new Map())
  }, [open])
  const chosen = [...cuts.values()].reduce((sum, c) => sum + c, 0)
  const left = missing - chosen

  function change(envelopeId: string, held: number, up: boolean) {
    const now = cuts.get(envelopeId) ?? 0
    const next = up
      ? now + Math.min(STEP_CENTS, left, held - now)
      : Math.max(0, now - STEP_CENTS)
    setCuts(new Map(cuts).set(envelopeId, next))
  }

  const reduce = useMutation({
    mutationFn: async () => {
      for (const [envelopeId, amountCents] of cuts) {
        if (amountCents <= 0) continue
        await moveEnvelopeMoney({
          accountId: split.accountId,
          fromEnvelopeId: envelopeId,
          toEnvelopeId: null,
          amountCents,
        })
      }
    },
    onSuccess: () => {
      toast.success('Enveloppes réduites')
      onOpenChange(false)
    },
    onError: (e) => toast.error(envelopeErrorMessage(e)),
    onSettled: () => afterEnvelopesChanged(queryClient),
  })

  return (
    <EnvelopeSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Choisir quoi réduire"
      description={
        left > 0
          ? `Encore ${formatCents(left)} à choisir`
          : `${formatCents(missing)} choisis`
      }
      actionLabel="Réduire"
      loading={reduce.isPending}
      disabled={left !== 0}
      onSubmit={() => reduce.mutate()}
    >
      <ul className="divide-y rounded-xl border" aria-label="Enveloppes">
        {split.envelopes
          .filter((e) => e.amountCents > 0)
          .map((envelope) => {
            const cut = cuts.get(envelope.envelopeId) ?? 0
            return (
              <li
                key={envelope.envelopeId}
                className="flex items-center gap-2.5 p-2.5"
              >
                <EnvelopeAvatar envelope={envelope} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {envelope.name}
                  </span>
                  <span className="text-muted-foreground block text-xs whitespace-nowrap tabular-nums">
                    {formatCents(envelope.amountCents)} →{' '}
                    {formatCents(envelope.amountCents - cut)}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  outline
                  iconOnly
                  aria-label={`Réduire moins ${envelope.name}`}
                  disabled={cut === 0}
                  onClick={() =>
                    change(envelope.envelopeId, envelope.amountCents, false)
                  }
                >
                  <MinusIcon />
                </Button>
                <span className="w-20 text-center text-sm font-semibold whitespace-nowrap tabular-nums">
                  −{formatCents(cut)}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  outline
                  iconOnly
                  aria-label={`Réduire plus ${envelope.name}`}
                  disabled={left === 0 || cut >= envelope.amountCents}
                  onClick={() =>
                    change(envelope.envelopeId, envelope.amountCents, true)
                  }
                >
                  <PlusIcon />
                </Button>
              </li>
            )
          })}
      </ul>
    </EnvelopeSheet>
  )
}
