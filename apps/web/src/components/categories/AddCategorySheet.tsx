import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  NativeSelectOption,
  Sheet,
  SheetContent,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { CategoryIcon, TransactionKind } from '#/api/types.gen'
import {
  KIND_GROUP_LABELS,
  TRANSACTION_KINDS,
} from '#/components/transactions/labels'
import { DEFAULT_CATEGORY_ICON } from './category-icons'
import { ColorPalette } from './ColorPalette'
import { IconPicker } from './IconPicker'
import { categoryErrorMessage } from './errors'
import { DEFAULT_CATEGORY_COLOR } from './palette'
import { afterCategoriesChanged, createCategory } from './queries'
import {
  EditorHeader,
  editorSide,
  FORM_SHEET_SCREEN,
  SheetScroll,
} from '#/components/sheets/form-sheet'

const NAME_MAX = 100

interface AddCategorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Adds a category. A bottom sheet on phones, a side sheet otherwise. */
export function AddCategorySheet({
  open,
  onOpenChange,
}: AddCategorySheetProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<TransactionKind>('expense')
  const [color, setColor] = useState<string>(DEFAULT_CATEGORY_COLOR)
  const [icon, setIcon] = useState<CategoryIcon>(DEFAULT_CATEGORY_ICON)
  const [submitted, setSubmitted] = useState(false)

  // Fresh form on every opening.
  useEffect(() => {
    if (!open) return
    setName('')
    setKind('expense')
    setColor(DEFAULT_CATEGORY_COLOR)
    setIcon(DEFAULT_CATEGORY_ICON)
    setSubmitted(false)
  }, [open])

  const nameError = name.trim() === '' ? 'Le nom est requis.' : null

  const create = useMutation({
    mutationFn: () => createCategory({ name: name.trim(), kind, color, icon }),
    onSuccess: async (created) => {
      toast.success(`Catégorie ${created.name} ajoutée`)
      onOpenChange(false)
      await afterCategoriesChanged(queryClient)
    },
    onError: (error) => toast.error(categoryErrorMessage(error)),
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (nameError) return
    create.mutate()
  }

  const showError = submitted && nameError !== null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className={isMobile ? FORM_SHEET_SCREEN : undefined}
      >
        <EditorHeader
          className="pb-0"
          title="Ajouter une catégorie"
          description="Elle apparaît tout de suite dans les listes de catégories."
          action={{
            type: 'submit',
            form: `${id}-form`,
            label: 'Ajouter',
            loading: create.isPending,
          }}
        />
        <SheetScroll>
          <form
            id={`${id}-form`}
            noValidate
            onSubmit={submit}
            className="space-y-4 px-4 pb-6"
          >
            <Field data-invalid={showError}>
              <FieldLabel htmlFor={`${id}-name`}>Nom</FieldLabel>
              <Input
                id={`${id}-name`}
                autoComplete="off"
                maxLength={NAME_MAX}
                value={name}
                aria-invalid={showError}
                onChange={(event) => setName(event.target.value)}
              />
              {showError && <FieldError>{nameError}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-kind`}>Type</FieldLabel>
              <NativeSelect
                id={`${id}-kind`}
                className="w-full"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as TransactionKind)
                }
              >
                {TRANSACTION_KINDS.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {KIND_GROUP_LABELS[value]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel id={`${id}-color`}>Couleur</FieldLabel>
              <ColorPalette
                value={color}
                onChange={setColor}
                label="Couleur de la nouvelle catégorie"
              />
            </Field>
            <Field>
              <FieldLabel id={`${id}-icon`}>Icône</FieldLabel>
              <IconPicker
                value={icon}
                onChange={setIcon}
                color={color}
                label="Icône de la nouvelle catégorie"
              />
            </Field>
            {!isMobile && (
              <Button
                type="submit"
                className="w-full sm:w-auto"
                loading={create.isPending}
              >
                Ajouter
              </Button>
            )}
          </form>
        </SheetScroll>
      </SheetContent>
    </Sheet>
  )
}
