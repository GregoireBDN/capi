import {
  Button,
  CategoryIcon,
  categoryIconComponent,
  cn,
  ConfirmDialog,
  Dialog,
  DialogContent,
  FieldError,
  Input,
  OptionGroup,
  OptionRow,
  SETTING_GROUP_CLASS,
  SettingRow,
  SettingSwitchRow,
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetContent,
  SheetSteps,
  Textarea,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { transactionsControllerUpdate } from '#/api'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  CalendarDaysIcon,
  ChartPieIcon,
  ChevronRightIcon,
  EuroIcon,
  FlagIcon,
  LockIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  SplitIcon,
  TagIcon,
  UserRoundIcon,
  UsersIcon,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  MoneyDirection,
  TransactionDto,
  TransactionKind,
  UpdateManualTransactionDto,
} from '#/api/types.gen'
import { ACCOUNT_TYPE_ICONS } from '#/components/accounts/labels'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { CategoryPicker } from '#/components/categories/CategoryPicker'
import type { CategoryHabit } from '#/components/categories/CategoryPicker'
import { ContactAvatar } from '#/components/owed/ContactAvatar'
import { MyPartFields, myPartCents } from '#/components/owed/PaidForMeSheet'
import { PeoplePicker, personRef } from '#/components/owed/PeoplePicker'
import type { Person } from '#/components/owed/PeoplePicker'
import {
  afterOwedChanged,
  contactsQuery,
  createDebt,
  owedErrorMessage,
  removeReceivable,
  replaceShares,
} from '#/components/owed/queries'
import {
  EMPTY_SHARE,
  ShareFields,
  shareValid,
  sharesOf,
} from '#/components/owed/ShareScreen'
import type { ShareDraft } from '#/components/owed/ShareScreen'
import type { TransactionChanges } from '#/components/transactions/changes'
import {
  displayLabel,
  KIND_LABELS,
  TRANSACTION_KINDS,
} from '#/components/transactions/labels'
import {
  detourTitle,
  EditDetourScreen,
  EditOptionRows,
} from '#/components/transactions/edit-options'
import type {
  EditDetour,
  TransactionEditActions,
} from '#/components/transactions/edit-options'
import { splitTransaction } from '#/components/transactions/edits'
import { FormSheetMoreActions } from '#/components/sheets/form-sheet'
import { isTextEntry } from '#/lib/text-entry'
import { currentDay } from '#/lib/calendar'
import { pickableCategories } from '#/lib/categories'
import { formatCalendarDate, formatCents } from '#/lib/money'
import {
  accountsQuery,
  ApiRequestError,
  categoriesQuery,
  isTransactional,
} from '#/lib/queries'
import {
  afterManualExpenseChanged,
  createManualExpense,
  deleteManualExpense,
  manualBody,
  manualExpenseErrorMessage,
  manualSuggestionsQuery,
  updateManualExpense,
  voucherDayQuery,
} from './queries'
import {
  MAX_AMOUNT_CENTS,
  amountKeyOf,
  pressAmountKey,
  typedAmount,
} from './amount-entry'
import type { AmountKey } from './amount-entry'
import { addDays, DayStrip } from './DayStrip'
import { AccountRows, VoucherDayGauge } from './manual-fields'

const LABEL_MAX = 255
const NOTE_MAX = 2000
/** How long a toast offering "Annuler" stays up. */
const UNDO_TOAST_MS = 8000

/** Error for the amount typed, or null when valid. */
export function expenseAmountError(text: string): string | null {
  if (text.trim() === '') return 'Indiquez un montant'
  const cents = parseEurosToCents(text)
  if (cents === null) return 'Montant invalide (ex. 12 ou 12,50)'
  if (cents <= 0) return 'Le montant doit être supérieur à 0'
  if (cents > MAX_AMOUNT_CENTS) return 'Montant trop élevé'
  return null
}

/** Links a transfer to the owner's other account (#296). */
async function linkCounterpart(id: string, counterpartAccountId: string) {
  const { data } = await transactionsControllerUpdate({
    path: { id },
    body: { counterpartAccountId },
    throwOnError: false,
  })
  if (!data) throw new Error('Le virement n’a pas pu être lié.')
}

/** Sign of the amount when the user did not choose one. */
function defaultDirection(kind: TransactionKind): MoneyDirection {
  return kind === 'income' ? 'in' : 'out'
}

/**
 * The steps (#398, the owner's direction): the same four whether adding or
 * editing, one decision per screen.
 */
const STEPS = ['category', 'amount', 'details', 'options'] as const
type Step = (typeof STEPS)[number]
const STEP_NAMES: Record<Step, string> = {
  category: 'Catégorie',
  amount: 'Montant',
  details: 'Détails',
  options: 'Options',
}

/** How long after a tap a blur counts as caused by it. */
const TAP_BLUR_MS = 600

/** Income category of the meal-voucher card's credits (#298). */
const MEAL_VOUCHER_CATEGORY_SLUG = 'meal_vouchers'

/** Meal vouchers pay at most 25 € a day (the legal cap, checked by the API). */
export const MEAL_VOUCHER_DAILY_CAP_CENTS = 2_500

/** Expense categories a meal-voucher card pays: « Payé avec » offers it. */
const VOUCHER_PAID_SLUGS: ReadonlySet<string> = new Set([
  'restaurants_cafes',
  'groceries',
])

/** A kind's icon, as on its tile (#396). */
const KIND_ICONS: Record<TransactionKind, LucideIcon> = {
  expense: ArrowUpRightIcon,
  income: ArrowDownLeftIcon,
  transfer: ArrowLeftRightIcon,
}

const TITLES: Record<TransactionKind, [add: string, edit: string]> = {
  expense: ['Ajouter une dépense', 'Modifier la dépense'],
  income: ['Ajouter un revenu', 'Modifier le revenu'],
  transfer: ['Ajouter un virement', 'Modifier le virement'],
}

/**
 * The screens adding an expense opens from its steps (#398), in the same
 * frame, ‹ back: who paid, who shares it, my part of what someone paid.
 */
type AddDetour = 'payer' | 'share' | 'mine'
const ADD_DETOURS: readonly string[] = ['payer', 'share', 'mine']
const isAddDetour = (detour: string): detour is AddDetour =>
  ADD_DETOURS.includes(detour)
const ADD_DETOUR_TITLES: Record<AddDetour, string> = {
  payer: 'Qui a payé ?',
  share: 'Partager',
  mine: 'Ma part',
}

/** The fields of the four steps, as the editor holds them. */
interface Fields {
  kind: TransactionKind
  direction: MoneyDirection
  amount: string
  categoryId: string
  date: string
  label: string
  accountId: string
  isOneOff: boolean
  needsReview: boolean
  note: string
}

/** A transaction's fields as the editor shows them. */
function fieldsOf(item: TransactionDto): Fields {
  return {
    kind: item.kind,
    direction: item.amountCents > 0 ? 'in' : 'out',
    amount: centsToInput(Math.abs(item.amountCents)),
    categoryId: item.categoryId ?? '',
    date: item.bookingDate,
    // A label left to its default (the category name) shows as empty; a
    // bank row's label is the bank's, never edited.
    label:
      item.manual && item.rawLabel !== item.category?.name ? item.rawLabel : '',
    accountId: item.accountId ?? '',
    isOneOff: item.isOneOff,
    needsReview: item.needsReview,
    note: item.note ?? '',
  }
}

interface ManualTransactionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Category preselected when adding (e.g. the envelope tapped). */
  initialCategoryId?: string
  /** Kind preselected when adding (default: expense). */
  initialKind?: TransactionKind
  /** Account preselected when adding (default: the first checking one). */
  initialAccountId?: string
  /** Categories listed first (the envelopes followed this month). */
  suggestedCategoryIds?: readonly string[]
  /**
   * The transaction to edit, a bank row or one entered by hand; absent
   * when adding one. Needs `actions`.
   */
  item?: TransactionDto
  /** What an edit applies, bound to `item` by its row. */
  actions?: TransactionEditActions
  /**
   * « Classer » (#322): an edit opens on « Catégorie » and a tap saves it.
   * Without it, an edit opens on « Options », or on « Catégorie » for a
   * transaction without one.
   */
  startOnCategory?: boolean
}

/**
 * Adds a transaction, or edits one, in the same four steps (#398, the
 * owner's direction): « Catégorie » (the kind tiles and the categories,
 * #396), « Montant », « Détails » (the day on a strip, the account), then
 * « Options » (the label, « Partage », one-off, the note). Adding moves on
 * with « Suivant » and adds on the last step; an envelope starts at the
 * amount.
 *
 * An edit opens on « Options », every step a tap away, and saves what
 * changed with ✓ (greyed out until then), with « Annuler » in its toast.
 * Its « Options » also hold what only an existing transaction has (split,
 * share, repayment, prepaid, its transfer's other account, « À revoir »),
 * each on its own screen applied at once. A bank row's amount and day are
 * corrected (#74: the bank values kept, « Rétablir »), its label and
 * account stay the bank's; one entered by hand is edited in full and can
 * be deleted. The import of the bank export replaces a manual entry with
 * the matching bank row.
 *
 * On phones a page of its own (#385): the round bar on top (✕ or ‹, the
 * steps, › then ✓), the amount typed with the phone's decimal keyboard.
 * Elsewhere a dialog: the amount is typed in its field, Enter moves on,
 * then saves.
 */
export function ManualTransactionSheet({
  open,
  onOpenChange,
  initialCategoryId,
  initialKind = 'expense',
  initialAccountId,
  suggestedCategoryIds = [],
  item,
  actions,
  startOnCategory = false,
}: ManualTransactionSheetProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const categories = useQuery({ ...categoriesQuery, enabled: open })
  const accounts = useQuery({ ...accountsQuery, enabled: open })
  const editing = item !== undefined
  const bank = item !== undefined && !item.manual
  const split = (item?.splits.length ?? 0) > 0
  // « Payé pour moi » (#359): a contact paid, no account of the owner's.
  const paidBy = item?.paidByContactName ?? null

  const [kind, setKind] = useState<TransactionKind>(initialKind)
  const [direction, setDirection] = useState<MoneyDirection>(
    defaultDirection(initialKind),
  )
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState('')
  const [label, setLabel] = useState('')
  const [accountId, setAccountId] = useState('')
  const [isOneOff, setIsOneOff] = useState(false)
  const [needsReview, setNeedsReview] = useState(false)
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [step, setStep] = useState<Step>('category')
  /** The day strip's month is open: the details hide their recap. */
  const [pickingDay, setPickingDay] = useState(false)
  // The strip closes its month when the step changes.
  useEffect(() => setPickingDay(false), [step])
  const [detour, setDetour] = useState<EditDetour | AddDetour | null>(null)
  /**
   * Adding an expense (#398): who paid when it was not the owner (« Payé
   * pour moi »: he owes his part), else who shares it with him.
   */
  const [payer, setPayer] = useState<Person | null>(null)
  const [share, setShare] = useState<ShareDraft>(EMPTY_SHARE)
  /** « Ma part » of what someone else paid: how many we were, or typed. */
  const [partPeople, setPartPeople] = useState<number | null>(2)
  const [partTyped, setPartTyped] = useState('')
  /** The rows a transfer just added made (its undo deletes them). */
  const transferSides = useRef<string[]>([])
  /** Adding a transfer (#398): the account it goes to (« Vers »). */
  const [toAccountId, setToAccountId] = useState('')
  /** Opened by « Classer » and still on its categories: a tap saves. */
  const [quickFile, setQuickFile] = useState(false)
  /** The fields as the edit opened: what ✓ compares with. */
  const [was, setWas] = useState<Fields | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const stepRef = useRef<HTMLHeadingElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  /** The last tap in the sheet: a blur it caused is not a keyboard's ✓. */
  const lastTap = useRef<{ target: Element; at: number } | null>(null)
  const today = currentDay()
  // Adding an expense: the people it can be shared with, or who paid it.
  const contacts = useQuery({
    ...contactsQuery(),
    enabled: open && !editing,
  })
  const suggestions = useQuery({
    ...manualSuggestionsQuery(kind),
    enabled: open,
  })

  const kindCategories = useMemo(() => {
    const all = pickableCategories(
      categories.data ?? [],
      item?.categoryId,
    ).filter((category) => category.kind === kind)
    // The envelopes first, then the kind's most used, then by name.
    const ordered = [
      ...suggestedCategoryIds,
      ...(suggestions.data?.categoryIds ?? []),
    ]
    const rank = (categoryKey: string) => {
      const index = ordered.indexOf(categoryKey)
      return index === -1 ? ordered.length : index
    }
    return [...all].sort(
      (a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'fr'),
    )
  }, [
    categories.data,
    item?.categoryId,
    suggestedCategoryIds,
    suggestions.data?.categoryIds,
    kind,
  ])

  // A new expense gets the category most used for the kind (else the first
  // listed), once the most used are known or failed to load.
  const defaultCategoryId = useMemo(() => {
    if (suggestions.isPending || kindCategories.length === 0) return null
    const mostUsed = suggestions.data?.categoryIds.find((categoryKey) =>
      kindCategories.some((category) => category.id === categoryKey),
    )
    return mostUsed ?? kindCategories[0].id
  }, [suggestions.isPending, suggestions.data, kindCategories])

  const cashAccounts = useMemo(
    () =>
      (accounts.data ?? []).filter(
        (account) =>
          isTransactional(account) &&
          (!account.archivedAt || account.id === item?.accountId),
      ),
    [accounts.data, item?.accountId],
  )

  // Fresh form on every opening.
  useEffect(() => {
    if (!open) return
    const start: Fields = item
      ? fieldsOf(item)
      : {
          kind: initialKind,
          direction: defaultDirection(initialKind),
          amount: '',
          categoryId: initialCategoryId ?? '',
          date: currentDay(),
          label: '',
          accountId: initialAccountId ?? '',
          isOneOff: false,
          needsReview: false,
          note: '',
        }
    setWas(item ? start : null)
    setKind(start.kind)
    setDirection(start.direction)
    setAmount(start.amount)
    setCategoryId(start.categoryId)
    setDate(start.date)
    setLabel(start.label)
    setAccountId(start.accountId)
    setIsOneOff(start.isOneOff)
    setNeedsReview(start.needsReview)
    setNote(start.note)
    // An envelope already says the category; an edit opens on its options,
    // or on its categories when it has none yet (the owner's request).
    setStep(
      item
        ? startOnCategory ||
          (item.categoryId === null && item.splits.length === 0)
          ? 'category'
          : 'options'
        : initialCategoryId
          ? 'amount'
          : 'category',
    )
    setDetour(null)
    setPayer(null)
    setShare(EMPTY_SHARE)
    setPartPeople(2)
    setPartTyped('')
    setToAccountId('')
    setPickingDay(false)
    setQuickFile(Boolean(item) && startOnCategory)
    setSubmitted(false)
    // Only on opening: an edit applied by a detour must not reset the form.
  }, [open])

  // A new expense needs a category: the most used one by default.
  // Other kinds may stay without one (the review queue). Functional updates:
  // the reset above may have set a value in the same commit, which must win.
  useEffect(() => {
    if (!open || editing || kind !== 'expense' || defaultCategoryId === null)
      return
    setCategoryId((current) => current || defaultCategoryId)
  }, [open, editing, kind, defaultCategoryId])
  useEffect(() => {
    if (!open || editing || cashAccounts.length === 0) return
    const preferred =
      cashAccounts.find((account) => account.type === 'checking') ??
      cashAccounts[0]
    setAccountId((current) => current || preferred.id)
  }, [open, editing, cashAccounts])

  function changeKind(next: TransactionKind) {
    setKind(next)
    // An edit keeps its sign (a bank row's is the bank's).
    if (!editing) setDirection(defaultDirection(next))
    // A category of another kind no longer fits.
    setCategoryId((current) =>
      categories.data?.find((category) => category.id === current)?.kind ===
      next
        ? current
        : '',
    )
  }

  // A new expense needs a category; other kinds may go to the review
  // queue, and an edit may leave its category (« Sans catégorie, à revoir »).
  const allowNoCategory = kind !== 'expense' || editing

  const categoryOf = (categoryKey: string) =>
    kindCategories.find((category) => category.id === categoryKey)

  // The meal-voucher card (#298): its credit goes on it at once, and the
  // categories it pays offer it.
  const voucherAccounts = cashAccounts.filter(
    (account) => account.type === 'meal_voucher' && !account.archivedAt,
  )
  function chooseAccountFor(categoryKey: string) {
    if (editing || voucherAccounts.length === 0) return
    if (categoryOf(categoryKey)?.slug === MEAL_VOUCHER_CATEGORY_SLUG) {
      setAccountId(voucherAccounts[0].id)
    }
  }

  // A usual label fills its category too, and moves on to the amount when
  // that leaves a category (or the kind may go without one).
  function pickSuggestion(habit: CategoryHabit) {
    setLabel(habit.label)
    const usual =
      habit.categoryId &&
      kindCategories.some((category) => category.id === habit.categoryId)
        ? habit.categoryId
        : null
    if (usual) {
      setCategoryId(usual)
      chooseAccountFor(usual)
    }
    if (usual || categoryId || allowNoCategory) setStep('amount')
  }

  const chosenAccount = cashAccounts.find((option) => option.id === accountId)
  const chosenSlug = categoryOf(categoryId)?.slug
  // The card only where it pays (or already chosen).
  const voucherFits =
    kind !== 'transfer' &&
    chosenSlug !== undefined &&
    (kind === 'expense'
      ? VOUCHER_PAID_SLUGS.has(chosenSlug)
      : chosenSlug === MEAL_VOUCHER_CATEGORY_SLUG)
  const accountChoices = cashAccounts.filter(
    (account) =>
      account.type !== 'meal_voucher' ||
      account.id === accountId ||
      voucherFits,
  )

  const amountError = expenseAmountError(amount)
  const dateError =
    date === ''
      ? 'Indiquez une date'
      : date > today
        ? 'La date ne peut pas être dans le futur'
        : null
  // A payment with the card (#298): what it can still pay that day under
  // the 25 € cap (the day's other payments counted, this one's previous
  // version left out), shown while the amount is typed and refused over it.
  const onVoucher =
    chosenAccount?.type === 'meal_voucher' &&
    kind === 'expense' &&
    direction === 'out'
  const voucherDayKey = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today
  const voucherDay = useQuery({
    ...voucherDayQuery(accountId, voucherDayKey),
    enabled: open && onVoucher,
  })
  const voucherPaid = (voucherDay.data ?? [])
    .filter((payment) => payment.id !== item?.id)
    .reduce((total, payment) => total + payment.cents, 0)
  const voucherLeft = Math.max(0, MEAL_VOUCHER_DAILY_CAP_CENTS - voucherPaid)
  const voucherWhen =
    voucherDayKey === today
      ? 'aujourd’hui'
      : voucherDayKey === addDays(today, -1)
        ? 'hier'
        : `le ${formatCalendarDate(voucherDayKey)}`
  const typedCents = parseEurosToCents(amount) ?? 0
  // Sharing while adding (#398): only an expense paid out.
  const canShare = !editing && kind === 'expense' && direction === 'out'
  const paidByOther = canShare && payer !== null
  const sharing = canShare && !paidByOther && share.people.length > 0
  const myPart = myPartCents(typedCents, partPeople, partTyped)
  const shareError = paidByOther
    ? myPart <= 0 || myPart > typedCents
    : sharing && !shareValid(share, typedCents)
  // A transfer between the owner's accounts (#398, the owner's request):
  // « Depuis » one of his cash accounts, « Vers » any other open one.
  const transferAdd = !editing && kind === 'transfer'
  const toChoices = (accounts.data ?? []).filter(
    (account) =>
      !account.archivedAt &&
      account.type !== 'crypto' &&
      account.type !== 'meal_voucher' &&
      account.id !== accountId,
  )
  const toAccount = toChoices.find((account) => account.id === toAccountId)
  const fromAccount = cashAccounts.find((account) => account.id === accountId)
  /** Who shares it, said on its row (« Camille, Sam »). */
  const sharedNames = share.people.map((person) => person.name).join(', ')
  // Over what is left: « Ajouter » is greyed out and the gauge says why.
  const voucherOver = onVoucher && typedCents > voucherLeft
  const voucherGauge = onVoucher && voucherDay.isSuccess && (
    <VoucherDayGauge
      capCents={MEAL_VOUCHER_DAILY_CAP_CENTS}
      paidCents={voucherPaid}
      amountCents={typedCents}
      when={voucherWhen}
    />
  )
  const labelError =
    !bank && !categoryId && label.trim() === ''
      ? 'Sans catégorie, indiquez un libellé'
      : null

  // A bank row (#398): the bank's amount and day, never changed here.

  function undoToast(message: string, undo: () => Promise<unknown>) {
    toast.success(message, {
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Annuler',
        onClick: () =>
          void undo()
            .then(() => afterManualExpenseChanged(queryClient))
            .catch(() => toast.error('Impossible d’annuler la modification.')),
      },
    })
  }

  const create = useMutation({
    mutationFn: async () => {
      const amountCents = parseEurosToCents(amount)!
      // Someone else paid (#398): the owner's part, owed to them, without
      // an account (« Payé pour moi », #359).
      if (paidByOther) {
        const created = await createDebt({
          ...personRef(payer),
          billCents: amountCents,
          partCents: myPart,
          categoryId,
          bookingDate: date,
          ...(label.trim() ? { label: label.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        })
        if (isOneOff) await updateManualExpense(created.id, { isOneOff })
        return created
      }
      // A transfer (#398): out of « Depuis », linked to « Vers »; and when
      // « Vers » is a cash account too, its own side, coming in, linked
      // back, so both balances move (each replaced by its bank row later).
      if (transferAdd) {
        const common = {
          amountCents,
          kind,
          categoryId: categoryId || null,
          bookingDate: date,
          label: label.trim() || null,
          isOneOff,
          note: note.trim() || null,
        }
        const out = await createManualExpense({
          ...common,
          direction: 'out',
          accountId,
        })
        await linkCounterpart(out.id, toAccountId)
        if (toAccount && isTransactional(toAccount)) {
          const back = await createManualExpense({
            ...common,
            direction: 'in',
            accountId: toAccountId,
          })
          await linkCounterpart(back.id, accountId)
          transferSides.current = [out.id, back.id]
        } else {
          transferSides.current = [out.id]
        }
        return out
      }
      const created = await createManualExpense({
        amountCents,
        kind,
        direction,
        categoryId: categoryId || null,
        bookingDate: date,
        label: label.trim() || null,
        accountId,
        isOneOff,
        note: note.trim() || null,
      })
      // Shared: who owes the owner what, on the expense just made.
      if (sharing) {
        await replaceShares(created.id, {
          shares: sharesOf(share, amountCents),
        })
      }
      return created
    },
    onSuccess: async (saved) => {
      onOpenChange(false)
      if (transferAdd) {
        const sides = transferSides.current
        undoToast(
          `Virement ajouté : ${formatCents(Math.abs(saved.amountCents))} de ${fromAccount?.name ?? '…'} vers ${toAccount?.name ?? '…'}`,
          () => Promise.all(sides.map((side) => deleteManualExpense(side))),
        )
      } else if (paidByOther) {
        const debt = saved.shares.find((s) => s.direction === 'i_owe')
        // Removing what the owner owes removes its expense too.
        undoToast(`Vous devez ${formatCents(myPart)} à ${payer.name}`, () =>
          debt ? removeReceivable(debt.id) : deleteManualExpense(saved.id),
        )
      } else {
        undoToast(
          `Opération ajoutée : ${formatCents(saved.amountCents)}${
            saved.category ? ` en ${saved.category.name}` : ''
          }${sharing ? `, partagée avec ${sharedNames}` : ''}`,
          async () => {
            if (sharing) await replaceShares(saved.id, { shares: [] })
            await deleteManualExpense(saved.id)
          },
        )
      }
      await afterManualExpenseChanged(queryClient)
      if (paidByOther || sharing) await afterOwedChanged(queryClient)
    },
    onError: (error) => {
      // Over the card's daily cap (another payment of the day entered
      // elsewhere): refreshed, the day's total shows the error in place.
      if (
        error instanceof ApiRequestError &&
        error.apiMessage?.includes('capped at 25')
      ) {
        void voucherDay.refetch()
        return
      }
      toast.error(
        paidByOther || sharing
          ? owedErrorMessage(error)
          : manualExpenseErrorMessage(error),
      )
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteManualExpense(item!.id),
    onSuccess: async () => {
      const previous = item!
      undoToast('Opération supprimée', async () => {
        // Back with a new id, and its split if it had one.
        const created = await createManualExpense(manualBody(previous))
        if (previous.splits.length > 0) {
          await splitTransaction(created.id, previous.splits)
        }
      })
      setConfirmOpen(false)
      onOpenChange(false)
      await afterManualExpenseChanged(queryClient)
    },
    onError: (error) => toast.error(manualExpenseErrorMessage(error)),
  })

  const fields: Fields = {
    kind,
    direction,
    amount,
    categoryId,
    date,
    label,
    accountId,
    isOneOff,
    needsReview,
    note,
  }
  const changed = (key: keyof Fields) =>
    was !== null && fields[key] !== was[key]
  const amountChanged =
    was !== null &&
    (parseEurosToCents(amount) !== parseEurosToCents(was.amount) ||
      direction !== was.direction)
  const dirty =
    was !== null &&
    (amountChanged ||
      (['kind', 'categoryId', 'date', 'label', 'accountId'] as const).some(
        changed,
      ) ||
      isOneOff !== was.isOneOff ||
      needsReview !== was.needsReview ||
      note.trim() !== was.note.trim())
  const [saving, setSaving] = useState(false)

  /** ✓ of an edit: what changed, through the row's actions. */
  async function saveEdit() {
    if (!item || !actions || !was) return
    const reviewChange: TransactionChanges = {}
    if (needsReview !== was.needsReview) reviewChange.needsReview = needsReview
    if (item.manual) {
      const body: UpdateManualTransactionDto = {}
      if (amountChanged) {
        body.amountCents = parseEurosToCents(amount)!
        body.direction = direction
      }
      if (changed('kind')) body.kind = kind
      if (changed('categoryId')) body.categoryId = categoryId || null
      if (changed('date')) body.bookingDate = date
      if (changed('label')) body.label = label.trim() || null
      if (changed('accountId') && !paidBy) body.accountId = accountId
      if (isOneOff !== was.isOneOff) body.isOneOff = isOneOff
      if (note.trim() !== was.note.trim()) body.note = note.trim() || null
      setSaving(true)
      const saved =
        Object.keys(body).length === 0 || (await actions.onUpdateManual(body))
      setSaving(false)
      if (!saved) return
      if (reviewChange.needsReview !== undefined) actions.onChange(reviewChange)
      onOpenChange(false)
      return
    }
    // A bank row: its category, flags and note only; its amount and day
    // are the bank's (#398, refused by the API and the database).
    const changes: TransactionChanges = { ...reviewChange }
    if (changed('categoryId')) {
      changes.categoryId = categoryId || null
      // « Sans catégorie »: the kind chosen with its tile (#368).
      if (!categoryId) changes.kind = kind
    } else if (!categoryId && changed('kind')) {
      changes.kind = kind
    }
    if (isOneOff !== was.isOneOff) changes.isOneOff = isOneOff
    if (note.trim() !== was.note.trim()) changes.note = note.trim()
    if (Object.keys(changes).length > 0) actions.onChange(changes)
    onOpenChange(false)
  }

  const formError =
    amountError ??
    dateError ??
    labelError ??
    (voucherOver ? 'over' : null) ??
    (!bank && !paidBy && !paidByOther && !accountId ? 'account' : null) ??
    (shareError ? 'share' : null) ??
    (transferAdd && !toAccountId ? 'to' : null)

  // "Suivant" (and Enter) moves on; the last step adds, back
  // to the first step that still lacks something. An edit saves anywhere.
  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (detour) return
    if (!editing && step === 'category') {
      if (categoryId || allowNoCategory) setStep('amount')
      return
    }
    if (!editing && step === 'amount') {
      if (amountError) setSubmitted(true)
      else setStep('details')
      return
    }
    // « Suivant » from the details to the options (the owner's request):
    // only the last step adds.
    if (!editing && step === 'details') {
      if (dateError || (transferAdd && !toAccountId)) setSubmitted(true)
      else setStep('options')
      return
    }
    setSubmitted(true)
    if (kind === 'expense' && !categoryId && !editing)
      return setStep('category')
    if (amountError) return setStep('amount')
    if (dateError) return setStep('details')
    if (labelError) return setStep('options')
    if (shareError) return setStep('options')
    if (formError) return
    if (editing) {
      if (dirty) void saveEdit()
      return
    }
    create.mutate()
  }

  const showAmountError = submitted && amountError !== null
  const showDateError = submitted && dateError !== null
  const showLabelError = submitted && labelError !== null
  const noAccount = accounts.isSuccess && cashAccounts.length === 0
  const [addTitle, editTitle] = TITLES[kind]
  const title = editing ? (bank ? 'Modifier l’opération' : editTitle) : addTitle

  const sign = direction === 'in' ? '+' : '−'
  const chosenCategory = categoryOf(categoryId)
  /** What the sign means, when it is not the kind's own (or a transfer). */
  const signHint = transferAdd
    ? fromAccount && toAccount
      ? `De ${fromAccount.name} vers ${toAccount.name}`
      : 'D’un compte à l’autre : les deux se choisissent dans les détails'
    : kind === 'transfer'
      ? direction === 'in'
        ? 'Entre sur le compte'
        : 'Sort du compte'
      : direction !== defaultDirection(kind)
        ? kind === 'expense'
          ? `Un remboursement : déduit de ${chosenCategory?.name ?? 'ses dépenses'}`
          : `Un revenu rendu : déduit de ${chosenCategory?.name ?? 'ses revenus'}`
        : null
  const categoryText = split
    ? [...new Set(item!.splits.map((part) => part.category.name))].join(', ')
    : (chosenCategory?.name ?? (allowNoCategory ? 'Sans catégorie' : null))
  const shownLabel = bank ? displayLabel(item) : label.trim() || null
  const amountText = transferAdd
    ? `${amount || '0'} €`
    : `${sign} ${amount || '0'} €`
  /**
   * The steps shown: all four, but a bank row's amount and day are the
   * bank's (#398), so it has only « Catégorie » and « Options »: nothing
   * greyed out on the line that would look like a step to open.
   */
  const shownSteps: readonly Step[] = bank ? ['category', 'options'] : STEPS
  const stepIndex = shownSteps.indexOf(step)
  const categoryChosen = Boolean(categoryId) || allowNoCategory

  // Each step starts on its heading (read out by screen readers), the
  // amount step on its field, so typing goes straight to it.
  function focusStep() {
    if (step === 'amount' && !split) {
      amountRef.current?.focus({ preventScroll: true })
    } else {
      stepRef.current?.focus({ preventScroll: true })
    }
  }
  // On a step change, right in the commit that shows it: a later frame
  // could take the focus from a field the user already taps or types in.
  // The opening is focused by the sheet or dialog (its content mounts a
  // render later).
  useEffect(() => {
    if (!open) return
    focusStep()
  }, [open, step, detour])

  function press(key: AmountKey) {
    setAmount((current) => pressAmountKey(current, key))
  }

  function chooseCategory(next: string) {
    // « Classer » (#322): the category is the whole edit, saved at once.
    if (item && actions && was && quickFile) {
      if (next !== was.categoryId) {
        actions.onChange(
          next ? { categoryId: next } : { categoryId: null, kind },
        )
      }
      onOpenChange(false)
      return
    }
    setCategoryId(next)
    chooseAccountFor(next)
    // Adding moves on; an edit goes back to its options.
    setStep(editing ? 'options' : 'amount')
  }

  // On the amount step, digits typed anywhere go to the amount; Enter moves
  // on (or saves); never while typing in a field.
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target as Element
    if (isTextEntry(target) || target instanceof HTMLSelectElement) return
    const key = step === 'amount' && !split ? amountKeyOf(event.key) : null
    if (key) {
      event.preventDefault()
      press(key)
    } else if (
      event.key === 'Enter' &&
      !(target instanceof HTMLButtonElement)
    ) {
      event.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  const CategoryGlyph = categoryIconComponent(chosenCategory?.icon ?? null)
  const nextDisabled =
    (step === 'category' && !categoryChosen) ||
    // Over the card's cap: the gauge says why (#298).
    (step === 'details' && (voucherOver || (transferAdd && !toAccountId)))
  // ✓ is greyed out only for what it can't show (the card's cap is shown in
  // place, a missing account or category is chosen on its step); any other
  // error takes the user to its step on ✓.
  const saveDisabled = editing
    ? !dirty || voucherOver || saving
    : (kind === 'expense' && !categoryId) ||
      voucherOver ||
      (!accountId && !paidByOther)
  // Adding: › up to the amount, then ✓ (« Options » is never required).
  // Adding: › on every step, ✓ « Ajouter » on the last one only.
  const saves = editing || step === 'options'

  /** What the earlier steps chose, at the top of the later ones. */
  const recap = (withDay: boolean) => (
    <p className="text-muted-foreground flex min-w-0 items-center justify-center gap-1.5 text-sm">
      {chosenCategory && !split && (
        <CategoryIcon
          icon={chosenCategory.icon}
          color={chosenCategory.color}
          size="sm"
        />
      )}
      <span className="truncate">
        {[
          categoryText,
          shownLabel,
          paidByOther ? `payé par ${payer.name}` : null,
          withDay && date ? formatCalendarDate(date) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </p>
  )
  const recapBlock = (withDay: boolean) => (
    <div className="text-center">
      <p
        className={cn(
          'text-2xl font-semibold tabular-nums',
          showAmountError && 'text-destructive',
        )}
      >
        {amountText}
      </p>
      {recap(withDay)}
    </div>
  )

  /**
   * A bank row keeps the bank's amount and day (#398): its « Montant » and
   * « Détails » steps are greyed out, the recap says both. One corrected
   * before keeps « Rétablir les valeurs de la banque » in its options.
   */
  const legacyCorrected =
    bank &&
    (item.originalAmountCents !== null || item.originalBookingDate !== null)

  const steps = (
    <SheetSteps
      current={step}
      onSelect={(key) => {
        setQuickFile(false)
        setStep(key as Step)
      }}
      steps={[
        // Once chosen, the category's own icon in its colour.
        split
          ? {
              key: 'category',
              label: 'Répartie',
              icon: <SplitIcon aria-hidden />,
            }
          : chosenCategory
            ? {
                key: 'category',
                label: chosenCategory.name,
                icon: <CategoryGlyph aria-hidden />,
                color: chosenCategory.color,
              }
            : {
                key: 'category',
                label: STEP_NAMES.category,
                icon: <TagIcon aria-hidden />,
              },
        {
          key: 'amount',
          label: STEP_NAMES.amount,
          icon: <EuroIcon aria-hidden />,
          disabled: !categoryChosen,
        },
        {
          key: 'details',
          label: STEP_NAMES.details,
          icon: <CalendarDaysIcon aria-hidden />,
          disabled: !categoryChosen || amountError !== null,
        },
        {
          key: 'options',
          label: STEP_NAMES.options,
          icon: <SlidersHorizontalIcon aria-hidden />,
          disabled: !categoryChosen || amountError !== null,
        },
      ].filter((shown) => shownSteps.includes(shown.key as Step))}
    />
  )

  const bar = detour ? (
    <SheetBar
      titleRef={stepRef}
      title={
        isAddDetour(detour)
          ? ADD_DETOUR_TITLES[detour]
          : detourTitle(detour, item!)
      }
      onBack={() => setDetour(null)}
      backLabel={
        detour === 'payer' ? 'Retour aux détails' : 'Retour aux options'
      }
    />
  ) : (
    <SheetBar
      titleRef={stepRef}
      title={title}
      description={`Étape ${stepIndex + 1} sur ${shownSteps.length} : ${STEP_NAMES[step]}`}
      steps={steps}
      onBack={
        !editing && stepIndex > 0
          ? () => setStep(shownSteps[stepIndex - 1])
          : undefined
      }
      action={
        <SheetBarAction
          type="submit"
          label={saves ? (editing ? 'Enregistrer' : 'Ajouter') : 'Suivant'}
          icon={
            saves ? undefined : (
              <ChevronRightIcon aria-hidden strokeWidth={2.6} />
            )
          }
          loading={saves && (create.isPending || saving)}
          disabled={saves ? saveDisabled : nextDisabled}
        />
      }
    />
  )

  /** « Payé avec », « Crédité sur » or « Compte ». */
  const accountTitle =
    kind === 'expense'
      ? canShare
        ? 'Payé par'
        : 'Payé avec'
      : kind === 'income'
        ? 'Crédité sur'
        : transferAdd
          ? 'Depuis'
          : 'Compte'
  /** One account shown, not chosen: a bank row's, or who paid. */
  function fixedAccount() {
    if (paidBy) {
      return (
        <div className="bg-muted/40 flex min-h-[52px] items-center gap-3 rounded-md px-4">
          <span className="bg-muted text-muted-foreground flex size-[36px] shrink-0 items-center justify-center rounded-full">
            <UserRoundIcon aria-hidden className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[16px]">
            Payé par {paidBy}
          </span>
        </div>
      )
    }
    const account = (accounts.data ?? []).find(
      (option) => option.id === item?.accountId,
    )
    const icon = account ? ACCOUNT_TYPE_ICONS[account.type] : null
    return (
      <div className="bg-muted/40 flex min-h-[52px] items-center gap-3 rounded-md px-4 py-1.5">
        {icon && (
          <span
            className={cn(
              'flex size-[36px] shrink-0 items-center justify-center rounded-full',
              icon.className,
            )}
          >
            <icon.icon aria-hidden className="size-[18px]" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px]">
            {account?.name ?? item?.accountName ?? 'Compte'}
          </span>
          <span className="text-muted-foreground block text-[13px]">
            Le compte de la banque
          </span>
        </span>
      </div>
    )
  }

  const form = (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      className="flex min-h-0 flex-1 flex-col"
    >
      {bar}

      {detour && isAddDetour(detour) && (
        <div
          data-sheet-scroll=""
          className="@container min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-3 pb-6"
        >
          {detour === 'payer' && (
            <PeoplePicker
              single
              label="Qui a payé ?"
              contacts={contacts.data ?? []}
              chosen={payer ? [payer] : []}
              onPick={(person) => {
                setPayer(person)
                setDetour(null)
              }}
            />
          )}
          {detour === 'share' && (
            <ShareFields
              totalCents={typedCents}
              draft={share}
              onChange={setShare}
              contacts={contacts.data ?? []}
            />
          )}
          {detour === 'mine' && payer && (
            <>
              <p className="text-muted-foreground text-center text-sm">
                Addition de {formatCents(typedCents)} payée par {payer.name}
              </p>
              <MyPartFields
                billCents={typedCents}
                people={partPeople}
                onPeopleChange={setPartPeople}
                typed={partTyped}
                onTypedChange={setPartTyped}
              />
              <div
                aria-live="polite"
                className={cn(
                  'flex min-h-11 items-center justify-between gap-3 rounded-md px-3',
                  myPart > typedCents ? 'bg-destructive/10' : 'bg-muted/60',
                )}
              >
                <span className="font-semibold break-normal">
                  Je dois à {payer.name}
                </span>
                <span
                  className={cn(
                    'font-semibold whitespace-nowrap tabular-nums',
                    myPart > typedCents && 'text-destructive',
                  )}
                >
                  {myPart > typedCents
                    ? 'plus que l’addition'
                    : formatCents(myPart)}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {detour && !isAddDetour(detour) && item && actions && (
        <div
          data-sheet-scroll=""
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-3 pb-6"
        >
          <EditDetourScreen
            detour={detour}
            item={item}
            categories={categories.data ?? []}
            actions={actions}
            onDone={() => setDetour(null)}
          />
        </div>
      )}

      {!detour && step === 'category' && split && (
        // A split's categories are its parts' (#74): changed on its screen.
        <div
          data-sheet-scroll=""
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pt-4 pb-6"
        >
          <p className="text-sm">
            Répartie entre {categoryText}. Ses catégories se changent dans la
            répartition.
          </p>
          <div className="bg-muted/40 overflow-hidden rounded-md">
            <OptionRow
              role="button"
              leading={<SplitIcon aria-hidden className="size-[18px]" />}
              label="Modifier la répartition"
              onClick={() => setDetour('split')}
            />
          </div>
        </div>
      )}

      {!detour && step === 'category' && !split && (
        <CategoryPicker
          categories={categories.data ?? []}
          value={categoryId || null}
          onPick={chooseCategory}
          // The kind is chosen before adding (#398): its categories only.
          kinds={[kind]}
          kind={kind}
          footer={
            editing && (
              <OptionGroup title="Un autre type">
                {TRANSACTION_KINDS.filter((other) => other !== kind).map(
                  (other) => {
                    const Icon = KIND_ICONS[other]
                    return (
                      <OptionRow
                        key={other}
                        role="button"
                        leading={
                          <span className="bg-muted text-muted-foreground flex size-[36px] shrink-0 items-center justify-center rounded-full">
                            <Icon aria-hidden className="size-[18px]" />
                          </span>
                        }
                        label={`Classer en ${KIND_LABELS[other].toLowerCase()}`}
                        detail="Ses catégories, ou sans catégorie"
                        onClick={() => changeKind(other)}
                      />
                    )
                  },
                )}
              </OptionGroup>
            )
          }
          habits={editing ? [] : (suggestions.data?.items ?? [])}
          habitChosen={label}
          onPickHabit={pickSuggestion}
          preferred={suggestedCategoryIds}
          none={
            allowNoCategory
              ? {
                  label: editing
                    ? 'Sans catégorie, à revoir'
                    : 'Sans catégorie',
                  detail: editing ? undefined : 'À classer plus tard',
                  selected: categoryId === '',
                  onPick: () => chooseCategory(''),
                }
              : undefined
          }
        />
      )}

      {!detour && step === 'amount' && (
        // The one focal point: the amount; at the top on a phone, above
        // the keyboard.
        <div className="@container flex flex-1 flex-col justify-center px-4 pt-2 pb-5 text-center group-data-[side=screen]/sheet:justify-start group-data-[side=screen]/sheet:pt-8">
          {recap(false)}
          <label htmlFor={`${id}-amount`} className="sr-only">
            Montant
          </label>
          <div
            className={cn(
              'flex items-baseline justify-center gap-[0.2em] py-2 leading-tight font-semibold tabular-nums',
              'text-[min(2.75rem,14cqi)]',
              amount === '' && 'text-muted-foreground',
              showAmountError && 'text-destructive',
            )}
          >
            {/* The sign (#398): the kind's own, one tap for the other
                (a refund, a returned income, a transfer in or out). */}
            {transferAdd ? null : split ? (
              <span aria-hidden>{sign}</span>
            ) : (
              <button
                type="button"
                aria-label={
                  direction === 'in'
                    ? 'Entrée d’argent, changer de signe'
                    : 'Sortie d’argent, changer de signe'
                }
                title="Changer de signe"
                onClick={() =>
                  setDirection((current) => (current === 'in' ? 'out' : 'in'))
                }
                className={cn(
                  'hover:bg-muted focus-visible:ring-ring/50 flex min-h-[44px] min-w-[44px] items-center justify-center self-center rounded-full outline-none focus-visible:ring-[3px]',
                  direction === 'in' && 'text-chart-delta-good',
                )}
              >
                {sign}
              </button>
            )}
            {/* As wide as its text (a hidden copy sizes it). */}
            <span className="grid">
              <span
                aria-hidden
                className="invisible col-start-1 row-start-1 px-0.5 whitespace-pre"
              >
                {amount || '0'}
              </span>
              <input
                ref={amountRef}
                id={`${id}-amount`}
                size={1}
                autoComplete="off"
                placeholder="0"
                value={amount}
                readOnly={split}
                aria-invalid={showAmountError}
                aria-describedby={
                  showAmountError ? `${id}-amount-error` : undefined
                }
                inputMode="decimal"
                enterKeyHint="next"
                className="placeholder:text-muted-foreground focus:border-primary col-start-1 row-start-1 w-full min-w-0 border-b-2 border-transparent bg-transparent text-center outline-none read-only:focus:border-transparent"
                onChange={(event) => {
                  const next = typedAmount(event.target.value)
                  if (next !== null) setAmount(next)
                }}
                // A phone's decimal keyboard has no Enter: closing it (its
                // ✓) with a valid amount moves on to the details, as Enter
                // does on a computer. Not when the keyboard closes for a
                // tap on a button (‹, ›, a step, ✕), nor in an edit.
                onBlur={(event) => {
                  if (!isMobile || editing) return
                  const tap = lastTap.current
                  const tappedControl =
                    tap !== null &&
                    tap.target !== event.currentTarget &&
                    performance.now() - tap.at < TAP_BLUR_MS &&
                    tap.target.closest(
                      'button, a, input, textarea, select, [role="button"]',
                    ) !== null
                  if (tappedControl || amountError || !categoryChosen) return
                  setStep('details')
                }}
              />
            </span>
            <span aria-hidden>€</span>
          </div>
          {showAmountError ? (
            <FieldError id={`${id}-amount-error`} className="text-center">
              {amountError}
            </FieldError>
          ) : split ? (
            <p className="text-muted-foreground text-xs">
              Répartie : le montant se change après « Ne plus répartir ».
            </p>
          ) : (
            <>
              {signHint && (
                <p className="text-muted-foreground text-xs">{signHint}</p>
              )}
              {paidByOther && (
                <p className="text-muted-foreground text-xs">
                  L’addition payée par {payer.name} : ma part se règle dans les
                  options.
                </p>
              )}
              {voucherGauge && (
                <div className="mx-auto w-full max-w-64 pt-1">
                  {voucherGauge}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!detour && step === 'details' && (
        <div
          data-sheet-scroll=""
          className={cn(
            'min-h-0 flex-1 space-y-5 overflow-x-hidden overscroll-contain px-4 pt-4 pb-6',
            // The month open takes the whole step, nothing to scroll (#398).
            pickingDay ? 'flex flex-col overflow-y-hidden' : 'overflow-y-auto',
          )}
        >
          {!pickingDay && recapBlock(false)}
          <div className={cn('space-y-1', pickingDay && 'min-h-0 flex-1')}>
            <DayStrip
              value={date}
              onChange={setDate}
              today={today}
              invalid={showDateError}
              onPickingChange={setPickingDay}
            />
            {!pickingDay && showDateError && (
              <FieldError>{dateError}</FieldError>
            )}
          </div>
          {!pickingDay && (
            <div className="space-y-2">
              <p
                id={`${id}-account`}
                className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase"
              >
                {accountTitle}
              </p>
              {bank || paidBy ? (
                fixedAccount()
              ) : (
                <AccountRows
                  labelId={`${id}-account`}
                  accounts={accountChoices}
                  // Someone else paid: none of the owner's accounts.
                  value={paidByOther ? '' : accountId}
                  onChange={(next) => {
                    setAccountId(next)
                    setPayer(null)
                    if (next === toAccountId) setToAccountId('')
                  }}
                >
                  {/* « Payé pour moi » (#398): who paid, in the same frame. */}
                  {canShare && (
                    <OptionRow
                      role={payer ? 'radio' : 'button'}
                      selected={payer !== null}
                      leading={
                        payer ? (
                          <ContactAvatar name={payer.name} size="sm" />
                        ) : (
                          <span className="bg-muted text-muted-foreground flex size-[36px] shrink-0 items-center justify-center rounded-full">
                            <UserRoundIcon
                              aria-hidden
                              className="size-[18px]"
                            />
                          </span>
                        )
                      }
                      label={payer ? payer.name : 'Quelqu’un d’autre'}
                      detail={
                        payer
                          ? 'A payé · je lui dois ma part'
                          : 'Je lui dois ma part'
                      }
                      onClick={() => setDetour('payer')}
                    />
                  )}
                </AccountRows>
              )}
              {voucherGauge && <div className="px-1 pt-1">{voucherGauge}</div>}
              {transferAdd && (
                <div className="space-y-2 pt-3">
                  <p
                    id={`${id}-to`}
                    className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase"
                  >
                    Vers
                  </p>
                  <AccountRows
                    labelId={`${id}-to`}
                    accounts={toChoices}
                    value={toAccountId}
                    onChange={setToAccountId}
                  />
                  {submitted && !toAccountId && (
                    <FieldError>Choisissez le compte qui reçoit.</FieldError>
                  )}
                </div>
              )}
              {noAccount && (
                <p className="text-muted-foreground text-sm">
                  Ajoutez d’abord un compte courant pour saisir une opération.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {!detour && step === 'options' && (
        <div
          data-sheet-scroll=""
          className="min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-6"
        >
          {recapBlock(true)}
          {bank && !legacyCorrected && (
            // Said once, where an imported row's edit opens (#398).
            <p className="text-muted-foreground -mt-3 flex items-center justify-center gap-1.5 text-center text-xs">
              <LockIcon aria-hidden className="size-[14px] shrink-0" />
              Montant et jour de la banque : ils ne se modifient pas.
            </p>
          )}

          <div className="space-y-2">
            <label
              htmlFor={`${id}-label`}
              className="text-muted-foreground block px-1 text-xs font-semibold tracking-wide uppercase"
            >
              {bank ? 'Libellé de la banque' : 'Libellé'}
            </label>
            {bank ? (
              <p
                id={`${id}-label`}
                className="bg-muted/40 rounded-md px-3 py-2.5 text-[16px] break-words"
              >
                {item.rawLabel}
              </p>
            ) : (
              <>
                <Input
                  id={`${id}-label`}
                  className="h-11 text-[16px]"
                  autoComplete="off"
                  enterKeyHint="done"
                  maxLength={LABEL_MAX}
                  placeholder={categoryId ? 'Facultatif' : 'Par ex. « ciné »'}
                  value={label}
                  aria-invalid={showLabelError}
                  onChange={(event) => setLabel(event.target.value)}
                  onKeyDown={(event) => {
                    // "OK" on a phone closes the keyboard.
                    if (isMobile && event.key === 'Enter') {
                      event.preventDefault()
                      event.currentTarget.blur()
                    }
                  }}
                />
                {showLabelError && <FieldError>{labelError}</FieldError>}
              </>
            )}
          </div>

          {legacyCorrected && actions && (
            <div className="bg-muted/40 space-y-2 rounded-md px-3 py-2.5">
              <p className="text-muted-foreground text-sm">
                Corrigée à la main avant : la banque dit{' '}
                {formatCents(item.originalAmountCents ?? item.amountCents)} le{' '}
                {formatCalendarDate(
                  item.originalBookingDate ?? item.bookingDate,
                )}
                .
              </p>
              <Button
                type="button"
                variant="secondary"
                outline
                onClick={() => {
                  actions.onRestoreBank()
                  onOpenChange(false)
                }}
              >
                Rétablir les valeurs de la banque
              </Button>
            </div>
          )}

          {/* Adding an expense (#398): who shares it, or my part of what
              someone else paid, kept until « Ajouter ». */}
          {canShare && (
            <div className="space-y-2">
              <p className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">
                Partage
              </p>
              <div className={SETTING_GROUP_CLASS}>
                {paidByOther ? (
                  <SettingRow
                    icon={ChartPieIcon}
                    label={`Je dois à ${payer.name}`}
                    value={formatCents(myPart)}
                    aria-invalid={shareError || undefined}
                    onClick={() => setDetour('mine')}
                  />
                ) : (
                  <SettingRow
                    icon={UsersIcon}
                    label="Partager"
                    value={sharing ? sharedNames : 'Non'}
                    aria-invalid={shareError || undefined}
                    onClick={() => setDetour('share')}
                  />
                )}
              </div>
              {submitted && shareError && (
                <FieldError>
                  {paidByOther
                    ? 'Ma part doit être entre 0 et l’addition.'
                    : 'Les parts dépassent la dépense.'}
                </FieldError>
              )}
            </div>
          )}

          {item && actions && (
            <div className="space-y-2">
              <p className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">
                Cette opération
              </p>
              <EditOptionRows item={item} onOpen={setDetour} />
            </div>
          )}

          <div className="space-y-2">
            <p className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">
              Réglages
            </p>
            <div className={SETTING_GROUP_CLASS}>
              <SettingSwitchRow
                icon={SparkleIcon}
                label="Ponctuelle"
                checked={isOneOff}
                onCheckedChange={setIsOneOff}
              />
              {editing && (
                <SettingSwitchRow
                  icon={FlagIcon}
                  label="À revoir"
                  checked={needsReview}
                  onCheckedChange={setNeedsReview}
                />
              )}
            </div>
            <p className="text-muted-foreground px-1 text-xs">
              Ponctuelle : hors des moyennes et des abonnements.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor={`${id}-note`}
              className="text-muted-foreground block px-1 text-xs font-semibold tracking-wide uppercase"
            >
              Note
            </label>
            <Textarea
              id={`${id}-note`}
              rows={2}
              maxLength={NOTE_MAX}
              placeholder="Facultatif"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {item?.manual && (
            <FormSheetMoreActions>
              <p className="text-muted-foreground text-xs">
                Saisie à la main : l’import du relevé la remplacera par
                l’opération de la banque, en gardant sa catégorie, sa note et sa
                répartition.
              </p>
              <Button
                type="button"
                variant="danger"
                outline
                onClick={() => setConfirmOpen(true)}
              >
                Supprimer l’opération
              </Button>
            </FormSheetMoreActions>
          )}
        </div>
      )}
    </form>
  )

  return (
    <>
      {isMobile ? (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            side="screen"
            onKeyDown={onKeyDown}
            onPointerDownCapture={(event) => {
              if (event.target instanceof Element)
                lastTap.current = {
                  target: event.target,
                  at: performance.now(),
                }
            }}
            onOpenAutoFocus={(event) => {
              // The step's heading, or the amount when it opens there (an
              // envelope's « + »): the keyboard comes up at once.
              event.preventDefault()
              focusStep()
            }}
          >
            {form}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent
            className="flex h-[min(34rem,calc(100svh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
            onKeyDown={onKeyDown}
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              focusStep()
            }}
          >
            {form}
          </DialogContent>
        </Dialog>
      )}
      {item?.manual && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Supprimer cette opération ?"
          description={`${formatCents(item.amountCents)} saisis à la main le ${formatCalendarDate(item.bookingDate)}. Vous pourrez annuler juste après.`}
          confirmLabel="Supprimer"
          variant="danger"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </>
  )
}
