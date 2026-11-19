import { useQuery } from '@tanstack/react-query'
import { Button, Card, CardContent, Skeleton } from '@finances/ui'
import { useState } from 'react'
import type { ImportDetailDto } from '#/api'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { AccountSetupForm } from './AccountSetupForm'
import { accountsQuery, isBankAccount } from './api'
import { genericErrorMessage } from './errors'
import { ImportHistory } from './ImportHistory'
import { ImportPreview } from './ImportPreview'
import type { CommitOutcome } from './ImportPreview'
import { ImportSuccess } from './ImportSuccess'
import { UploadCard } from './UploadCard'

type Step =
  | { name: 'upload' }
  | { name: 'preview'; detail: ImportDetailDto }
  | { name: 'done'; outcome: CommitOutcome }

/** `/import`: account → upload → preview → commit, plus the import history. */
export function ImportPage() {
  const accounts = useQuery(accountsQuery)
  const [step, setStep] = useState<Step>({ name: 'upload' })
  const transactional = (accounts.data ?? []).filter(
    (a) => isBankAccount(a) && !a.archivedAt,
  )

  const openPreview = (detail: ImportDetailDto) => {
    setStep({ name: 'preview', detail })
    window.scrollTo({ top: 0 })
  }

  let main: React.ReactNode
  if (step.name === 'preview') {
    main = (
      <ImportPreview
        key={step.detail.id}
        detail={step.detail}
        onCommitted={(outcome) => {
          setStep({ name: 'done', outcome })
          window.scrollTo({ top: 0 })
        }}
        onClosed={() => setStep({ name: 'upload' })}
      />
    )
  } else if (step.name === 'done') {
    main = (
      <ImportSuccess
        outcome={step.outcome}
        onAnother={() => setStep({ name: 'upload' })}
      />
    )
  } else if (accounts.isPending) {
    main = (
      <Skeleton className="h-64 w-full" aria-label="Chargement des comptes" />
    )
  } else if (accounts.isError) {
    main = (
      <Card>
        <CardContent className="mb-0 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-destructive">
            {genericErrorMessage(accounts.error)}
          </p>
          <Button
            size="sm"
            variant="secondary"
            outline
            onClick={() => void accounts.refetch()}
          >
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  } else if (transactional.length === 0) {
    main = <AccountSetupForm />
  } else {
    main = <UploadCard accounts={transactional} onPreview={openPreview} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import"
        description="Importez l’export CSV de votre banque : les doublons sont détectés et rien n’est enregistré avant votre validation."
      />
      {main}
      <ImportHistory
        onResume={openPreview}
        activeId={step.name === 'preview' ? step.detail.id : undefined}
      />
    </div>
  )
}
