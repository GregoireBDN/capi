import { createFileRoute } from '@tanstack/react-router'
import { ContactOwedPage } from '#/components/owed/ContactOwedPage'
import { validateOwedSearch } from '#/components/owed/format'

export const Route = createFileRoute('/_app/owed/$contactId')({
  validateSearch: validateOwedSearch,
  head: () => ({ meta: [{ title: 'Entre proches · Finances' }] }),
  component: ContactRoute,
})

function ContactRoute() {
  const { contactId } = Route.useParams()
  const { side } = Route.useSearch()
  return <ContactOwedPage contactId={contactId} side={side ?? 'owed'} />
}
