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
import {
  importProfilesControllerInspect,
  importsControllerPreview,
} from '#/api'
import type { AccountDto, CsvInspectionDto, ImportDetailDto } from '#/api'
import { importKeys, MAX_FILE_BYTES, unwrap } from './api'
import { isUnrecognisedFormat, uploadErrorMessage } from './errors'
import { FileDropzone } from './FileDropzone'
import { ProfileMappingForm } from './ProfileMappingForm'
import { SavedFormats } from './SavedFormats'
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
  /** A file in no known format, being mapped to a new one (#431). */
  const [mapping, setMapping] = useState<{
    file: File
    inspection: CsvInspectionDto
  } | null>(null)
  const account = accounts.find((a) => a.id === accountId)
  const queryClient = useQueryClient()

  const upload = useMutation({
    mutationFn: async (file: File) => {
      try {
        // The format is recognised from the header (CIC, standard, saved).
        const detail = await unwrap(
          importsControllerPreview({
            body: { file, accountId },
            throwOnError: false,
          }),
        )
        return { detail }
      } catch (err) {
        if (!isUnrecognisedFormat(err)) throw err
        const inspection = await unwrap(
          importProfilesControllerInspect({
            body: { file },
            throwOnError: false,
          }),
        )
        return { unknown: { file, inspection } }
      }
    },
    onSuccess: (result) => {
      if ('unknown' in result) {
        setMapping(result.unknown ?? null)
        return
      }
      // The pending import now appears in the history.
      void queryClient.invalidateQueries({ queryKey: importKeys.imports })
      onPreview(result.detail)
    },
    onError: (err) => setError(uploadErrorMessage(err)),
  })

  function send(file: File) {
    setError(null)
    if (!isCsv(file)) {
      setError('Choisissez un fichier .csv exporté depuis votre banque.')
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
          L’export CSV de votre banque, ou un fichier au format standard. Rien
          n’est enregistré avant votre validation : vous verrez d’abord un
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
            disabled={upload.isPending || mapping !== null}
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

        {mapping ? (
          <ProfileMappingForm
            file={mapping.file}
            accountId={accountId}
            inspection={mapping.inspection}
            defaultName={account?.institution ?? ''}
            onPreview={onPreview}
            onCancel={() => setMapping(null)}
          />
        ) : (
          <FileDropzone
            onFile={send}
            disabled={!accountId}
            busy={upload.isPending}
          />
        )}

        {error && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Import impossible</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!mapping && <SavedFormats />}
      </CardContent>
    </Card>
  )
}
