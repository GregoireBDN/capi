import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  DEFAULT_NET_WORTH_PERIOD,
  NET_WORTH_PERIODS,
} from '#/components/net-worth/net-worth'
import { NetWorthPage } from '#/components/net-worth/NetWorthPage'

/** `?period=6m|all` (absent = 12 months); invalid values are dropped. */
const searchSchema = z.object({
  period: z.enum(NET_WORTH_PERIODS).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/net-worth')({
  validateSearch: (search: Record<string, unknown>) => {
    const { period } = searchSchema.parse(search)
    return period && period !== DEFAULT_NET_WORTH_PERIOD ? { period } : {}
  },
  head: () => ({ meta: [{ title: 'Patrimoine net · Capi' }] }),
  component: NetWorthRoute,
})

function NetWorthRoute() {
  const { period = DEFAULT_NET_WORTH_PERIOD } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <NetWorthPage
      period={period}
      onPeriodChange={(next) =>
        void navigate({
          search: next === DEFAULT_NET_WORTH_PERIOD ? {} : { period: next },
          replace: true,
          resetScroll: false,
        })
      }
    />
  )
}
