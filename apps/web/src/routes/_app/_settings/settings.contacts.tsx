import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { ContactsSettings } from '#/components/owed/ContactsSettings'

export const Route = createFileRoute('/_app/_settings/settings/contacts')({
  head: () => ({ meta: [{ title: 'Contacts · Finances' }] }),
  component: ContactsRoute,
})

/** Réglages › Contacts (#359): the people money is shared with. */
function ContactsRoute() {
  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Contacts"
        description="Les personnes avec qui vous partagez des dépenses."
      />
      <ContactsSettings />
    </div>
  )
}
