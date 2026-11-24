import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  NativeSelectOption,
  SegmentedControl,
  SegmentedControlItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@capi/ui'
import { CircleAlertIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { importProfilesControllerCreate, importsControllerPreview } from '#/api'
import type {
  CsvDateFormat,
  CsvEncoding,
  CsvInspectionDto,
  DecimalSeparator,
  ImportDetailDto,
} from '#/api'
import { importKeys, unwrap } from './api'
import { profileErrorMessage, uploadErrorMessage } from './errors'

/** First lines shown to help tell the columns apart. */
const SAMPLE_SHOWN = 3

const DATE_FORMAT_LABEL: Record<CsvDateFormat, string> = {
  'dd/mm/yyyy': '31/12/2026',
  'yyyy-mm-dd': '2026-12-31',
  'dd-mm-yyyy': '31-12-2026',
  'dd.mm.yyyy': '31.12.2026',
  'dd/mm/yy': '31/12/26',
  'mm/dd/yyyy': '12/31/2026',
}

const ENCODING_LABEL: Record<CsvEncoding, string> = {
  'utf-8': 'UTF-8',
  'windows-1252': 'Windows',
}

type AmountMode = 'amount' | 'debitCredit'

interface Mapping {
  date: string
  label: string
  amount: string
  debit: string
  credit: string
  balance: string
  valueDate: string
}

interface ProfileMappingFormProps {
  file: File
  accountId: string
  inspection: CsvInspectionDto
  /** Suggested name of the source (the account's bank). */
  defaultName?: string
  onPreview: (detail: ImportDetailDto) => void
  onCancel: () => void
}

/**
 * A file in no known format (#431): the owner says which column is which,
 * the mapping is saved as an import profile, and the file is previewed with
 * it. The next file with the same header is recognised.
 */
export function ProfileMappingForm({
  file,
  accountId,
  inspection,
  defaultName = '',
  onPreview,
  onCancel,
}: ProfileMappingFormProps) {
  const id = useId()
  const queryClient = useQueryClient()
  const { suggestion, headers } = inspection
  const guessed = suggestion.columns
  const [name, setName] = useState(defaultName)
  const [mode, setMode] = useState<AmountMode>(
    guessed.debit && guessed.credit && !guessed.amount
      ? 'debitCredit'
      : 'amount',
  )
  const [mapping, setMapping] = useState<Mapping>({
    date: guessed.date ?? '',
    label: guessed.label ?? '',
    amount: guessed.amount ?? '',
    debit: guessed.debit ?? '',
    credit: guessed.credit ?? '',
    balance: guessed.balance ?? '',
    valueDate: guessed.valueDate ?? '',
  })
  const [dateFormat, setDateFormat] = useState<CsvDateFormat>(
    suggestion.dateFormat ?? 'dd/mm/yyyy',
  )
  const [decimal, setDecimal] = useState<DecimalSeparator>(
    suggestion.decimalSeparator,
  )
  const [encoding, setEncoding] = useState<CsvEncoding>(inspection.encoding)
  const [error, setError] = useState<string | null>(null)
  /** Saved but not previewed yet (a failed preview is retried with it). */
  const saved = useRef<string | null>(null)

  const amountFields: (keyof Mapping)[] =
    mode === 'amount' ? ['amount'] : ['debit', 'credit']
  const chosen = (
    ['date', 'label', ...amountFields, 'balance', 'valueDate'] as const
  )
    .map((field) => mapping[field])
    .filter((column) => column !== '')
  const missing =
    mapping.date === '' ||
    mapping.label === '' ||
    amountFields.some((field) => mapping[field] === '')
  const twice = new Set(chosen).size !== chosen.length
  const invalid =
    name.trim() === ''
      ? 'Donnez un nom à ce format.'
      : missing
        ? 'Choisissez la date, le libellé et le montant.'
        : twice
          ? 'Une même colonne est choisie deux fois.'
          : null

  const createProfile = async (): Promise<string> => {
    const optional = (value: string) => (value === '' ? undefined : value)
    try {
      const profile = await unwrap(
        importProfilesControllerCreate({
          body: {
            name: name.trim(),
            headers,
            encoding,
            delimiter: inspection.delimiter,
            decimalSeparator: decimal,
            dateFormat,
            columns: {
              date: mapping.date,
              label: mapping.label,
              ...(mode === 'amount'
                ? { amount: mapping.amount }
                : { debit: mapping.debit, credit: mapping.credit }),
              balance: optional(mapping.balance),
              valueDate: optional(mapping.valueDate),
            },
          },
          throwOnError: false,
        }),
      )
      return profile.id
    } catch (err) {
      throw new Error(profileErrorMessage(err))
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (saved.current === null) {
        saved.current = await createProfile()
        void queryClient.invalidateQueries({ queryKey: importKeys.profiles })
      }
      const profileId = saved.current
      try {
        return await unwrap(
          importsControllerPreview({
            body: { file, accountId, profileId },
            throwOnError: false,
          }),
        )
      } catch (err) {
        throw new Error(uploadErrorMessage(err))
      }
    },
    onSuccess: (detail) => {
      void queryClient.invalidateQueries({ queryKey: importKeys.imports })
      onPreview(detail)
    },
    onError: (err) => setError(err.message),
  })

  const columnSelect = (
    field: keyof Mapping,
    label: string,
    options: { optional?: boolean; help?: string } = {},
  ) => (
    <Field key={field}>
      <FieldLabel htmlFor={`${id}-${field}`}>{label}</FieldLabel>
      <NativeSelect
        id={`${id}-${field}`}
        className="w-full"
        value={mapping[field]}
        disabled={save.isPending}
        onChange={(event) => {
          setMapping((current) => ({ ...current, [field]: event.target.value }))
          setError(null)
        }}
      >
        <NativeSelectOption value="">
          {options.optional ? 'Aucune' : 'Choisir une colonne'}
        </NativeSelectOption>
        {headers.map((header, index) =>
          header === '' ? null : (
            <NativeSelectOption key={`${header}-${index}`} value={header}>
              {header}
            </NativeSelectOption>
          ),
        )}
      </NativeSelect>
      {options.help && <FieldDescription>{options.help}</FieldDescription>}
    </Field>
  )

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (invalid === null) save.mutate()
      }}
    >
      <div className="space-y-1">
        <h3 className="font-medium">Nouveau format de relevé</h3>
        <p className="text-muted-foreground text-sm">
          « {file.name} » n’est dans aucun format connu. Indiquez quelle colonne
          est laquelle : le format sera retenu pour les prochains fichiers de
          cette banque.
        </p>
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table aria-label="Premières lignes du fichier">
          <TableHeader>
            <TableRow>
              {headers.map((header, index) => (
                <TableHead
                  key={`${header}-${index}`}
                  className="whitespace-nowrap"
                >
                  {header || '—'}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {inspection.sample.slice(0, SAMPLE_SHOWN).map((cells, row) => (
              <TableRow key={row}>
                {cells.map((cell, index) => (
                  <TableCell key={index} className="whitespace-nowrap">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Field>
        <FieldLabel htmlFor={`${id}-name`}>Nom du format</FieldLabel>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={100}
          placeholder="Ex. Banque en ligne"
          disabled={save.isPending}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {columnSelect('date', 'Date')}
        {columnSelect('label', 'Libellé')}
      </div>

      <div className="space-y-3">
        <SegmentedControl
          aria-label="Montant"
          value={mode}
          onValueChange={(value) => {
            setMode(value)
            setError(null)
          }}
          fullWidth
          disabled={save.isPending}
        >
          <SegmentedControlItem value="amount">
            Une colonne
          </SegmentedControlItem>
          <SegmentedControlItem value="debitCredit">
            Débit et crédit
          </SegmentedControlItem>
        </SegmentedControl>
        {mode === 'amount' ? (
          columnSelect('amount', 'Montant', {
            help: 'Négatif pour une dépense, positif pour une rentrée.',
          })
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {columnSelect('debit', 'Débit')}
            {columnSelect('credit', 'Crédit')}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {columnSelect('balance', 'Solde', {
          optional: true,
          help: 'Sert à vérifier qu’aucune opération ne manque.',
        })}
        {columnSelect('valueDate', 'Date de valeur', { optional: true })}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor={`${id}-date-format`}>Dates</FieldLabel>
          <NativeSelect
            id={`${id}-date-format`}
            className="w-full"
            value={dateFormat}
            disabled={save.isPending}
            onChange={(event) =>
              setDateFormat(event.target.value as CsvDateFormat)
            }
          >
            {(Object.keys(DATE_FORMAT_LABEL) as CsvDateFormat[]).map(
              (format) => (
                <NativeSelectOption key={format} value={format}>
                  {DATE_FORMAT_LABEL[format]}
                </NativeSelectOption>
              ),
            )}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-decimal`}>Décimales</FieldLabel>
          <NativeSelect
            id={`${id}-decimal`}
            className="w-full"
            value={decimal}
            disabled={save.isPending}
            onChange={(event) =>
              setDecimal(event.target.value as DecimalSeparator)
            }
          >
            <NativeSelectOption value=",">1 234,56</NativeSelectOption>
            <NativeSelectOption value=".">1,234.56</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-encoding`}>Encodage</FieldLabel>
          <NativeSelect
            id={`${id}-encoding`}
            className="w-full"
            value={encoding}
            disabled={save.isPending}
            onChange={(event) => setEncoding(event.target.value as CsvEncoding)}
          >
            {(Object.keys(ENCODING_LABEL) as CsvEncoding[]).map((value) => (
              <NativeSelectOption key={value} value={value}>
                {ENCODING_LABEL[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>

      {invalid !== null ? (
        <FieldError>{invalid}</FieldError>
      ) : (
        <FieldDescription>
          Rien n’est importé avant l’aperçu : vous vérifierez chaque ligne lue.
        </FieldDescription>
      )}

      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Format non enregistré</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          outline
          disabled={save.isPending}
          onClick={onCancel}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={invalid !== null || save.isPending}>
          {save.isPending ? 'Lecture…' : 'Enregistrer et prévisualiser'}
        </Button>
      </div>
    </form>
  )
}
