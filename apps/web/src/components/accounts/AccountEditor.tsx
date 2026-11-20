import {
  Button,
  ConfirmDialog,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  NativeSelectOption,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { AmountField } from '#/components/amount/AmountField'
import { LARGE_AMOUNT_CENTS } from '#/components/amount/signed-amount'
import { useSignedText } from '#/components/amount/use-signed-text'
import type { AccountDto, AccountType } from '#/api/types.gen'
import {
  CryptoSourceFields,
  cryptoProviderName,
  cryptoSourceBody,
  EMPTY_CRYPTO_SOURCE,
  validateCryptoSource,
} from '#/components/crypto/CryptoSourceFields'
import type { CryptoSourceValues } from '#/components/crypto/CryptoSourceFields'
import type { WalletKeyErrors } from '#/components/crypto/WalletKeyFields'
import {
  FORM_SHEET_BOTTOM,
  FORM_SHEET_FORM,
  FORM_SHEET_SIDE,
  FormSheetBody,
  FormSheetFooter,
} from '#/components/sheets/form-sheet'
import {
  CRYPTO_SOURCE_LABELS,
  walletKeyErrorMessage,
} from '#/components/crypto/sources'
import { ACCOUNT_TYPE_LABELS } from '#/components/dashboard/labels'
import { ROUTES } from '#/lib/routes'
import { accountLinkSearch } from './account-origin'
import type { AccountOrigin } from './account-origin'
import { parseAmountToCents } from './amount'
import { previousDay } from '#/components/expenses/manual-fields'
import { todayInParis } from './dates'
import {
  investedBaseOf,
  investedBaseText,
  InvestedBaseScreen,
  takesInvestedBase,
} from '#/components/crypto/InvestedBaseScreen'
import { DeleteAccountScreen } from './DeleteAccountScreen'
import { accountErrorMessage } from './errors'
import { isInvestmentType } from './labels'
import {
  afterAccountsChanged,
  accountKeys,
  afterSnapshotsChanged,
  createAccount,
  saveSnapshot,
  updateAccount,
} from './queries'

const NAME_MAX = 100

/** Every account type, in the order of the picker, with what feeds it. */
export const ACCOUNT_TYPE_OPTIONS: readonly {
  type: AccountType
  label: string
  /** Suggested name while the owner hasn't typed one. */
  defaultName: string
  hint: string
}[] = [
  {
    type: 'checking',
    label: ACCOUNT_TYPE_LABELS.checking,
    defaultName: 'Compte courant',
    hint: 'Alimenté par l’import de vos relevés.',
  },
  {
    type: 'savings',
    label: ACCOUNT_TYPE_LABELS.savings,
    defaultName: 'Livret A',
    hint: 'Livret A, LDDS, livret jeune… alimenté par l’import de vos relevés.',
  },
  {
    type: 'meal_voucher',
    label: ACCOUNT_TYPE_LABELS.meal_voucher,
    defaultName: 'Titres-restaurant',
    hint: 'Carte titres-restaurant : crédits et paiements saisis à la main.',
  },
  {
    type: 'brokerage',
    label: ACCOUNT_TYPE_LABELS.brokerage,
    defaultName: 'PEA',
    hint: 'Suivi par sa valeur à une date, d’après vos relevés.',
  },
  {
    type: 'life_insurance',
    label: ACCOUNT_TYPE_LABELS.life_insurance,
    defaultName: 'Assurance vie',
    hint: 'Suivi par sa valeur à une date, d’après vos relevés.',
  },
  {
    type: 'employee_savings',
    label: ACCOUNT_TYPE_LABELS.employee_savings,
    defaultName: 'Épargne salariale',
    hint: 'PEE, PERCO… suivi par sa valeur à une date.',
  },
  {
    type: 'crypto',
    label: ACCOUNT_TYPE_LABELS.crypto,
    defaultName: 'Crypto',
    hint: 'Un compte par plateforme ou par wallet.',
  },
]

function optionOf(type: AccountType) {
  return ACCOUNT_TYPE_OPTIONS.find((option) => option.type === type)!
}

/** Investment accounts other than crypto start from a statement value. */
function startsWithValue(type: AccountType): boolean {
  return isInvestmentType(type) && type !== 'crypto'
}

/**
 * A meal-voucher card starts from the balance its app shows (#298), kept as
 * the balance at the end of yesterday: what is entered from today adds to it.
 */
function startsWithBalance(type: AccountType): boolean {
  return type === 'meal_voucher'
}

interface FormErrors {
  name?: string
  institution?: string
  cryptoKind?: string
  provider?: string
  otherProvider?: string
  walletKeys?: WalletKeyErrors[]
  walletKeysError?: string
  value?: string
  date?: string
  contributions?: string
}

interface FormValues extends CryptoSourceValues {
  type: AccountType
  name: string
  institution: string
  value: string
  date: string
  contributions: string
}

/** A new crypto account is set up from where it is held, not a bank. */
function picksCryptoProvider(values: FormValues, creating: boolean): boolean {
  return creating && values.type === 'crypto'
}

/** Name proposed until the owner types one: the provider, or the type. */
function suggestedName(values: FormValues): string {
  if (values.type === 'crypto')
    return cryptoProviderName(values) || optionOf('crypto').defaultName
  return optionOf(values.type).defaultName
}

function validate(values: FormValues, today: string, creating: boolean) {
  const errors: FormErrors = {}
  const name = values.name.trim()
  if (name === '') errors.name = 'Indiquez un nom'
  else if (name.length > NAME_MAX) errors.name = '100 caractères maximum'
  if (values.institution.trim().length > NAME_MAX)
    errors.institution = '100 caractères maximum'
  if (picksCryptoProvider(values, creating))
    Object.assign(errors, validateCryptoSource(values, { withSource: true }))
  if (creating && startsWithBalance(values.type)) {
    const cents =
      values.value.trim() === '' ? 0 : parseAmountToCents(values.value)
    if (cents === null) errors.value = 'Montant invalide (ex. 45,60)'
    else if (cents < 0) errors.value = 'Le solde ne peut pas être négatif'
    return errors
  }
  if (!creating || !startsWithValue(values.type)) return errors
  if (values.value.trim() !== '') {
    const cents = parseAmountToCents(values.value)
    if (cents === null) errors.value = 'Montant invalide (ex. 12 345,67)'
    else if (cents < 0) errors.value = 'La valeur ne peut pas être négative'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date))
      errors.date = 'Indiquez une date'
    else if (values.date > today)
      errors.date = 'La date ne peut pas être dans le futur'
  }
  if (
    values.contributions.trim() !== '' &&
    parseAmountToCents(values.contributions) === null
  )
    errors.contributions = 'Montant invalide (ex. 10 000)'
  return errors
}

interface AccountEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Rename or archive this account, or create one when undefined. */
  account?: AccountDto
  /** Preselected type when creating. */
  defaultType?: AccountType
  /** The page it is opened on: the new account page's way back (#324). */
  from?: AccountOrigin
}

/** The editor, its invested amount (#358) or the deletion screen (#297). */
type AccountEditorScreen = 'edit' | 'invested' | 'delete'

/**
 * Creates an account of any type, or renames / archives / deletes one. A bottom sheet
 * on phones, a side sheet otherwise. A new PEA, life insurance or employee
 * savings account can take its current value right away; a new account then
 * opens its page (crypto: to add the first holdings).
 */
export function AccountEditor({
  open,
  onOpenChange,
  account,
  defaultType = 'checking',
  from = 'accounts',
}: AccountEditorProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const id = useId()
  const creating = account === undefined
  const today = todayInParis()

  const [values, setValues] = useState<FormValues>({
    type: defaultType,
    name: '',
    institution: '',
    ...EMPTY_CRYPTO_SOURCE,
    value: '',
    date: today,
    contributions: '',
  })
  const [nameTouched, setNameTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  /** The API refused the public key (checksum, already tracked…). */
  const [keyError, setKeyError] = useState<string>()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [screen, setScreen] = useState<AccountEditorScreen>('edit')

  // Fresh form on every opening.
  useEffect(() => {
    if (!open) return
    setValues({
      type: account?.type ?? defaultType,
      name: account?.name ?? optionOf(defaultType).defaultName,
      institution: account?.institution ?? '',
      ...EMPTY_CRYPTO_SOURCE,
      value: '',
      date: todayInParis(),
      contributions: '',
    })
    setNameTouched(false)
    setSubmitted(false)
    setKeyError(undefined)
    setScreen('edit')
  }, [open, account, defaultType])

  const set = (patch: Partial<FormValues>) =>
    setValues((current) => ({ ...current, ...patch }))
  const contributionsField = useSignedText(values.contributions, (text) =>
    set({ contributions: text }),
  )

  /** Changes what the name is proposed from, and the name if not typed. */
  const choose = (patch: Partial<FormValues>) => {
    if ('walletKeys' in patch || 'cryptoKind' in patch) setKeyError(undefined)
    setValues((current) => {
      const next = { ...current, ...patch }
      return nameTouched ? next : { ...next, name: suggestedName(next) }
    })
  }

  const errors = validate(values, today, creating)
  const valid = Object.keys(errors).length === 0
  const shown: FormErrors = submitted
    ? { ...errors, ...(keyError && { walletKeysError: keyError }) }
    : {}

  const create = useMutation({
    mutationFn: async () => {
      const created = await createAccount(
        picksCryptoProvider(values, true)
          ? {
              name: values.name.trim(),
              type: 'crypto',
              institution: cryptoProviderName(values) || null,
              ...cryptoSourceBody(values),
            }
          : {
              name: values.name.trim(),
              type: values.type,
              institution: values.institution.trim() || null,
            },
      )
      let valueSaved = true
      if (startsWithValue(values.type) && values.value.trim() !== '') {
        try {
          await saveSnapshot(created.id, values.date, {
            valueCents: parseAmountToCents(values.value)!,
            contributionsCents:
              values.contributions.trim() === ''
                ? null
                : parseAmountToCents(values.contributions),
            note: null,
          })
        } catch {
          valueSaved = false
        }
      }
      if (startsWithBalance(values.type) && values.value.trim() !== '') {
        try {
          await saveSnapshot(created.id, previousDay(today), {
            valueCents: parseAmountToCents(values.value)!,
            contributionsCents: null,
            note: null,
          })
        } catch {
          valueSaved = false
        }
      }
      return { created, valueSaved }
    },
    onSuccess: async ({ created, valueSaved }) => {
      if (valueSaved) toast.success(`Compte « ${created.name} » créé`)
      else
        toast.warning(
          startsWithBalance(created.type)
            ? `Compte « ${created.name} » créé, mais son solde n’a pas pu être enregistré. Ajoutez-le depuis sa page.`
            : `Compte « ${created.name} » créé, mais sa valeur n’a pas pu être enregistrée. Ajoutez-la depuis sa page.`,
        )
      onOpenChange(false)
      await Promise.all([
        afterAccountsChanged(queryClient),
        afterSnapshotsChanged(queryClient),
      ])
      await navigate({
        to: ROUTES.account,
        params: { accountId: created.id },
        search: accountLinkSearch(from),
      })
    },
    onError: (error) => {
      const message = walletKeyErrorMessage(error)
      if (message) setKeyError(message)
      toast.error(message ?? accountErrorMessage(error))
    },
  })

  const rename = useMutation({
    mutationFn: () =>
      updateAccount(
        account!.id,
        // A crypto account's exchange or wallet is set when it is created.
        account!.type === 'crypto'
          ? { name: values.name.trim() }
          : {
              name: values.name.trim(),
              institution: values.institution.trim() || null,
            },
      ),
    onSuccess: async (saved) => {
      toast.success(`Compte « ${saved.name} » enregistré`)
      onOpenChange(false)
      await afterAccountsChanged(queryClient)
    },
    onError: (error) => toast.error(accountErrorMessage(error)),
  })

  const archive = useMutation({
    mutationFn: (archived: boolean) => updateAccount(account!.id, { archived }),
    onSuccess: async (saved) => {
      toast.success(
        saved.archivedAt
          ? `Compte « ${saved.name} » archivé`
          : `Compte « ${saved.name} » réactivé`,
      )
      setConfirmArchive(false)
      onOpenChange(false)
      await afterAccountsChanged(queryClient)
    },
    onError: (error) => toast.error(accountErrorMessage(error)),
  })

  /** Leaves the deleted account's page, then refreshes everything it fed. */
  async function afterDelete(deleted: AccountDto) {
    onOpenChange(false)
    await navigate({ to: ROUTES.accounts })
    queryClient.removeQueries({ queryKey: accountKeys.detail(deleted.id) })
    // Its transactions counted in every page (spending, budgets, coverage…).
    await queryClient.invalidateQueries()
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!valid) return
    if (creating) create.mutate()
    else rename.mutate()
  }

  const option = optionOf(values.type)
  const archived = account?.archivedAt != null
  const investedBase = account ? investedBaseOf(account) : null

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={isMobile ? FORM_SHEET_BOTTOM : FORM_SHEET_SIDE}
        >
          <SheetHeader>
            <SheetTitle>
              {creating
                ? 'Nouveau compte'
                : screen === 'delete'
                  ? `Supprimer « ${account.name} » ?`
                  : screen === 'invested'
                    ? 'Montant investi'
                    : 'Modifier le compte'}
            </SheetTitle>
            <SheetDescription>
              {creating
                ? 'Compte bancaire, livret, titres-restaurant, placement ou crypto.'
                : screen === 'delete'
                  ? 'Le compte et toutes ses données.'
                  : screen === 'invested'
                    ? account.name
                    : account.type === 'crypto'
                      ? 'Nom affiché dans l’application.'
                      : 'Nom et établissement affichés dans l’application.'}
            </SheetDescription>
          </SheetHeader>
          {!creating && screen === 'delete' ? (
            <DeleteAccountScreen
              account={account}
              onBack={() => setScreen('edit')}
              onDeleted={() => afterDelete(account)}
            />
          ) : !creating &&
            screen === 'invested' &&
            takesInvestedBase(account) ? (
            <InvestedBaseScreen
              account={account}
              onBack={() => setScreen('edit')}
              onDone={() => onOpenChange(false)}
            />
          ) : (
            <form noValidate onSubmit={submit} className={FORM_SHEET_FORM}>
              <FormSheetBody>
                {creating && (
                  <Field>
                    <FieldLabel htmlFor={`${id}-type`}>Type</FieldLabel>
                    <NativeSelect
                      id={`${id}-type`}
                      className="w-full"
                      value={values.type}
                      onChange={(event) =>
                        choose({ type: event.target.value as AccountType })
                      }
                    >
                      {ACCOUNT_TYPE_OPTIONS.map(({ type, label }) => (
                        <NativeSelectOption key={type} value={type}>
                          {label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldDescription>{option.hint}</FieldDescription>
                  </Field>
                )}
                {picksCryptoProvider(values, creating) && (
                  <CryptoSourceFields
                    id={id}
                    values={values}
                    errors={shown}
                    onChange={choose}
                    withSource
                  />
                )}
                <Field data-invalid={shown.name !== undefined}>
                  <FieldLabel htmlFor={`${id}-name`}>Nom</FieldLabel>
                  <Input
                    id={`${id}-name`}
                    autoComplete="off"
                    maxLength={NAME_MAX}
                    value={values.name}
                    aria-invalid={shown.name !== undefined}
                    onChange={(event) => {
                      setNameTouched(true)
                      set({ name: event.target.value })
                    }}
                  />
                  {shown.name ? (
                    <FieldError>{shown.name}</FieldError>
                  ) : (
                    picksCryptoProvider(values, creating) && (
                      <FieldDescription>Ex. « Ledger perso ».</FieldDescription>
                    )
                  )}
                </Field>
                {values.type === 'crypto' ? (
                  // Set when the account is created (source, exchange or wallet);
                  // another one is another account.
                  !creating && (
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">Source</p>
                      <p>
                        {[
                          account.cryptoSource &&
                            CRYPTO_SOURCE_LABELS[account.cryptoSource],
                          account.institution,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </p>
                      <p className="text-muted-foreground">
                        Fixée à la création. Pour une autre plateforme ou un
                        autre wallet, créez un nouveau compte.
                      </p>
                    </div>
                  )
                ) : (
                  <Field data-invalid={shown.institution !== undefined}>
                    <FieldLabel htmlFor={`${id}-institution`}>
                      Établissement
                    </FieldLabel>
                    <Input
                      id={`${id}-institution`}
                      autoComplete="off"
                      maxLength={NAME_MAX}
                      placeholder={
                        values.type === 'meal_voucher'
                          ? 'Émetteur de la carte'
                          : 'Banque, assureur…'
                      }
                      value={values.institution}
                      aria-invalid={shown.institution !== undefined}
                      onChange={(event) =>
                        set({ institution: event.target.value })
                      }
                    />
                    {shown.institution && (
                      <FieldError>{shown.institution}</FieldError>
                    )}
                  </Field>
                )}
                {creating && startsWithBalance(values.type) && (
                  <Field data-invalid={shown.value !== undefined}>
                    <FieldLabel htmlFor={`${id}-balance`}>
                      Solde actuel
                    </FieldLabel>
                    <AmountField
                      maxCents={LARGE_AMOUNT_CENTS}
                      id={`${id}-balance`}
                      placeholder="0,00"
                      value={values.value}
                      aria-invalid={shown.value !== undefined}
                      onValueChange={(typed) => set({ value: typed })}
                    />
                    {shown.value ? (
                      <FieldError>{shown.value}</FieldError>
                    ) : (
                      <FieldDescription>
                        Facultatif : le solde affiché par l’application de la
                        carte. Les crédits et paiements saisis à partir
                        d’aujourd’hui s’y ajoutent.
                      </FieldDescription>
                    )}
                  </Field>
                )}
                {creating && startsWithValue(values.type) && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field data-invalid={shown.value !== undefined}>
                        <FieldLabel htmlFor={`${id}-value`}>
                          Valeur actuelle
                        </FieldLabel>
                        <AmountField
                          maxCents={LARGE_AMOUNT_CENTS}
                          id={`${id}-value`}
                          placeholder="12 345,67"
                          value={values.value}
                          aria-invalid={shown.value !== undefined}
                          onValueChange={(typed) => set({ value: typed })}
                        />
                        {shown.value && <FieldError>{shown.value}</FieldError>}
                      </Field>
                      <Field data-invalid={shown.date !== undefined}>
                        <FieldLabel htmlFor={`${id}-date`}>
                          À la date du
                        </FieldLabel>
                        <Input
                          id={`${id}-date`}
                          type="date"
                          max={today}
                          value={values.date}
                          aria-invalid={shown.date !== undefined}
                          onChange={(event) =>
                            set({ date: event.target.value })
                          }
                        />
                        {shown.date && <FieldError>{shown.date}</FieldError>}
                      </Field>
                    </div>
                    <Field data-invalid={shown.contributions !== undefined}>
                      <FieldLabel htmlFor={`${id}-contributions`}>
                        Versements nets
                      </FieldLabel>
                      <AmountField
                        maxCents={LARGE_AMOUNT_CENTS}
                        id={`${id}-contributions`}
                        placeholder="10 000"
                        aria-invalid={shown.contributions !== undefined}
                        {...contributionsField}
                      />
                      {shown.contributions ? (
                        <FieldError>{shown.contributions}</FieldError>
                      ) : (
                        <FieldDescription>
                          Facultatif : total versé moins les retraits, pour
                          suivre la plus-value. Valeur et versements peuvent
                          aussi être ajoutés plus tard.
                        </FieldDescription>
                      )}
                    </Field>
                  </>
                )}
                {!creating && takesInvestedBase(account) && (
                  <section
                    aria-labelledby={`${id}-invested`}
                    className="space-y-2 border-t pt-4"
                  >
                    <h3 id={`${id}-invested`} className="text-sm font-medium">
                      Montant investi
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {investedBase
                        ? `${investedBaseText(investedBase)}, plus le coût des cryptos reçues depuis.`
                        : 'Non renseigné : indiquez ce que vous avez payé pour suivre la plus-value, comme pour un PEA.'}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      outline
                      className="w-full"
                      onClick={() => setScreen('invested')}
                    >
                      Modifier le montant investi
                    </Button>
                  </section>
                )}
                {!creating && (
                  <section
                    aria-labelledby={`${id}-end`}
                    className="space-y-3 border-t pt-4"
                  >
                    <h3 id={`${id}-end`} className="text-sm font-medium">
                      {archived
                        ? 'Réactiver ou supprimer'
                        : 'Archiver ou supprimer'}
                    </h3>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {archived
                          ? 'Archivé : il n’apparaît plus dans les listes ni les imports, son historique est conservé.'
                          : 'Archiver le retire des listes et des imports en gardant son historique. Vous pourrez le réactiver.'}
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        outline
                        className="w-full"
                        loading={archived && archive.isPending}
                        onClick={() =>
                          archived
                            ? archive.mutate(false)
                            : setConfirmArchive(true)
                        }
                      >
                        {archived ? 'Réactiver' : 'Archiver'}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Supprimer efface le compte et toutes ses données, pour
                        un compte créé par erreur ou en double. C’est définitif.
                      </p>
                      <Button
                        type="button"
                        variant="danger"
                        outline
                        className="w-full"
                        onClick={() => setScreen('delete')}
                      >
                        Supprimer le compte
                      </Button>
                    </div>
                  </section>
                )}
              </FormSheetBody>
              <FormSheetFooter>
                <Button
                  type="submit"
                  className="min-h-11 flex-1 font-medium"
                  loading={creating ? create.isPending : rename.isPending}
                >
                  {creating ? 'Créer le compte' : 'Enregistrer'}
                </Button>
              </FormSheetFooter>
            </form>
          )}
        </SheetContent>
      </Sheet>
      {account && !archived && (
        <ConfirmDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={`Archiver « ${account.name} » ?`}
          description="Il disparaît des listes et des imports. Son historique est conservé et vous pourrez le réactiver depuis la page Comptes."
          confirmLabel="Archiver"
          variant="danger"
          loading={archive.isPending}
          onConfirm={() => archive.mutate(true)}
        />
      )}
    </>
  )
}

/** "Nouveau compte" button that opens the account editor. */
export function NewAccountButton({
  label = 'Nouveau compte',
  defaultType,
  size,
  outline,
  icon = <PlusIcon />,
  className,
  from,
}: {
  label?: string
  defaultType?: AccountType
  size?: 'sm'
  outline?: boolean
  /** Defaults to « + ». */
  icon?: ReactNode
  className?: string
  /** The page it is on: the new account page's way back (#324). */
  from?: AccountOrigin
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        iconStart={icon}
        className={className}
        size={size}
        outline={outline}
        variant={outline ? 'secondary' : undefined}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <AccountEditor
        open={open}
        onOpenChange={setOpen}
        defaultType={defaultType}
        from={from}
      />
    </>
  )
}
