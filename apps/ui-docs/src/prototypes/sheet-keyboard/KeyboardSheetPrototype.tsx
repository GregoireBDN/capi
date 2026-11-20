/*
 * Prototypes of #385: how a bottom sheet with typed fields sits with the
 * phone keyboard. Throwaway: the PR that builds the chosen direction deletes
 * this folder (and the phone page that imports it).
 *
 * Directions (see the issue):
 *  - now: today's behaviour (#205 / #323), for comparison.
 *  - A: the sheet's top edge is fixed (8 % below the status bar); the
 *       keyboard only shortens it from below, the actions ride above it.
 *  - B: full-screen editor (« Annuler » · title · « Enregistrer » on top);
 *       the keyboard covers the end of a scrolling page, nothing moves.
 *  - C: amounts on the app's own keypad, docked in the sheet from the
 *       opening; text fields behave as in A.
 *  - D: today's layout, but no field focused on open, and the sheet moves
 *       with the keyboard (as it starts, from the last height seen) instead
 *       of after it.
 */
import {
  Button,
  cn,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  NativeSelect,
  NativeSelectOption,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@finances/ui'
import {
  BitcoinIcon,
  CheckIcon,
  ChevronLeftIcon,
  DeleteIcon,
  KeyRoundIcon,
  LandmarkIcon,
  PencilIcon,
  SearchIcon,
} from 'lucide-react'
import * as React from 'react'

/* ---------------------------------------------------------------------------
 * Directions and sheets
 * ------------------------------------------------------------------------ */

export type Direction = 'now' | 'A' | 'B' | 'C' | 'D'
export type PrototypeKind = 'value' | 'account' | 'crypto'

export const DIRECTIONS: {
  id: Direction
  name: string
  summary: string
}[] = [
  {
    id: 'now',
    name: 'Actuel',
    summary:
      'Aujourd’hui : le panneau monte, puis remonte d’un coup une fois le clavier ouvert.',
  },
  {
    id: 'A',
    name: 'A. Haut fixe',
    summary:
      'Le panneau s’ouvre haut et son bord du haut ne bouge plus ; le clavier le raccourcit par le bas, le bouton reste au-dessus.',
  },
  {
    id: 'B',
    name: 'B. Plein écran',
    summary:
      'Un écran entier avec « Annuler » et « Enregistrer » en haut, comme les fiches iOS ; le clavier recouvre le bas, rien ne bouge.',
  },
  {
    id: 'C',
    name: 'C. Pavé de l’app',
    summary:
      'Les montants et quantités se tapent sur le pavé du panneau (pas de clavier iPhone) ; les textes comme en A.',
  },
  {
    id: 'D',
    name: 'D. Avec le clavier',
    summary:
      'Comme aujourd’hui, mais aucun champ actif à l’ouverture et le panneau monte en même temps que le clavier, pas après.',
  },
]

export const KINDS: { id: PrototypeKind; name: string; detail: string }[] = [
  {
    id: 'value',
    name: 'Mettre à jour la valeur',
    detail: 'court : date, valeur, note',
  },
  {
    id: 'account',
    name: 'Compte',
    detail: 'long : sept champs, il défile',
  },
  {
    id: 'crypto',
    name: 'Ajouter des cryptos',
    detail: 'par étapes : source, actif, quantité',
  },
]

/* ---------------------------------------------------------------------------
 * Sheet classes per direction (phone, bottom sheet)
 * ------------------------------------------------------------------------ */

/** Today's form sheet (`FORM_SHEET_BOTTOM`, #323). */
const KEYBOARD_OPEN_HEIGHT =
  'data-[side=bottom]:data-keyboard-open:h-[calc(100svh-var(--keyboard-inset,0px)-env(safe-area-inset-top)-0.5rem)] data-[side=bottom]:data-keyboard-open:max-h-none'
const NOW_FORM = cn(
  'gap-0 rounded-t-xl data-[side=bottom]:max-h-[calc(92svh-var(--keyboard-inset,0px))]',
  KEYBOARD_OPEN_HEIGHT,
)
/** Today's stepped sheet (`STEPPED_SHEET_BOTTOM`). */
const NOW_STEPPED = cn(
  'gap-0 rounded-t-xl data-[side=bottom]:h-[min(32rem,calc(92svh-var(--keyboard-inset,0px)))]',
  KEYBOARD_OPEN_HEIGHT,
)

/** A (and C): from 8 % under the status bar down to the keyboard. */
const FIXED_TOP = cn(
  'gap-0 rounded-t-xl',
  'data-[side=bottom]:top-[calc(env(safe-area-inset-top)+8svh)]',
  'data-[side=bottom]:h-auto data-[side=bottom]:max-h-none',
  // The bottom edge follows the keyboard (`--keyboard-inset`), smoothly.
  'transition-[bottom,padding] duration-250 ease-out',
)

/** B: the whole screen, never moved by the keyboard. */
const FULL_SCREEN = cn(
  'gap-0 rounded-none border-t-0',
  'data-[side=bottom]:top-0 data-[side=bottom]:bottom-0',
  'data-[side=bottom]:h-auto data-[side=bottom]:max-h-none',
  'data-[side=bottom]:pt-[env(safe-area-inset-top)]',
  'data-[side=bottom]:data-keyboard-open:pb-0',
)

/**
 * D: today's sheet, but its bottom is the larger of the real keyboard and
 * the one expected as soon as a field gets focus (`--kb-predict`), animated
 * on iOS's keyboard curve so both move together.
 */
const WITH_KEYBOARD = (stepped: boolean) =>
  cn(
    stepped ? NOW_STEPPED : NOW_FORM,
    'transition-[bottom,height,padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
    'data-[side=bottom]:bottom-[max(var(--keyboard-inset,0px),var(--kb-predict,0px))]',
    'data-[side=bottom]:data-kb-predict:pb-(--keyboard-accessory,84px)',
    'data-[side=bottom]:data-kb-predict:max-h-none',
    'data-[side=bottom]:data-kb-predict:h-[calc(100svh-max(var(--keyboard-inset,0px),var(--kb-predict,0px))-env(safe-area-inset-top)-0.5rem)]',
  )

function contentClass(direction: Direction, kind: PrototypeKind) {
  const stepped = kind === 'crypto'
  switch (direction) {
    case 'now':
      return stepped ? NOW_STEPPED : NOW_FORM
    case 'A':
    case 'C':
      return FIXED_TOP
    case 'B':
      return FULL_SCREEN
    case 'D':
      return WITH_KEYBOARD(stepped)
  }
}

/* ---------------------------------------------------------------------------
 * D: the keyboard expected from the focus, not after it
 * ------------------------------------------------------------------------ */

const NO_KEYBOARD_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'file',
  'month',
  'radio',
  'range',
  'reset',
  'submit',
  'time',
  'week',
])

function opensKeyboard(
  target: EventTarget | null,
): target is HTMLInputElement | HTMLTextAreaElement {
  if (target instanceof HTMLTextAreaElement) return !target.readOnly
  return (
    target instanceof HTMLInputElement &&
    !target.readOnly &&
    !NO_KEYBOARD_TYPES.has(target.type)
  )
}

const keyboardKind = (field: HTMLInputElement | HTMLTextAreaElement) =>
  field.inputMode === 'decimal' || field.inputMode === 'numeric'
    ? 'decimal'
    : 'text'

const STORE = 'proto-385-keyboard-'

function expectedKeyboard(kind: string): number {
  try {
    const stored = Number(localStorage.getItem(STORE + kind))
    if (stored > 0) return stored
  } catch {
    // Private mode: guess.
  }
  return Math.round(window.innerHeight * (kind === 'decimal' ? 0.33 : 0.4))
}

function usePredictedKeyboard(node: HTMLElement | null, enabled: boolean) {
  React.useEffect(() => {
    const viewport =
      typeof window === 'undefined' ? null : window.visualViewport
    if (!enabled || !node || !viewport) return
    let kind: string | null = null
    const set = (px: number) => {
      node.style.setProperty('--kb-predict', `${px}px`)
      node.toggleAttribute('data-kb-predict', px > 0)
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!opensKeyboard(event.target)) return
      kind = keyboardKind(event.target)
      set(expectedKeyboard(kind))
    }
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget
      if (next instanceof Node && node.contains(next) && opensKeyboard(next))
        return
      kind = null
      set(0)
    }
    const onResize = () => {
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
      )
      if (!kind || inset < 120) return
      try {
        localStorage.setItem(STORE + kind, String(inset))
      } catch {
        // Kept for this field only.
      }
      set(inset)
    }
    node.addEventListener('focusin', onFocusIn)
    node.addEventListener('focusout', onFocusOut)
    viewport.addEventListener('resize', onResize)
    return () => {
      node.removeEventListener('focusin', onFocusIn)
      node.removeEventListener('focusout', onFocusOut)
      viewport.removeEventListener('resize', onResize)
      set(0)
    }
  }, [node, enabled])
}

/* ---------------------------------------------------------------------------
 * C: the app's keypad
 * ------------------------------------------------------------------------ */

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back']

function typeKey(text: string, key: string, decimals: number): string {
  if (key === 'back') return text.slice(0, -1)
  if (key === ',') {
    if (text.includes(',')) return text
    return text === '' ? '0,' : `${text},`
  }
  const [, fraction] = text.split(',')
  if (fraction !== undefined && fraction.length >= decimals) return text
  if (text === '0') return key
  if (text.replace(',', '').length >= 12) return text
  return text + key
}

function Keypad({ onKey }: { onKey: (key: string) => void }) {
  return (
    <div
      role="group"
      aria-label="Pavé numérique"
      className="grid touch-manipulation grid-cols-3 gap-1.5 select-none"
    >
      {DIGITS.map((key) => (
        <button
          key={key}
          type="button"
          aria-label={key === 'back' ? 'Effacer' : undefined}
          // The field keeps the focus: no system keyboard.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onKey(key)}
          className={cn(
            'flex h-[2.2rem] items-center justify-center rounded-lg bg-background text-xl font-medium tabular-nums shadow-xs',
            'transition-colors outline-none active:bg-muted dark:bg-input/40 dark:active:bg-input/70',
          )}
        >
          {key === 'back' ? <DeleteIcon aria-hidden className="size-6" /> : key}
        </button>
      ))}
    </div>
  )
}

const caret = (
  <span
    aria-hidden
    className="mx-px inline-block h-5 w-0.5 translate-y-1 animate-pulse bg-foreground"
  />
)

/**
 * An amount or quantity in C: a field-looking button, the keypad types in
 * the active one.
 */
function KeypadField({
  id,
  value,
  placeholder,
  suffix,
  active,
  onActivate,
}: {
  id: string
  value: string
  placeholder: string
  suffix?: string
  active: boolean
  onActivate: () => void
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onActivate}
      className={cn(
        'flex h-11 w-full items-center rounded-md border bg-transparent px-3 text-left text-base tabular-nums shadow-xs dark:bg-input/30',
        active && 'border-ring ring-3 ring-ring/50',
      )}
    >
      <span className={cn('flex-1', !value && 'text-muted-foreground')}>
        {active && !value && caret}
        {value || placeholder}
        {active && value && caret}
      </span>
      {suffix && <span className="text-muted-foreground">{suffix}</span>}
    </button>
  )
}

/* ---------------------------------------------------------------------------
 * Fields of the three sheets
 * ------------------------------------------------------------------------ */

interface AmountSpec {
  key: string
  label: string
  placeholder: string
  suffix?: string
  decimals: number
  help?: string
}

type Values = Record<string, string>

/**
 * An amount in every direction: typed with the decimal keyboard, or on the
 * keypad in C.
 */
function AmountInput({
  spec,
  id,
  values,
  setValue,
  keypad,
  active,
  setActive,
}: {
  spec: AmountSpec
  id: string
  values: Values
  setValue: (key: string, value: string) => void
  keypad: boolean
  active: string | null
  setActive: (key: string) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{spec.label}</FieldLabel>
      {keypad ? (
        <KeypadField
          id={id}
          value={values[spec.key] ?? ''}
          placeholder={spec.placeholder}
          suffix={spec.suffix}
          active={active === spec.key}
          onActivate={() => setActive(spec.key)}
        />
      ) : (
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder={spec.placeholder}
          value={values[spec.key] ?? ''}
          onChange={(event) => setValue(spec.key, event.target.value)}
        />
      )}
      {spec.help && <FieldDescription>{spec.help}</FieldDescription>}
    </Field>
  )
}

const VALUE_AMOUNTS: AmountSpec[] = [
  {
    key: 'value',
    label: 'Valeur',
    placeholder: '12 345,67',
    decimals: 2,
    suffix: '€',
  },
]
const ACCOUNT_AMOUNTS: AmountSpec[] = [
  {
    key: 'balance',
    label: 'Solde actuel',
    placeholder: '1 234,56',
    decimals: 2,
    suffix: '€',
    help: 'Facultatif : le solde de votre espace client, aujourd’hui.',
  },
]
const CRYPTO_AMOUNTS: AmountSpec[] = [
  { key: 'quantity', label: 'Quantité', placeholder: '0,05', decimals: 8 },
  {
    key: 'invested',
    label: 'Investi',
    placeholder: '1 500',
    decimals: 2,
    suffix: '€',
    help: 'Facultatif : ce que vous avez payé, frais compris.',
  },
]

const ASSETS = [
  ['BTC', 'Bitcoin'],
  ['ETH', 'Ethereum'],
  ['SOL', 'Solana'],
  ['ADA', 'Cardano'],
  ['DOT', 'Polkadot'],
  ['XRP', 'XRP'],
  ['LINK', 'Chainlink'],
  ['AVAX', 'Avalanche'],
  ['ATOM', 'Cosmos'],
  ['MATIC', 'Polygon'],
] as const

const TODAY = new Date().toISOString().slice(0, 10)

/* ---------------------------------------------------------------------------
 * The prototype sheet
 * ------------------------------------------------------------------------ */

export function KeyboardSheetPrototype({
  direction,
  kind,
  open,
  onOpenChange,
  simulateKeyboard = false,
}: {
  direction: Direction
  kind: PrototypeKind
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Storybook only: shows the sheet as with a keyboard of 336px. */
  simulateKeyboard?: boolean
}) {
  const id = React.useId()
  const formId = `${id}-form`
  const [node, setNode] = React.useState<HTMLDivElement | null>(null)
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const firstFieldRef = React.useRef<HTMLInputElement>(null)
  const [values, setValues] = React.useState<Values>({
    date: TODAY,
    where: 'Crypto',
  })
  const [step, setStep] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [asset, setAsset] = React.useState<string | null>(null)
  const keypad = direction === 'C'
  const amounts =
    kind === 'value'
      ? VALUE_AMOUNTS
      : kind === 'account'
        ? ACCOUNT_AMOUNTS
        : step === 3
          ? CRYPTO_AMOUNTS
          : []
  const [active, setActive] = React.useState<string | null>(null)
  const activeSpec = amounts.find((spec) => spec.key === active) ?? null

  usePredictedKeyboard(node, direction === 'D' && open)

  // Every sheet starts on its first step, empty.
  React.useEffect(() => {
    if (!open) return
    setStep(1)
    setSearch('')
    setAsset(null)
    setValues({ date: TODAY, where: 'Crypto' })
  }, [open])
  // C: the keypad types in the first amount of the screen.
  React.useEffect(() => {
    setActive(keypad ? (amounts[0]?.key ?? null) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keypad, kind, step, open])

  // Storybook: the state the keyboard would leave.
  React.useEffect(() => {
    if (!node || !simulateKeyboard) return
    node.style.setProperty('--keyboard-inset', '336px')
    node.toggleAttribute('data-keyboard-open', true)
    return () => {
      node.style.setProperty('--keyboard-inset', '0px')
      node.toggleAttribute('data-keyboard-open', false)
    }
  }, [node, simulateKeyboard, step])

  const setValue = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }))
  const onKey = (key: string) => {
    if (!activeSpec) return
    setValue(
      activeSpec.key,
      typeKey(values[activeSpec.key] ?? '', key, activeSpec.decimals),
    )
  }

  const stepped = kind === 'crypto'
  const fullScreen = direction === 'B'
  const title =
    kind === 'value'
      ? 'Mettre à jour « PEA »'
      : kind === 'account'
        ? 'Modifier le compte'
        : step === 1
          ? 'D’où viennent ces cryptos ?'
          : step === 2
            ? 'Quel actif ?'
            : `Combien de ${asset ?? 'BTC'} ?`
  const description =
    kind === 'value'
      ? 'Valeur du compte en fin de journée, d’après un relevé ou votre espace client.'
      : kind === 'account'
        ? 'Nom, banque et solde du compte.'
        : `Étape ${step} sur 3`
  const submitLabel = stepped ? 'Ajouter' : 'Enregistrer'
  const showSubmit = !stepped || step === 3

  const close = () => onOpenChange(false)
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    close()
  }
  const back = () => setStep((current) => Math.max(1, current - 1))

  const amountField = (spec: AmountSpec) => (
    <AmountInput
      key={spec.key}
      spec={spec}
      id={`${id}-${spec.key}`}
      values={values}
      setValue={setValue}
      keypad={keypad}
      active={active}
      setActive={setActive}
    />
  )
  const textField = (
    key: string,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <Field key={key}>
      <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
      <Input
        id={`${id}-${key}`}
        value={values[key] ?? ''}
        onChange={(event) => setValue(key, event.target.value)}
        // A typed field takes the keypad's place in C.
        onFocus={() => keypad && setActive(null)}
        {...props}
      />
    </Field>
  )

  const fields = (() => {
    if (kind === 'value')
      return (
        <>
          <Field>
            <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
            <Input
              id={`${id}-date`}
              type="date"
              max={TODAY}
              value={values.date ?? ''}
              onChange={(event) => setValue('date', event.target.value)}
            />
          </Field>
          {direction === 'now' ? (
            <Field>
              <FieldLabel htmlFor={`${id}-value`}>Valeur</FieldLabel>
              <Input
                ref={firstFieldRef}
                id={`${id}-value`}
                inputMode="decimal"
                autoComplete="off"
                placeholder="12 345,67"
                value={values.value ?? ''}
                onChange={(event) => setValue('value', event.target.value)}
              />
            </Field>
          ) : (
            VALUE_AMOUNTS.map(amountField)
          )}
          <Field>
            <FieldLabel htmlFor={`${id}-note`}>Note</FieldLabel>
            <Textarea
              id={`${id}-note`}
              rows={2}
              value={values.note ?? ''}
              onChange={(event) => setValue('note', event.target.value)}
              onFocus={() => keypad && setActive(null)}
            />
            <FieldDescription>
              Facultative, par ex. « relevé annuel ».
            </FieldDescription>
          </Field>
        </>
      )
    if (kind === 'account')
      return (
        <>
          {textField('name', 'Nom', { placeholder: 'Compte courant' })}
          {textField('institution', 'Banque', { placeholder: 'CIC' })}
          <Field>
            <FieldLabel htmlFor={`${id}-type`}>Type</FieldLabel>
            <NativeSelect id={`${id}-type`} defaultValue="checking">
              <NativeSelectOption value="checking">
                Compte courant
              </NativeSelectOption>
              <NativeSelectOption value="savings">Épargne</NativeSelectOption>
              <NativeSelectOption value="brokerage">PEA</NativeSelectOption>
            </NativeSelect>
          </Field>
          {textField('number', 'Fin du numéro', {
            placeholder: '1234',
            inputMode: 'numeric',
          })}
          {ACCOUNT_AMOUNTS.map(amountField)}
          <Field>
            <FieldLabel htmlFor={`${id}-on`}>Solde au</FieldLabel>
            <Input id={`${id}-on`} type="date" defaultValue={TODAY} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-note`}>Note</FieldLabel>
            <Textarea
              id={`${id}-note`}
              rows={3}
              value={values.note ?? ''}
              onChange={(event) => setValue('note', event.target.value)}
              onFocus={() => keypad && setActive(null)}
            />
          </Field>
        </>
      )
    if (step === 1)
      return (
        <ul className="space-y-2">
          {[
            [
              'Une plateforme',
              'Binance, Coinbase : vos exports',
              <LandmarkIcon key="p" />,
            ],
            [
              'Un wallet',
              'Ledger, Trezor, MetaMask : votre clé publique',
              <KeyRoundIcon key="w" />,
            ],
            [
              'Saisie manuelle',
              'L’actif et la quantité, à la main',
              <PencilIcon key="m" />,
            ],
          ].map(([label, detail, icon]) => (
            <li key={label as string}>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4"
                >
                  {icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{label}</span>
                  <span className="block text-muted-foreground">{detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )
    if (step === 2) {
      const shown = ASSETS.filter(([ticker, name]) =>
        `${ticker} ${name}`.toLowerCase().includes(search.trim().toLowerCase()),
      )
      return (
        <>
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Rechercher un actif"
              placeholder="Bitcoin, ETH…"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <ul className="divide-y">
            {shown.map(([ticker, name]) => (
              <li key={ticker}>
                <button
                  type="button"
                  onClick={() => {
                    setAsset(ticker)
                    setStep(3)
                  }}
                  className="flex min-h-11 w-full items-center gap-3 px-1 text-left"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[0.6rem] font-semibold">
                    {ticker}
                  </span>
                  <span className="flex-1">{name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )
    }
    return (
      <>
        {CRYPTO_AMOUNTS.map(amountField)}
        {textField('where', 'Où sont-elles ?', {
          placeholder: 'Crypto',
        })}
      </>
    )
  })()

  const scrollEnd = fullScreen
    ? // B: room to scroll the end out from under the keyboard.
      'group-data-keyboard-open/sheet:pb-[calc(var(--keyboard-inset,0px)+var(--keyboard-accessory,0px)+1rem)]'
    : ''

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={setNode}
        side="bottom"
        showCloseButton={!fullScreen}
        className={contentClass(direction, kind)}
        onOpenAutoFocus={(event) => {
          if (direction === 'now') {
            // Today: the value sheet focuses the value, the account sheet
            // lets Radix focus its first field, the stepped one its heading.
            if (kind === 'account') return
            event.preventDefault()
            if (kind === 'value') firstFieldRef.current?.focus()
            else headingRef.current?.focus()
            return
          }
          // A–D: no keyboard until a field is tapped.
          event.preventDefault()
          headingRef.current?.focus()
        }}
      >
        {fullScreen ? (
          <div className="flex min-h-12 shrink-0 items-center gap-1 border-b px-1">
            {stepped && step > 1 ? (
              <Button
                ghost
                variant="primary"
                className="min-h-11"
                iconStart={<ChevronLeftIcon />}
                onClick={back}
              >
                Retour
              </Button>
            ) : (
              <SheetClose asChild>
                <Button ghost variant="primary" className="min-h-11">
                  Annuler
                </Button>
              </SheetClose>
            )}
            <SheetTitle
              ref={headingRef}
              tabIndex={-1}
              className="min-w-0 flex-1 truncate text-center outline-none"
            >
              {kind === 'value'
                ? 'Valeur du PEA'
                : kind === 'account'
                  ? 'Compte'
                  : 'Ajouter des cryptos'}
            </SheetTitle>
            <Button
              type="submit"
              form={formId}
              ghost
              variant="primary"
              className={cn(
                'min-h-11 font-semibold',
                !showSubmit && 'invisible',
              )}
            >
              {submitLabel}
            </Button>
          </div>
        ) : (
          <SheetHeader>
            {stepped && step > 1 && (
              <Button
                ghost
                size="sm"
                variant="secondary"
                className="-ml-2 self-start"
                iconStart={<ChevronLeftIcon />}
                onClick={back}
              >
                Retour
              </Button>
            )}
            <SheetTitle
              ref={headingRef}
              tabIndex={-1}
              className="pr-10 outline-none"
            >
              {title}
            </SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
        )}
        <form
          id={formId}
          noValidate
          onSubmit={submit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div
            className={cn(
              'min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-1 pb-4',
              fullScreen && 'pt-4',
              scrollEnd,
            )}
          >
            {fullScreen && (
              <div>
                {stepped && <p className="font-medium">{title}</p>}
                <SheetDescription>{description}</SheetDescription>
              </div>
            )}
            {fields}
          </div>
          {keypad && activeSpec && (
            <div className="shrink-0 border-t bg-muted/40 px-3 pt-2 pb-1 group-data-keyboard-open/sheet:hidden">
              <Keypad onKey={onKey} />
            </div>
          )}
          {!fullScreen && showSubmit && (
            <div className="flex shrink-0 gap-2 border-t px-4 py-3">
              <Button
                type="submit"
                className="min-h-11 flex-1 font-medium"
                iconStart={<CheckIcon />}
              >
                {submitLabel}
              </Button>
            </div>
          )}
        </form>
        {simulateKeyboard && (
          <div
            aria-hidden
            className="fixed inset-x-0 bottom-0 z-[60] flex h-[336px] items-start justify-center bg-neutral-300 pt-3 text-xs text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
          >
            Clavier simulé (336 px)
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/* ---------------------------------------------------------------------------
 * The board: every sheet in every direction (Storybook and the phone page)
 * ------------------------------------------------------------------------ */

export function KeyboardSheetBoard() {
  const [opened, setOpened] = React.useState<{
    direction: Direction
    kind: PrototypeKind
  } | null>(null)
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-heading text-base font-medium">Les pistes</h2>
        <ul className="space-y-2 text-sm">
          {DIRECTIONS.map((direction) => (
            <li key={direction.id}>
              <span className="font-medium">{direction.name}</span>
              <span className="text-muted-foreground">
                {' '}
                · {direction.summary}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Ouvrez un panneau, puis touchez un champ : regardez si le panneau
          bouge une deuxième fois après l’arrivée du clavier.
        </p>
      </section>
      {KINDS.map((kind) => (
        <section
          key={kind.id}
          className="space-y-2 rounded-xl border bg-card p-4"
        >
          <h2 className="font-heading text-base font-medium">
            {kind.name}{' '}
            <span className="font-normal text-muted-foreground">
              · {kind.detail}
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-2 @md:grid-cols-5">
            {DIRECTIONS.map((direction) => (
              <Button
                key={direction.id}
                outline={direction.id !== 'now'}
                variant={direction.id === 'now' ? 'secondary' : 'primary'}
                className="min-h-11"
                onClick={() =>
                  setOpened({ direction: direction.id, kind: kind.id })
                }
              >
                {direction.name}
              </Button>
            ))}
          </div>
        </section>
      ))}
      <section className="space-y-2 text-sm text-muted-foreground">
        <p>
          Du contenu derrière les panneaux, pour voir la page bouger ou non.
        </p>
        {Array.from({ length: 12 }, (_, index) => (
          <p key={index} className="rounded-lg border p-3">
            <BitcoinIcon aria-hidden className="mr-2 inline size-4" />
            Ligne {index + 1} de la page derrière
          </p>
        ))}
      </section>
      {opened && (
        <KeyboardSheetPrototype
          key={`${opened.direction}-${opened.kind}`}
          direction={opened.direction}
          kind={opened.kind}
          open
          onOpenChange={(open) => !open && setOpened(null)}
        />
      )}
    </div>
  )
}
