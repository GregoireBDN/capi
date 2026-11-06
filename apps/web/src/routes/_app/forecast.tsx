import { createFileRoute } from '@tanstack/react-router'
import { ForecastPage } from '#/components/forecast/ForecastPage'

export const Route = createFileRoute('/_app/forecast')({
  head: () => ({ meta: [{ title: 'Prévision fin de mois · Finances' }] }),
  component: ForecastPage,
})
