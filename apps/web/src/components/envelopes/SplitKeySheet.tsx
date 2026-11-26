import { Button } from '@capi/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MinusIcon, PlusIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { AccountEnvelopesDto } from '#/api/types.gen'
import { formatWholeEuros } from '#/lib/money'
import { EnvelopeAvatar, FreeAvatar } from './EnvelopeAvatar'
import { EnvelopeSheet } from './EnvelopeSheet'
import { formatBasisPoints } from './format'
import {
  afterEnvelopesChanged,
  envelopeErrorMessage,
  envelopesQuery,
  setSplitKey,
} from './queries'

const STEP = 500
const FULL = 10_000
/** The example saving « Pour 300 € épargnés sur ce compte ». */
const EXAMPLE_CENTS = 30_000

/**
 * « Clé de répartition » (#428): each envelope's share of every saving on
 * this account, − / + by 5 %, « Libre » what is left. Applied as an offer
 * on each saving, never by itself.
 */
export function SplitKeySheet({
  open,
  onOpenChange,
  split,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  split: AccountEnvelopesDto
}) {
  const queryClient = useQueryClient()
  const all = useQuery({ ...envelopesQuery(), enabled: open })
  const [key, setKey] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (!open) return
    setKey(new Map(split.splitKey.map((k) => [k.envelopeId, k.basisPoints])))
  }, [open, split])

  // The account's envelopes first, then the others.
  const here = new Set(split.envelopes.map((e) => e.envelopeId))
  const envelopes = [...(all.data ?? [])].sort(
    (a, b) => Number(here.has(b.id)) - Number(here.has(a.id)),
  )
  const used = [...key.values()].reduce((sum, bp) => sum + bp, 0)
  const free = FULL - used

  function change(envelopeId: string, delta: number) {
    const now = key.get(envelopeId) ?? 0
    const next = Math.max(0, Math.min(now + delta, now + free))
    const copy = new Map(key)
    if (next === 0) copy.delete(envelopeId)
    else copy.set(envelopeId, next)
    setKey(copy)
  }

  const save = useMutation({
    mutationFn: () =>
      setSplitKey(split.accountId, {
        shares: [...key.entries()]
          .filter(([, bp]) => bp > 0)
          .map(([envelopeId, basisPoints]) => ({ envelopeId, basisPoints })),
      }),
    onSuccess: async () => {
      await afterEnvelopesChanged(queryClient)
      toast.success('Clé enregistrée')
      onOpenChange(false)
    },
    onError: (e) => toast.error(envelopeErrorMessage(e)),
  })

  return (
    <EnvelopeSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Clé de répartition"
      description={`Pour ${formatWholeEuros(EXAMPLE_CENTS)} épargnés sur ce compte`}
      actionLabel="Enregistrer"
      loading={save.isPending}
      onSubmit={() => save.mutate()}
    >
      <ul
        className="bg-muted/40 rounded-control space-y-1 py-1"
        aria-label="Parts"
      >
        {envelopes.map((envelope) => {
          const bp = key.get(envelope.id) ?? 0
          return (
            <li key={envelope.id} className="flex items-center gap-2.5 p-2.5">
              <EnvelopeAvatar envelope={envelope} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {envelope.name}
                </span>
                <span className="text-muted-foreground block text-xs tabular-nums">
                  {formatWholeEuros(Math.floor((EXAMPLE_CENTS * bp) / FULL))}
                </span>
              </span>
              <Button
                type="button"
                variant="secondary"
                outline
                iconOnly
                aria-label={`Moins pour ${envelope.name}`}
                disabled={bp === 0}
                onClick={() => change(envelope.id, -STEP)}
              >
                <MinusIcon />
              </Button>
              <span className="w-12 text-center text-sm font-semibold tabular-nums">
                {formatBasisPoints(bp)}
              </span>
              <Button
                type="button"
                variant="secondary"
                outline
                iconOnly
                aria-label={`Plus pour ${envelope.name}`}
                disabled={free === 0}
                onClick={() => change(envelope.id, STEP)}
              >
                <PlusIcon />
              </Button>
            </li>
          )
        })}
        <li className="flex items-center gap-2.5 p-2.5">
          <FreeAvatar size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Libre</span>
            <span className="text-muted-foreground block text-xs tabular-nums">
              {formatWholeEuros(
                EXAMPLE_CENTS -
                  envelopes.reduce(
                    (sum, e) =>
                      sum +
                      Math.floor((EXAMPLE_CENTS * (key.get(e.id) ?? 0)) / FULL),
                    0,
                  ),
              )}
            </span>
          </span>
          <span className="w-[calc(2*2.75rem+3rem+1rem)] text-center text-sm font-semibold tabular-nums">
            {formatBasisPoints(free)}
          </span>
        </li>
      </ul>
      {envelopes.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Créez d’abord une enveloppe.
        </p>
      )}
    </EnvelopeSheet>
  )
}
