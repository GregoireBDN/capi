import { ReceiptEuroIcon } from 'lucide-react'
import { useState } from 'react'
import { useRegisterPageAction } from '#/components/app-shell/page-actions'
import { ManualTransactionSheet } from '#/components/expenses/ManualTransactionSheet'

/**
 * « Ajouter une dépense » in the page's « ⋮ » when « Budgets suivis », which
 * registers it, is not on the dashboard (#495).
 */
export function AddExpenseAction() {
  const [open, setOpen] = useState(false)
  useRegisterPageAction({
    label: 'Ajouter une dépense',
    icon: <ReceiptEuroIcon />,
    primary: true,
    onSelect: () => setOpen(true),
  })
  return <ManualTransactionSheet open={open} onOpenChange={setOpen} />
}
