import {
  Button,
  ConfirmDialog,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Label,
  NativeSelect,
  NativeSelectOption,
  RadioGroup,
  RadioGroupItem,
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
import { toast } from 'sonner'
import type { AccountDto, AccountType } from '#/api/types.gen'
import { ROUTES } from '#/lib/routes'
import { parseAmountToCents } from './amount'
import { todayInParis } from './dates'
import { accountErrorMessage } from './errors'
import { isInvestmentType } from './labels'
import {
  afterAccountsChanged,
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
    label: 'Compte courant',
    defaultName: 'Compte courant',
    hint: 'Alimenté par l’import de vos relevés.',
  },
  {
    type: 'savings',
    label: 'Livret d’épargne',
    defaultName: 'Livret A',
    hint: 'Livret A, LDDS, livret jeune… alimenté par l’import de vos relevés.',
  },
  {
    type: 'brokerage',
    label: 'PEA / compte-titres',
    defaultName: 'PEA',
    hint: 'Suivi par sa valeur à une date, d’après vos relevés.',
  },
  {
    type: 'life_insurance',
    label: 'Assurance vie',
    defaultName: 'Assurance vie',
    hint: 'Suivi par sa valeur à une date, d’après vos relevés.',
  },
  {
    type: 'employee_savings',
    label: 'Épargne salariale',
    defaultName: 'Épargne salariale',
    hint: 'PEE, PERCO… suivi par sa valeur à une date.',
  },
  {
    type: 'crypto',
    label: 'Crypto',
    defaultName: 'Crypto',
    hint: 'Une plateforme ou un wallet par compte, valorisé chaque jour à partir de ses avoirs.',
  },
]

/**
 * Where the account is held: a bank or insurer, or for crypto the exchange
 * or wallet (one per account).
 */
function institutionField(type: AccountType) {
  return type === 'crypto'
    ? { label: 'Plateforme ou wallet', placeholder: 'Binance, Ledger…' }
    : { label: 'Établissement', placeholder: 'Banque, assureur…' }
}

/** Where a crypto account's assets are held. */
export type CryptoKind = 'exchange' | 'wallet'

/** "Autre…" in the provider list: the owner types the name. */
const OTHER_PROVIDER = 'other'

/** Common providers, in the order of the list ("Autre…" comes last). */
export const CRYPTO_PROVIDERS: Record<CryptoKind, readonly string[]> = {
  exchange: ['Binance', 'Coinbase', 'Kraken', 'Bitpanda'],
  wallet: ['Ledger', 'Trezor', 'MetaMask'],
}

const CRYPTO_KIND_TEXT: Record<
  CryptoKind,
  { label: string; description: string; field: string; other: string }
> = {
  exchange: {
    label: 'Plateforme d’échange',
    description: 'Binance, Coinbase… : la plateforme garde vos cryptos.',
    field: 'Plateforme',
    other: 'Nom de la plateforme',
  },
  wallet: {
    label: 'Wallet',
    description: 'Ledger, MetaMask… : vous gardez vos clés.',
    field: 'Wallet',
    other: 'Nom du wallet',
  },
}

function optionOf(type: AccountType) {
  return ACCOUNT_TYPE_OPTIONS.find((option) => option.type === type)!
}

/** Investment accounts other than crypto start from a statement value. */
function startsWithValue(type: AccountType): boolean {
  return isInvestmentType(type) && type !== 'crypto'
}

interface FormErrors {
  name?: string
  institution?: string
  cryptoKind?: string
  provider?: string
  otherProvider?: string
  value?: string
  date?: string
  contributions?: string
}

interface FormValues {
  type: AccountType
  name: string
  institution: string
  cryptoKind: CryptoKind | ''
  /** A name from `CRYPTO_PROVIDERS`, `OTHER_PROVIDER` or '' (none yet). */
  provider: string
  otherProvider: string
  value: string
  date: string
  contributions: string
}

/** A new crypto account is set up from where it is held, not a bank. */
function picksCryptoProvider(values: FormValues, creating: boolean): boolean {
  return creating && values.type === 'crypto'
}

/** The exchange or wallet chosen for a new crypto account, or ''. */
function cryptoProviderName(values: FormValues): string {
  return values.provider === OTHER_PROVIDER
    ? values.otherProvider.trim()
    : values.provider
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
  if (picksCryptoProvider(values, creating)) {
    if (values.cryptoKind === '')
      errors.cryptoKind = 'Choisissez une plateforme ou un wallet'
    else if (values.provider === '')
      errors.provider =
        values.cryptoKind === 'exchange'
          ? 'Choisissez la plateforme'
          : 'Choisissez le wallet'
    else if (values.provider === OTHER_PROVIDER) {
      const other = values.otherProvider.trim()
      if (other === '') errors.otherProvider = 'Indiquez son nom'
      else if (other.length > NAME_MAX)
        errors.otherProvider = '100 caractères maximum'
    }
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
}

/**
 * Creates an account of any type, or renames / archives one. A bottom sheet
 * on phones, a side sheet otherwise. A new PEA, life insurance or employee
 * savings account can take its current value right away; a new account then
 * opens its page (crypto: to add the first holdings).
 */
export function AccountEditor({
  open,
  onOpenChange,
  account,
  defaultType = 'checking',
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
    cryptoKind: '',
    provider: '',
    otherProvider: '',
    value: '',
    date: today,
    contributions: '',
  })
  const [nameTouched, setNameTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  // Fresh form on every opening.
  useEffect(() => {
    if (!open) return
    setValues({
      type: account?.type ?? defaultType,
      name: account?.name ?? optionOf(defaultType).defaultName,
      institution: account?.institution ?? '',
      cryptoKind: '',
      provider: '',
      otherProvider: '',
      value: '',
      date: todayInParis(),
      contributions: '',
    })
    setNameTouched(false)
    setSubmitted(false)
  }, [open, account, defaultType])

  const set = (patch: Partial<FormValues>) =>
    setValues((current) => ({ ...current, ...patch }))

  /** Changes what the name is proposed from, and the name if not typed. */
  const choose = (patch: Partial<FormValues>) =>
    setValues((current) => {
      const next = { ...current, ...patch }
      return nameTouched ? next : { ...next, name: suggestedName(next) }
    })

  const errors = validate(values, today, creating)
  const valid = Object.keys(errors).length === 0
  const shown = submitted ? errors : {}

  const create = useMutation({
    mutationFn: async () => {
      const created = await createAccount({
        name: values.name.trim(),
        type: values.type,
        institution: picksCryptoProvider(values, true)
          ? cryptoProviderName(values)
          : values.institution.trim() || null,
      })
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
      return { created, valueSaved }
    },
    onSuccess: async ({ created, valueSaved }) => {
      if (valueSaved) toast.success(`Compte « ${created.name} » créé`)
      else
        toast.warning(
          `Compte « ${created.name} » créé, mais sa valeur n’a pas pu être enregistrée. Ajoutez-la depuis sa page.`,
        )
      onOpenChange(false)
      await Promise.all([
        afterAccountsChanged(queryClient),
        afterSnapshotsChanged(queryClient),
      ])
      await navigate({
        to: ROUTES.account,
        params: { accountId: created.id },
      })
    },
    onError: (error) => toast.error(accountErrorMessage(error)),
  })

  const rename = useMutation({
    mutationFn: () =>
      updateAccount(account!.id, {
        name: values.name.trim(),
        institution: values.institution.trim() || null,
      }),
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

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!valid) return
    if (creating) create.mutate()
    else rename.mutate()
  }

  const option = optionOf(values.type)
  const archived = account?.archivedAt != null

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={
            isMobile
              ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
              : undefined
          }
        >
          <SheetHeader className="pb-0">
            <SheetTitle>
              {creating ? 'Nouveau compte' : 'Modifier le compte'}
            </SheetTitle>
            <SheetDescription>
              {creating
                ? 'Compte bancaire, livret, placement ou crypto.'
                : 'Nom et établissement affichés dans l’application.'}
            </SheetDescription>
          </SheetHeader>
          <form noValidate onSubmit={submit} className="space-y-4 px-4 pb-6">
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
              <>
                <fieldset
                  className="space-y-1"
                  aria-describedby={
                    shown.cryptoKind ? `${id}-kind-error` : undefined
                  }
                >
                  <legend className="mb-2 text-sm font-medium">
                    Où sont ces cryptos ?
                  </legend>
                  <RadioGroup
                    value={values.cryptoKind}
                    onValueChange={(value) =>
                      choose({
                        cryptoKind: value as CryptoKind,
                        provider: '',
                        otherProvider: '',
                      })
                    }
                  >
                    {(['exchange', 'wallet'] as const).map((kind) => (
                      <div
                        key={kind}
                        className="flex min-h-11 items-start gap-2 py-1"
                      >
                        <RadioGroupItem
                          value={kind}
                          id={`${id}-kind-${kind}`}
                          className="mt-1"
                        />
                        <Label
                          htmlFor={`${id}-kind-${kind}`}
                          className="flex flex-col items-start gap-0.5 font-normal"
                        >
                          <span className="font-medium">
                            {CRYPTO_KIND_TEXT[kind].label}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            {CRYPTO_KIND_TEXT[kind].description}
                          </span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                  {shown.cryptoKind && (
                    <FieldError id={`${id}-kind-error`}>
                      {shown.cryptoKind}
                    </FieldError>
                  )}
                </fieldset>
                {values.cryptoKind !== '' && (
                  <Field data-invalid={shown.provider !== undefined}>
                    <FieldLabel htmlFor={`${id}-provider`}>
                      {CRYPTO_KIND_TEXT[values.cryptoKind].field}
                    </FieldLabel>
                    <NativeSelect
                      id={`${id}-provider`}
                      className="w-full"
                      value={values.provider}
                      aria-invalid={shown.provider !== undefined}
                      onChange={(event) =>
                        choose({ provider: event.target.value })
                      }
                    >
                      <NativeSelectOption value="" disabled>
                        Choisir…
                      </NativeSelectOption>
                      {CRYPTO_PROVIDERS[values.cryptoKind].map((name) => (
                        <NativeSelectOption key={name} value={name}>
                          {name}
                        </NativeSelectOption>
                      ))}
                      <NativeSelectOption value={OTHER_PROVIDER}>
                        Autre…
                      </NativeSelectOption>
                    </NativeSelect>
                    {shown.provider && (
                      <FieldError>{shown.provider}</FieldError>
                    )}
                  </Field>
                )}
                {values.cryptoKind !== '' &&
                  values.provider === OTHER_PROVIDER && (
                    <Field data-invalid={shown.otherProvider !== undefined}>
                      <FieldLabel htmlFor={`${id}-other-provider`}>
                        {CRYPTO_KIND_TEXT[values.cryptoKind].other}
                      </FieldLabel>
                      <Input
                        id={`${id}-other-provider`}
                        autoComplete="off"
                        maxLength={NAME_MAX}
                        value={values.otherProvider}
                        aria-invalid={shown.otherProvider !== undefined}
                        onChange={(event) =>
                          choose({ otherProvider: event.target.value })
                        }
                      />
                      {shown.otherProvider && (
                        <FieldError>{shown.otherProvider}</FieldError>
                      )}
                    </Field>
                  )}
              </>
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
                  <FieldDescription>
                    Utile si vous avez plusieurs comptes chez le même acteur,
                    par ex. « Ledger perso ».
                  </FieldDescription>
                )
              )}
            </Field>
            {!picksCryptoProvider(values, creating) && (
              <Field data-invalid={shown.institution !== undefined}>
                <FieldLabel htmlFor={`${id}-institution`}>
                  {institutionField(values.type).label}
                </FieldLabel>
                <Input
                  id={`${id}-institution`}
                  autoComplete="off"
                  maxLength={NAME_MAX}
                  placeholder={institutionField(values.type).placeholder}
                  value={values.institution}
                  aria-invalid={shown.institution !== undefined}
                  onChange={(event) => set({ institution: event.target.value })}
                />
                {shown.institution && (
                  <FieldError>{shown.institution}</FieldError>
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
                    <InputGroup>
                      <InputGroupInput
                        id={`${id}-value`}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="12 345,67"
                        value={values.value}
                        aria-invalid={shown.value !== undefined}
                        onChange={(event) => set({ value: event.target.value })}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>€</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    {shown.value && <FieldError>{shown.value}</FieldError>}
                  </Field>
                  <Field data-invalid={shown.date !== undefined}>
                    <FieldLabel htmlFor={`${id}-date`}>À la date du</FieldLabel>
                    <Input
                      id={`${id}-date`}
                      type="date"
                      max={today}
                      value={values.date}
                      aria-invalid={shown.date !== undefined}
                      onChange={(event) => set({ date: event.target.value })}
                    />
                    {shown.date && <FieldError>{shown.date}</FieldError>}
                  </Field>
                </div>
                <Field data-invalid={shown.contributions !== undefined}>
                  <FieldLabel htmlFor={`${id}-contributions`}>
                    Versements nets
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={`${id}-contributions`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="10 000"
                      value={values.contributions}
                      aria-invalid={shown.contributions !== undefined}
                      onChange={(event) =>
                        set({ contributions: event.target.value })
                      }
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>€</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  {shown.contributions ? (
                    <FieldError>{shown.contributions}</FieldError>
                  ) : (
                    <FieldDescription>
                      Facultatif : total versé moins les retraits, pour suivre
                      la plus-value. Valeur et versements peuvent aussi être
                      ajoutés plus tard.
                    </FieldDescription>
                  )}
                </Field>
              </>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {!creating && (
                <Button
                  type="button"
                  variant={archived ? 'secondary' : 'danger'}
                  outline
                  loading={archived && archive.isPending}
                  onClick={() =>
                    archived ? archive.mutate(false) : setConfirmArchive(true)
                  }
                >
                  {archived ? 'Réactiver' : 'Archiver'}
                </Button>
              )}
              <Button
                type="submit"
                className="sm:ml-auto"
                loading={creating ? create.isPending : rename.isPending}
              >
                {creating ? 'Créer le compte' : 'Enregistrer'}
              </Button>
            </div>
          </form>
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
}: {
  label?: string
  defaultType?: AccountType
  size?: 'sm'
  outline?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        iconStart={<PlusIcon />}
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
      />
    </>
  )
}
