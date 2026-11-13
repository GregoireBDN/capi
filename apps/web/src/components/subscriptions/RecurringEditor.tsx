import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  NativeSelect,
  NativeSelectOption,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Switch,
  Textarea,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CheckIcon, ListIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type {
  CategoryDto,
  RecurringCadence,
  RecurringItemDto,
  UpdateRecurringItemDto,
} from '#/api/types.gen'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { pickableCategories } from '#/lib/categories'
import { ALL_MONTHS } from '#/components/transactions/search'
import { ROUTES } from '#/lib/routes'
import { CADENCE_LABELS, CADENCES, formatPriceChange } from './format'
import {
  afterRecurringChanged,
  recurringErrorMessage,
  updateRecurringItem,
} from './queries'

const NAME_MAX = 255
const NOTES_MAX = 1000

interface RecurringEditorProps {
  item: RecurringItemDto | null
  onOpenChange: (open: boolean) => void
  categories: readonly CategoryDto[]
  today: string
}

/**
 * Edits a recurring item: name, category, fixed-cost flag, cadence, notes;
 * confirms, dismisses or restores it; links to its transactions. A bottom
 * sheet on phones, a side sheet otherwise.
 */
export function RecurringEditor({
  item,
  onOpenChange,
  categories,
  today,
}: RecurringEditorProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [isFixedCost, setIsFixedCost] = useState(false)
  const [cadence, setCadence] = useState<RecurringCadence>('monthly')
  const [notes, setNotes] = useState('')

  // Fresh form on every opening.
  useEffect(() => {
    if (!item) return
    setName(item.name)
    setCategoryId(item.categoryId ?? '')
    setIsFixedCost(item.isFixedCost)
    setCadence(item.cadence)
    setNotes(item.notes ?? '')
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

  const nameError = name.trim() === '' ? 'Indiquez un nom.' : null

  function fields(): UpdateRecurringItemDto {
    return {
      name: name.trim(),
      categoryId: categoryId || null,
      isFixedCost,
      cadence,
      notes: notes.trim() || null,
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (nameError) return
    save.mutate(fields())
  }

  const sorted = pickableCategories(categories, categoryId).sort((a, b) =>
    a.name.localeCompare(b.name, 'fr'),
  )
  const priceChange = item ? formatPriceChange(item, today) : null

  return (
    <Sheet open={item !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
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
              <SheetDescription>
                {item.accountName} · {formatCents(item.typicalAmountCents)} ·{' '}
                {formatCents(item.yearlyCostCents)} par an
                {priceChange ? ` · ${priceChange}` : ''}
              </SheetDescription>
            </SheetHeader>
            <form noValidate onSubmit={submit} className="space-y-4 px-4 pb-6">
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
              <Field>
                <FieldLabel htmlFor={`${id}-category`}>Catégorie</FieldLabel>
                <NativeSelect
                  id={`${id}-category`}
                  className="w-full"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <NativeSelectOption value="">
                    Sans catégorie
                  </NativeSelectOption>
                  {sorted.map((category) => (
                    <NativeSelectOption key={category.id} value={category.id}>
                      {category.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-cadence`}>Fréquence</FieldLabel>
                <NativeSelect
                  id={`${id}-cadence`}
                  className="w-full"
                  value={cadence}
                  onChange={(event) =>
                    setCadence(event.target.value as RecurringCadence)
                  }
                >
                  {CADENCES.map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {CADENCE_LABELS[value]}
                      {value === item.detectedCadence ? ' (détectée)' : ''}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
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

              {item.occurrences.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Dernières opérations</p>
                  <ol className="text-muted-foreground space-y-0.5 text-sm tabular-nums">
                    {item.occurrences.map((occurrence) => (
                      <li
                        key={occurrence.transactionId}
                        className="flex justify-between gap-2"
                      >
                        <span>{formatCalendarDate(occurrence.date)}</span>
                        <span>{formatCents(occurrence.amountCents)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <Button outline variant="secondary" className="w-full" asChild>
                <Link
                  to={ROUTES.transactions}
                  search={{
                    month: ALL_MONTHS,
                    q: item.searchText,
                    account: item.accountId,
                  }}
                >
                  <ListIcon className="size-4" />
                  Voir les opérations
                </Link>
              </Button>

              <div className="grid gap-2 pt-2">
                <Button type="submit" loading={save.isPending}>
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
                {item.status !== 'dismissed' ? (
                  <Button
                    type="button"
                    variant="danger"
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
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
