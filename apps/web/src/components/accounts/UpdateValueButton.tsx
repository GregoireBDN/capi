import { Button } from '@finances/ui'
import { PencilLineIcon } from 'lucide-react'
import { useState } from 'react'
import type { AccountType } from '#/api/types.gen'
import { todayInParis } from './dates'
import { isInvestmentType } from './labels'
import { SnapshotEditor } from './SnapshotEditor'

/**
 * PEA, life insurance and employee savings values are typed by hand; crypto
 * values come from holdings × price, cash balances from imports.
 */
export function isValuedByHand(type: AccountType): boolean {
  return isInvestmentType(type) && type !== 'crypto'
}

interface UpdateValueButtonProps {
  account: { id: string; name: string }
  /** `icon`: a compact button for list rows; `label`: "Mettre à jour". */
  display?: 'icon' | 'label'
}

/**
 * "Mettre à jour la valeur" of an investment account, from any list: opens
 * the value editor dated today (Europe/Paris), the value field focused.
 */
export function UpdateValueButton({
  account,
  display = 'icon',
}: UpdateValueButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {display === 'icon' ? (
        <Button
          variant="secondary"
          ghost
          iconOnly
          aria-label={`Mettre à jour la valeur de ${account.name}`}
          title="Mettre à jour la valeur"
          onClick={() => setOpen(true)}
        >
          <PencilLineIcon />
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          outline
          iconStart={<PencilLineIcon />}
          aria-label={`Mettre à jour la valeur de ${account.name}`}
          onClick={() => setOpen(true)}
        >
          Mettre à jour
        </Button>
      )}
      <SnapshotEditor
        open={open}
        onOpenChange={setOpen}
        accountId={account.id}
        accountName={account.name}
        today={todayInParis()}
        withContributions
      />
    </>
  )
}
