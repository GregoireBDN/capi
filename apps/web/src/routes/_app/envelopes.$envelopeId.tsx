import { createFileRoute } from '@tanstack/react-router'
import { EnvelopePage } from '#/components/envelopes/EnvelopePage'

export const Route = createFileRoute('/_app/envelopes/$envelopeId')({
  head: () => ({ meta: [{ title: 'Enveloppe · Capi' }] }),
  component: EnvelopeRoute,
})

function EnvelopeRoute() {
  const { envelopeId } = Route.useParams()
  return <EnvelopePage envelopeId={envelopeId} />
}
