import {
  Button,
  Checkbox,
  ConfirmDialog,
  Field,
  FieldError,
  FieldLabel,
  DateField,
  Input,
  Label,
} from '@capi/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { CategoryIcon, EnvelopeSummaryDto } from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import { LARGE_AMOUNT_CENTS } from '#/components/amount/signed-amount'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import {
  CategoryAvatar,
} from '#/components/categories/category-icons'
import { ColorPalette } from '#/components/categories/ColorPalette'
import { IconPicker } from '#/components/categories/IconPicker'
import { FormSheetMoreActions } from '#/components/sheets/form-sheet'
import { categoriesQuery } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { EnvelopeAvatar } from './EnvelopeAvatar'
import { EnvelopeSheet } from './EnvelopeSheet'
import { DEFAULT_ENVELOPE_COLOR } from './format'
import {
  afterEnvelopesChanged,
  envelopeErrorMessage,
  removeEnvelope,
  updateEnvelope,
} from './queries'

const NAME_MAX = 100

/**
 * « Modifier » an envelope: its name, icon and colour, target, due date
 * and the categories it pays for; archive or delete it (its money goes
 * back to « libre »).
 */
export function EnvelopeEditor({
  open,
  onOpenChange,
  envelope,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  envelope: EnvelopeSummaryDto
}) {
  const id = useId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const categories = useQuery({ ...categoriesQuery, enabled: open })
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<CategoryIcon>('piggy-bank')
  const [color, setColor] = useState<string>('')
  const [target, setTarget] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [tried, setTried] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(envelope.name)
    setIcon((envelope.icon as CategoryIcon | null) ?? 'piggy-bank')
    setColor(envelope.color ?? DEFAULT_ENVELOPE_COLOR)
    setTarget(
      envelope.targetCents === null ? '' : centsToInput(envelope.targetCents),
    )
    setDueDate(envelope.dueDate ?? '')
    setCategoryIds(envelope.categoryIds)
    setTried(false)
  }, [open, envelope])

  const targetCents = target.trim() === '' ? null : parseEurosToCents(target)
  const nameError = name.trim() === '' ? 'Indiquez un nom.' : null
  const targetError =
    target.trim() !== '' && (targetCents === null || targetCents <= 0)
      ? 'Montant invalide.'
      : null

  const save = useMutation({
    mutationFn: () =>
      updateEnvelope(envelope.id, {
        name: name.trim(),
        icon,
        color: color.startsWith('#') ? color : null,
        targetCents,
        dueDate: dueDate || null,
        categoryIds,
      }),
    onSuccess: async () => {
      await afterEnvelopesChanged(queryClient)
      toast.success('Enveloppe enregistrée')
      onOpenChange(false)
    },
    onError: (e) => toast.error(envelopeErrorMessage(e)),
  })
  const archive = useMutation({
    mutationFn: () =>
      updateEnvelope(envelope.id, { archived: !envelope.archived }),
    onSuccess: async () => {
      await afterEnvelopesChanged(queryClient)
      toast.success(envelope.archived ? 'Enveloppe restaurée' : 'Enveloppe archivée')
      onOpenChange(false)
    },
    onError: (e) => toast.error(envelopeErrorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: () => removeEnvelope(envelope.id),
    onSuccess: async () => {
      setConfirmOpen(false)
      onOpenChange(false)
      void navigate({ to: ROUTES.savings })
      await afterEnvelopesChanged(queryClient)
      toast.success('Enveloppe supprimée')
    },
    onError: (e) => toast.error(envelopeErrorMessage(e)),
  })
  const busy = save.isPending || archive.isPending || remove.isPending
  const expenseCategories = (categories.data ?? []).filter(
    (c) =>
      c.kind === 'expense' && (c.archivedAt === null || categoryIds.includes(c.id)),
  )

  return (
    <>
      <EnvelopeSheet
        open={open}
        onOpenChange={onOpenChange}
        title={envelope.name}
        actionLabel="Enregistrer"
        loading={save.isPending}
        disabled={busy}
        onSubmit={() => {
          setTried(true)
          if (!nameError && !targetError) save.mutate()
        }}
      >
        <div className="flex items-center gap-3">
          <EnvelopeAvatar envelope={{ icon, color }} size="lg" />
          <Field className="flex-1" data-invalid={tried && !!nameError}>
            <FieldLabel htmlFor={`${id}-name`}>Nom</FieldLabel>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={NAME_MAX}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
            {tried && nameError && <FieldError>{nameError}</FieldError>}
          </Field>
        </div>
        <IconPicker label="Icône" value={icon} color={color} onChange={setIcon} />
        <ColorPalette label="Couleur" value={color} onChange={setColor} />
        <Field data-invalid={tried && !!targetError}>
          <FieldLabel htmlFor={`${id}-target`}>Montant visé</FieldLabel>
          <AmountField
            id={`${id}-target`}
            maxCents={LARGE_AMOUNT_CENTS}
            placeholder="Pas de montant"
            value={target}
            onValueChange={(typed) => setTarget(typed)}
          />
          {tried && targetError && <FieldError>{targetError}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-date`}>Pour le</FieldLabel>
          <DateField
            id={`${id}-date`}
            title="Pour le"
            clearable
            value={dueDate}
            onChange={(day) => setDueDate(day)}
          />
        </Field>
        <fieldset className="space-y-1">
          <legend className="pb-1 text-sm font-medium">Paie pour</legend>
          {expenseCategories.map((category) => {
            const checked = categoryIds.includes(category.id)
            return (
              <Label
                key={category.id}
                className="flex min-h-11 items-center gap-2.5 font-normal"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) =>
                    setCategoryIds(
                      value === true
                        ? [...categoryIds, category.id]
                        : categoryIds.filter((c) => c !== category.id),
                    )
                  }
                />
                <CategoryAvatar category={category} />
                {category.name}
              </Label>
            )
          })}
        </fieldset>
        <FormSheetMoreActions>
          <Button
            type="button"
            variant="secondary"
            outline
            loading={archive.isPending}
            disabled={busy}
            onClick={() => archive.mutate()}
          >
            {envelope.archived ? 'Restaurer' : 'Archiver'}
          </Button>
          <Button
            type="button"
            variant="danger"
            outline
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
          >
            Supprimer
          </Button>
        </FormSheetMoreActions>
      </EnvelopeSheet>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Supprimer ${envelope.name} ?`}
        description="Son argent redevient « libre ». Les dépenses qu’elle a payées restent dans leur mois."
        confirmLabel="Supprimer"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  )
}
