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
import { CheckIcon, CopyIcon, KeyRoundIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { AccessTokenScope, CreatedAccessTokenDto } from '#/api/types.gen'
import {
  accessTokenErrorMessage,
  accessTokenKeys,
  createAccessToken,
} from './queries'

const NAME_MAX = 100

/** Expiry choices, in days; `never` = no expiry. */
const EXPIRY_OPTIONS = [
  { value: '30', label: '30 jours' },
  { value: '90', label: '90 jours' },
  { value: '365', label: '1 an' },
  { value: 'never', label: 'Jamais' },
] as const
type Expiry = (typeof EXPIRY_OPTIONS)[number]['value']

const SCOPE_OPTIONS: {
  value: AccessTokenScope
  label: string
  description: string
}[] = [
  {
    value: 'read',
    label: 'Lecture seule',
    description: 'Consulter comptes, opérations, budgets et prévisions.',
  },
  {
    value: 'write',
    label: 'Lecture et écriture',
    description:
      'Aussi catégoriser, créer des règles, saisir des valeurs et des objectifs. Jamais de suppression ni d’import.',
  },
]

interface FormValues {
  name: string
  scope: AccessTokenScope
  expiry: Expiry
}

const emptyValues: FormValues = { name: '', scope: 'read', expiry: '90' }

export function CreateAccessTokenSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [submitted, setSubmitted] = useState(false)
  const [created, setCreated] = useState<CreatedAccessTokenDto | null>(null)
  const [copied, setCopied] = useState(false)

  // Fresh form on every opening; the created token is forgotten on close.
  useEffect(() => {
    if (!open) return
    setValues(emptyValues)
    setSubmitted(false)
    setCreated(null)
    setCopied(false)
  }, [open])

  const nameError =
    values.name.trim() === '' ? 'Donnez un nom au jeton.' : undefined

  const create = useMutation({
    mutationFn: () =>
      createAccessToken({
        name: values.name.trim(),
        scope: values.scope,
        expiresInDays: values.expiry === 'never' ? null : Number(values.expiry),
      }),
    onSuccess: async (token) => {
      setCreated(token)
      await queryClient.invalidateQueries({ queryKey: accessTokenKeys.all })
    },
    onError: (error) => toast.error(accessTokenErrorMessage(error)),
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (nameError) return
    create.mutate()
  }

  async function copy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.token)
      setCopied(true)
      toast.success('Jeton copié')
    } catch {
      toast.error('Copie impossible. Sélectionnez le jeton et copiez-le.')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={
          isMobile
            ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
            : 'overflow-y-auto'
        }
      >
        <SheetHeader className="pb-0">
          <SheetTitle>
            {created ? 'Jeton créé' : 'Créer un jeton d’accès'}
          </SheetTitle>
          <SheetDescription>
            {created
              ? 'Copiez-le maintenant : il ne sera plus jamais affiché.'
              : 'Pour Claude (MCP) ou un script. Il agit en votre nom, dans la limite de sa portée.'}
          </SheetDescription>
        </SheetHeader>

        {created ? (
          <div className="space-y-4 px-4 pb-6">
            <Field>
              <FieldLabel htmlFor={`${id}-token`}>{created.name}</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id={`${id}-token`}
                  readOnly
                  value={created.token}
                  className="font-mono"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="secondary"
                  outline
                  onClick={() => void copy()}
                  aria-label="Copier le jeton"
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </Button>
              </div>
            </Field>
            <Alert>
              <KeyRoundIcon />
              <AlertTitle>Gardez-le secret</AlertTitle>
              <AlertDescription>
                Stockez-le dans la configuration de votre client MCP ou un
                gestionnaire de mots de passe, jamais dans un dépôt. En cas de
                doute, révoquez-le.
              </AlertDescription>
            </Alert>
            <Button
              type="button"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Terminé
            </Button>
          </div>
        ) : (
          <form noValidate onSubmit={submit} className="space-y-4 px-4 pb-6">
            <Field data-invalid={submitted && nameError !== undefined}>
              <FieldLabel htmlFor={`${id}-name`}>Nom</FieldLabel>
              <Input
                id={`${id}-name`}
                autoComplete="off"
                maxLength={NAME_MAX}
                placeholder="Claude Desktop"
                value={values.name}
                aria-invalid={submitted && nameError !== undefined}
                onChange={(event) =>
                  setValues((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
              />
              {submitted && nameError && <FieldError>{nameError}</FieldError>}
            </Field>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Portée</legend>
              <RadioGroup
                value={values.scope}
                onValueChange={(scope) =>
                  setValues((previous) => ({
                    ...previous,
                    scope: scope as AccessTokenScope,
                  }))
                }
              >
                {SCOPE_OPTIONS.map((option) => (
                  <div
                    key={option.value}
                    className="flex min-h-11 items-start gap-2 py-1"
                  >
                    <RadioGroupItem
                      value={option.value}
                      id={`${id}-${option.value}`}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor={`${id}-${option.value}`}
                      className="flex flex-col items-start gap-0.5 font-normal"
                    >
                      <span className="font-medium">{option.label}</span>
                      <span className="text-muted-foreground text-xs">
                        {option.description}
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            <Field>
              <FieldLabel htmlFor={`${id}-expiry`}>Expiration</FieldLabel>
              <NativeSelect
                id={`${id}-expiry`}
                value={values.expiry}
                onChange={(event) =>
                  setValues((previous) => ({
                    ...previous,
                    expiry: event.target.value as Expiry,
                  }))
                }
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                Un jeton expiré est refusé ; créez-en un nouveau.
              </FieldDescription>
            </Field>

            <Button type="submit" className="w-full" loading={create.isPending}>
              Créer le jeton
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  )
}
