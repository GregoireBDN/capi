import { NativeSelect, NativeSelectOption } from '@finances/ui'
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { ArrowLeftRightIcon, ArrowRightIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  cryptoMovementsControllerLink,
  investmentsControllerListMovements,
} from '#/api'
import type { AccountDto, InvestmentMovementDto } from '#/api/types.gen'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { accountsQuery, unwrap } from '#/lib/queries'
import type { AccountDetail } from './AccountDetails'
import { todayInParis } from './dates'

export const movementsKey = ['investments', 'movements'] as const

export function movementsQuery(accountId?: string) {
  return queryOptions({
    queryKey: [...movementsKey, accountId ?? 'all'] as const,
    queryFn: () =>
      unwrap(
        investmentsControllerListMovements({
          query: { accountId, months: 24 },
          throwOnError: false,
        }),
      ),
    staleTime: 0,
  })
}

/** `0.010000000000000000` → `0,01`: exact text, never a float. */
export function formatQuantity(quantity: string): string {
  const [whole, fraction = ''] = quantity.split('.')
  const trimmed = fraction.replace(/0+$/, '')
  return trimmed === '' ? whole : `${whole},${trimmed}`
}

function amountText(movement: InvestmentMovementDto): string {
  if (movement.source === 'bank') return formatCents(movement.amountCents ?? 0)
  if (movement.amountCents !== null) {
    return `coût ${formatCents(movement.amountCents)}`
  }
  // A deposit back to the exchange carries no cost of its own.
  return movement.cryptoKind === 'withdrawal' ? 'coût inconnu' : ''
}

/** One movement: from → to, the day and what moved, its euros. */
function MovementRow({
  movement,
  cryptoAccounts,
  editableFrom,
}: {
  movement: InvestmentMovementDto
  cryptoAccounts: readonly AccountDto[]
  editableFrom?: string
}) {
  const queryClient = useQueryClient()
  const link = useMutation({
    mutationFn: (counterpartAccountId: string | null) =>
      unwrap(
        cryptoMovementsControllerLink({
          path: { id: movement.id },
          body: { counterpartAccountId },
          throwOnError: false,
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['investments'] }),
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey.includes('performance'),
        }),
      ])
    },
    onError: () => toast.error('Le lien n’a pas pu être enregistré.'),
  })
  // The exchange is the known side; the other one is the link.
  const withdrawal = movement.cryptoKind === 'withdrawal'
  const exchange = withdrawal ? movement.from : movement.to
  const linked = withdrawal ? movement.to : movement.from
  const choices = cryptoAccounts.filter((a) => a.id !== exchange?.id)
  const direction = withdrawal ? 'Vers' : 'Depuis'
  const label = `${movement.from?.name ?? '?'} → ${movement.to?.name ?? '?'}`
  return (
    <li className="space-y-1 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span className="min-w-[7rem] flex-1">
          <span className="block break-words">
            {movement.from?.name ?? '?'}
            <ArrowRightIcon
              className="text-muted-foreground mx-1 inline size-[0.7rem] align-[-0.05em]"
              aria-label="vers"
            />
            <span
              className={
                movement.to === null
                  ? 'text-muted-foreground italic'
                  : undefined
              }
            >
              {movement.to?.name ?? 'à lier'}
            </span>
          </span>
          <span className="text-muted-foreground block text-xs">
            {formatCalendarDate(movement.date)}
            {movement.quantity !== null &&
              ` · ${formatQuantity(movement.quantity)} ${movement.asset}`}
          </span>
        </span>
        <span className="ml-auto whitespace-nowrap tabular-nums">
          {amountText(movement)}
        </span>
      </div>
      {movement.linkable &&
        (linked === null || exchange?.id === editableFrom) && (
          <NativeSelect
            size="sm"
            aria-label={`Compte de ${label}`}
            className="w-full"
            disabled={link.isPending}
            value={linked?.id ?? ''}
            onChange={(event) => link.mutate(event.target.value || null)}
          >
            <NativeSelectOption value="">
              {direction} : à choisir
            </NativeSelectOption>
            {choices.map((account) => (
              <NativeSelectOption key={account.id} value={account.id}>
                {direction} : {account.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
    </li>
  )
}

/** The movements as a list, newest first. */
export function MovementList({
  movements,
  editableFrom,
}: {
  movements: readonly InvestmentMovementDto[]
  /**
   * The exchange whose page this is: its links can be changed. Elsewhere
   * only the unlinked movements offer a choice.
   */
  editableFrom?: string
}) {
  const accounts = useQuery(accountsQuery)
  const cryptoAccounts = (accounts.data ?? []).filter(
    (account) => account.type === 'crypto' && !account.archivedAt,
  )
  return (
    <ul className="divide-border divide-y">
      {movements.map((movement) => (
        <MovementRow
          key={movement.id}
          movement={movement}
          cryptoAccounts={cryptoAccounts}
          editableFrom={editableFrom}
        />
      ))}
    </ul>
  )
}

/**
 * Where a crypto account's money and coins came from and went (#296): the
 * bank transfers to it, the coins withdrawn to the Ledger (with the cost
 * they left with) or received from the exchange. A withdrawal or deposit
 * the app could not link picks its account here. A row of « Plus
 * d’informations » (#447), in amber while one waits to be linked; absent
 * while there is none.
 */
export function useMovementsDetail(accountId: string): AccountDetail | null {
  const movements = useQuery(movementsQuery(accountId))
  const items = movements.data?.items ?? []
  if (items.length === 0) return null
  const unlinked = items.filter(
    (m) => m.linkable && (m.from === null || m.to === null),
  ).length
  return {
    id: 'movements',
    icon: ArrowLeftRightIcon,
    label: 'Mouvements',
    summary:
      unlinked > 0
        ? `${unlinked} à lier`
        : `${items.length} · le dernier le ${formatShortDay(items[0].date, todayInParis().slice(0, 4))}`,
    warning: unlinked > 0,
    description: (
      <>
        Virements de la banque et cryptos envoyées entre vos comptes, sur 24
        mois. Le coût d’un retrait (prix moyen d’achat) devient l’investi du
        compte qui le reçoit.
        {unlinked > 0 &&
          ` ${unlinked === 1 ? 'Un mouvement est' : `${unlinked} mouvements sont`} à lier à son compte.`}
      </>
    ),
    content: <MovementList movements={items} editableFrom={accountId} />,
  }
}
