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
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Switch,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  cn,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BanIcon,
  CalendarIcon,
  CheckIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type {
  CategoryDto,
  RecurringCadence,
  RecurringItemDto,
  UpdateRecurringItemDto,
} from '#/api/types.gen'
import {
  CHIP_CLASS,
  CHIP_ON,
  CategoryChips,
} from '#/components/expenses/manual-fields'
import { formatCents } from '#/lib/money'
import { pickableCategories } from '#/lib/categories'
import {
  CADENCE_LABELS,
  CADENCE_SHORT_LABELS,
  CADENCES,
  formatAmountPerPeriod,
  formatChargedAfterEnd,
  formatDayMonth,
  formatEnd,
  formatPrepaid,
} from './format'
import { RecurringShareSection } from '#/components/owed/RecurringShareSection'
import { PrepaidTermControl } from './PrepaidTermControl'
import {
  afterRecurringChanged,
  recurringErrorMessage,
  undoableRecurringToast,
  updateRecurringItem,
} from './queries'
import { RecurringHistory } from './RecurringHistory'

const NAME_MAX = 255
const NOTES_MAX = 1000

/** Categories offered first, before « Toutes les catégories » (#279). */
const USUAL_SLUGS: Record<RecurringItemDto['direction'], readonly string[]> = {
  debit: [
    'subscriptions',
    'rent',
    'insurance',
    'telecom',
    'energy',
    'transport',
  ],
  credit: ['salary', 'refunds'],
}

/**
 * The category chips' list: the current category and the usual ones first,
 * then (all = true) every other category of the item's kind by name.
 */
export function categoryChoices(
  categories: readonly CategoryDto[],
  direction: RecurringItemDto['direction'],
  current: string,
  all: boolean,
): { shown: CategoryDto[]; hiddenCount: number } {
  const kind = direction === 'debit' ? 'expense' : 'income'
  const ofKind = pickableCategories(categories, current)
    .filter((category) => category.kind === kind || category.id === current)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const usual = USUAL_SLUGS[direction]
  const first = [
    ...ofKind.filter((category) => category.id === current),
    ...usual.flatMap((slug) =>
      ofKind.filter(
        (category) => category.slug === slug && category.id !== current,
      ),
    ),
  ]
  const rest = ofKind.filter((category) => !first.includes(category))
  return all
    ? { shown: [...first, ...rest], hiddenCount: 0 }
    : { shown: first, hiddenCount: rest.length }
}

interface RecurringEditorProps {
  item: RecurringItemDto | null
  onOpenChange: (open: boolean) => void
  categories: readonly CategoryDto[]
  today: string
  /** Opens « Résilier » (or the end date of a cancelled item) for `item`. */
  onEnd: (item: RecurringItemDto) => void
}

/**
 * Edits a recurring item: name, category, fixed-cost flag, cadence, notes;
 * confirms, dismisses or restores it; cancels (« Résilier ») or reactivates
 * a confirmed debit; links to its transactions. A bottom sheet on phones, a
 * side sheet otherwise.
 */
export function RecurringEditor({
  item,
  onOpenChange,
  categories,
  today,
  onEnd,
}: RecurringEditorProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [isFixedCost, setIsFixedCost] = useState(false)
  const [cadence, setCadence] = useState<RecurringCadence>('monthly')
  const [notes, setNotes] = useState('')
  const [termMonths, setTermMonths] = useState<number | null>(null)
  const [allCategories, setAllCategories] = useState(false)

  // Fresh form on every opening.
  useEffect(() => {
    if (!item) return
    setAllCategories(false)
    setName(item.name)
    setCategoryId(item.categoryId ?? '')
    setIsFixedCost(item.isFixedCost)
    setCadence(item.cadence)
    setNotes(item.notes ?? '')
    setTermMonths(item.termMonths)
  }, [item])

  const save = useMutation({
    mutationFn: (body: UpdateRecurringItemDto) =>
      updateRecurringItem(item!.id, body),
    onSuccess: async (saved, body) => {
      toast.success(
        body.status === 'confirmed'
          ? `${saved.name} confirmé`
          : body.status === 'dismissed'
            ? `${saved.name} ignoré`
            : body.status === 'suggested'
              ? `${saved.name} remis dans les suggestions`
              : `${saved.name} enregistré`,
      )
      onOpenChange(false)
      await afterRecurringChanged(queryClient)
    },
    onError: (error) => toast.error(recurringErrorMessage(error)),
  })

  const reactivate = useMutation({
    mutationFn: () => updateRecurringItem(item!.id, { endedOn: null }),
    onSuccess: (saved) => {
      const previous = { endedOn: item!.endedOn }
      onOpenChange(false)
      undoableRecurringToast(
        queryClient,
        `${saved.name} réactivé`,
        saved.id,
        previous,
      )
    },
    onError: (error) => toast.error(recurringErrorMessage(error)),
  })
  const pending = save.isPending || reactivate.isPending

  const nameError = name.trim() === '' ? 'Indiquez un nom.' : null

  function fields(): UpdateRecurringItemDto {
    return {
      name: name.trim(),
      categoryId: categoryId || null,
      isFixedCost,
      // A prepaid item renews by its term: its cadence is left alone.
      ...(termMonths === null && { cadence }),
      ...(termMonths !== item!.termMonths && { termMonths }),
      notes: notes.trim() || null,
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (nameError) return
    save.mutate(fields())
  }

  const choices = item
    ? categoryChoices(categories, item.direction, categoryId, allCategories)
    : { shown: [], hiddenCount: 0 }
  const end = item ? formatEnd(item, today) : null
  const chargedAfterEnd = item ? formatChargedAfterEnd(item, today) : null
  // « Résilier » is for debits; credits would « Arrêter » (later).
  const canEnd =
    item?.status === 'confirmed' &&
    item.direction === 'debit' &&
    item.endedOn === null

  return (
    <Sheet open={item !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        onOpenAutoFocus={(event) => {
          // On a phone, opening must not pop the keyboard up over the
          // summary: focus the sheet, not the name field.
          if (!isMobile) return
          event.preventDefault()
          ;(event.currentTarget as HTMLElement | null)?.focus()
        }}
        className={
          isMobile
            ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
            : 'overflow-y-auto'
        }
      >
        {item && (
          <>
            <SheetHeader className="pb-0">
              <SheetTitle>{item.name}</SheetTitle>
              {/* The summary first (#279): how much, when next, per year. */}
              <p className="text-2xl font-semibold tabular-nums">
                {item.direction === 'credit' ? '+' : ''}
                {formatAmountPerPeriod(item)}
              </p>
              <SheetDescription>
                {item.termMonths
                  ? `${formatPrepaid(item)} le ${formatDayMonth(item.lastSeenDate, today)} · ${
                      item.renewalDate &&
                      (item.endedOn === null || item.renewalDate < item.endedOn)
                        ? `renouvellement le ${formatDayMonth(item.renewalDate, today)} · `
                        : ''
                    }`
                  : item.nextExpectedDate &&
                      (item.endedOn === null ||
                        item.nextExpectedDate < item.endedOn)
                    ? `Prochain le ${formatDayMonth(item.nextExpectedDate, today)} · `
                    : `Dernier le ${formatDayMonth(item.lastSeenDate, today)} · `}
                {formatCents(item.yearlyCostCents)} par an · {item.accountName}
              </SheetDescription>
            </SheetHeader>
            <form noValidate onSubmit={submit} className="space-y-4 px-4 pb-6">
              {end && item.status === 'confirmed' && (
                <Alert variant={chargedAfterEnd ? 'warning' : undefined}>
                  {chargedAfterEnd ? <TriangleAlertIcon /> : <BanIcon />}
                  <AlertTitle>{end}</AlertTitle>
                  <AlertDescription className="text-pretty [&_p:not(:last-child)]:mb-1">
                    <p>
                      {chargedAfterEnd ? `${chargedAfterEnd}. ` : ''}
                      {item.ended
                        ? 'Hors de la prévision et des totaux.'
                        : 'Compté jusque-là, puis hors de la prévision et des totaux.'}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        outline
                        variant="secondary"
                        iconStart={<RotateCcwIcon />}
                        loading={reactivate.isPending}
                        disabled={pending}
                        onClick={() => reactivate.mutate()}
                      >
                        Réactiver
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        outline
                        variant="secondary"
                        iconStart={<CalendarIcon />}
                        disabled={pending}
                        onClick={() => onEnd(item)}
                      >
                        Modifier la date
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              <Field data-invalid={nameError !== null}>
                <FieldLabel htmlFor={`${id}-name`}>Nom</FieldLabel>
                <Input
                  id={`${id}-name`}
                  value={name}
                  maxLength={NAME_MAX}
                  autoComplete="off"
                  aria-invalid={nameError !== null}
                  onChange={(event) => setName(event.target.value)}
                />
                {nameError && <FieldError>{nameError}</FieldError>}
              </Field>
              {item.direction === 'debit' && (
                <PrepaidTermControl
                  value={termMonths}
                  onChange={setTermMonths}
                  allowNone
                  amountCents={
                    item.termMonths
                      ? item.typicalAmountCents
                      : item.latestAmountCents
                  }
                />
              )}
              {termMonths === null && (
                <div className="space-y-1.5">
                  <p id={`${id}-cadence`} className="text-sm font-medium">
                    Fréquence
                  </p>
                  <ToggleGroup
                    type="single"
                    spacing={1.5}
                    aria-labelledby={`${id}-cadence`}
                    // Sized to their content, wrapping, start-aligned.
                    className="flex-wrap justify-start"
                    value={cadence}
                    onValueChange={(next) => {
                      if (next) setCadence(next as RecurringCadence)
                    }}
                  >
                    {CADENCES.map((value) => (
                      <ToggleGroupItem
                        key={value}
                        value={value}
                        aria-label={CADENCE_LABELS[value]}
                        className={cn(CHIP_CLASS, CHIP_ON)}
                      >
                        {CADENCE_SHORT_LABELS[value]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className="text-muted-foreground text-xs">
                    Détectée :{' '}
                    {CADENCE_LABELS[item.detectedCadence].toLowerCase()}
                    {cadence !== item.detectedCadence
                      ? ' (vous l’avez changée)'
                      : ''}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <p id={`${id}-category`} className="text-sm font-medium">
                  Catégorie
                </p>
                <CategoryChips
                  labelId={`${id}-category`}
                  categories={choices.shown}
                  value={categoryId}
                  allowNone={allCategories || categoryId === ''}
                  onChoose={setCategoryId}
                />
                {choices.hiddenCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    ghost
                    variant="secondary"
                    onClick={() => setAllCategories(true)}
                  >
                    Toutes les catégories ({choices.hiddenCount})
                  </Button>
                )}
              </div>
              {item.direction === 'debit' && (
                <div className="flex items-start gap-3">
                  <Switch
                    id={`${id}-fixed`}
                    checked={isFixedCost}
                    onCheckedChange={setIsFixedCost}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor={`${id}-fixed`} className="font-normal">
                      Charge fixe
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      Loyer, assurances, énergie, télécom, abonnements…
                    </p>
                  </div>
                </div>
              )}
              {item.status === 'confirmed' && item.direction === 'debit' && (
                <RecurringShareSection key={item.id} item={item} />
              )}
              <Field>
                <FieldLabel htmlFor={`${id}-notes`}>Notes</FieldLabel>
                <Textarea
                  id={`${id}-notes`}
                  rows={2}
                  maxLength={NOTES_MAX}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
                <FieldDescription>Facultatives.</FieldDescription>
              </Field>

              <RecurringHistory item={item} today={today} />
              <div className="grid gap-2 pt-2">
                <Button
                  type="submit"
                  loading={save.isPending}
                  disabled={reactivate.isPending}
                >
                  Enregistrer
                </Button>
                {item.status === 'suggested' && (
                  <Button
                    type="button"
                    variant="success"
                    iconStart={<CheckIcon />}
                    disabled={save.isPending || nameError !== null}
                    onClick={() =>
                      save.mutate({ ...fields(), status: 'confirmed' })
                    }
                  >
                    Enregistrer et confirmer
                  </Button>
                )}
                {/* Secondary actions on one discreet row. */}
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                  {canEnd && (
                    <Button
                      type="button"
                      variant="danger"
                      ghost
                      iconStart={<BanIcon />}
                      disabled={pending}
                      onClick={() => onEnd(item)}
                    >
                      Résilier
                    </Button>
                  )}
                  {item.status !== 'dismissed' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      ghost
                      iconStart={<XIcon />}
                      disabled={save.isPending}
                      onClick={() => save.mutate({ status: 'dismissed' })}
                    >
                      Ignorer
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      outline
                      iconStart={<RotateCcwIcon />}
                      disabled={save.isPending}
                      onClick={() => save.mutate({ status: 'suggested' })}
                    >
                      Rétablir
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
