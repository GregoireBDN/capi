import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '#/components/app-shell/PageHeader'
// Throwaway page of #385's prototypes, opened on the phone; deleted with them.
import { KeyboardSheetBoard } from '../../../../ui-docs/src/prototypes/sheet-keyboard/KeyboardSheetPrototype'

export const Route = createFileRoute('/_app/proto-385')({
  head: () => ({ meta: [{ title: 'Clavier · prototypes · Finances' }] }),
  component: ProtoPage,
})

function ProtoPage() {
  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Clavier et panneaux"
        description="Prototypes du #385, à essayer sur l’iPhone."
      />
      <KeyboardSheetBoard />
    </div>
  )
}
