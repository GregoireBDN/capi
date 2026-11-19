import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  NativeSelect,
  NativeSelectOption,
} from '@finances/ui'
import { CircleAlertIcon, UploadIcon } from 'lucide-react'
import { useState } from 'react'
import { importsControllerPreview } from '#/api'
import type { AccountDto, ImportDetailDto } from '#/api'
import { importKeys, MAX_FILE_BYTES, unwrap } from './api'
import { uploadErrorMessage } from './errors'
import { FileDropzone } from './FileDropzone'
import { formatCents } from '#/lib/money'
import { formatDate } from './format'

interface UploadCardProps {
  /** Transactional accounts only. */
  accounts: AccountDto[]
  /** Account selected first when it is one of `accounts`. */
  defaultAccountId?: string
  onPreview: (detail: ImportDetailDto) => void
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  checking: 'Compte courant',
  savings: 'Livret',
}

/** "Compte joint · Compte courant (CIC)", without repeating the type. */
function accountLabel(account: AccountDto): string {
  const type = ACCOUNT_TYPE_LABEL[account.type] ?? account.type
  const name =
    account.name.toLowerCase() === type.toLowerCase()
      ? account.name
      : `${account.name} · ${type}`
  return account.institution ? `${name} (${account.institution})` : name
}

function isCsv(file: File): boolean {
  return /\.csv$/i.test(file.name) || file.type.includes('csv')
}

export function UploadCard({
  accounts,
  defaultAccountId,
  onPreview,
}: UploadCardProps) {
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.id === defaultAccountId)?.id ??
      accounts.at(0)?.id ??
      '',
  )
  const [error, setError] = useState<string | null>(null)
  const account = accounts.find((a) => a.id === accountId)
  const queryClient = useQueryClient()

  const upload = useMutation({
    mutationFn: (file: File) =>
      unwrap(
        importsControllerPreview({
          body: { file, accountId, source: 'cic_csv' },
          throwOnError: false,
        }),
      ),
    onSuccess: (detail) => {
      // The pending import now appears in the history.
      void queryClient.invalidateQueries({ queryKey: importKeys.imports })
      onPreview(detail)
    },
    onError: (err) => setError(uploadErrorMessage(err)),
  })

  function send(file: File) {
    setError(null)
    if (!isCsv(file)) {
      setError('Choisissez un fichier .csv exporté depuis votre espace CIC.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Le fichier dépasse la taille maximale de 5 Mo.')
      return
    }
    upload.mutate(file)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadIcon className="text-muted-foreground size-4" />
          Nouvel import
        </CardTitle>
        <CardDescription>
          Rien n’est enregistré avant votre validation : vous verrez d’abord un
          aperçu des opérations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field>
          <FieldLabel htmlFor="import-account">Compte</FieldLabel>
          <NativeSelect
            id="import-account"
            className="w-full"
            value={accountId}
            disabled={upload.isPending}
            onChange={(event) => {
              setAccountId(event.target.value)
              setError(null)
            }}
          >
            {accounts.map((a) => (
              <NativeSelectOption key={a.id} value={a.id}>
                {accountLabel(a)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {account?.balanceCents != null && account.balanceDate && (
            <p className="text-muted-foreground text-xs">
              Solde connu : {formatCents(account.balanceCents)} au{' '}
              {formatDate(account.balanceDate)}
            </p>
          )}
        </Field>

        <FileDropzone
          onFile={send}
          disabled={!accountId}
          busy={upload.isPending}
        />

        {error && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Import impossible</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
