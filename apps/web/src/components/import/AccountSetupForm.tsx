import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  NativeSelectOption,
} from '@finances/ui'
import { LandmarkIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { accountsControllerCreate } from '#/api'
import type { AccountDto } from '#/api'
import { importKeys, unwrap } from './api'
import { genericErrorMessage } from './errors'

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Le nom est requis')
    .max(100, '100 caractères maximum'),
  type: z.enum(['checking', 'savings']),
  institution: z.string().trim().max(100, '100 caractères maximum'),
})
type Values = z.infer<typeof schema>

interface AccountSetupFormProps {
  onCreated?: (account: AccountDto) => void
}

/** First run: creates the transactional account the exports will feed. */
export function AccountSetupForm({ onCreated }: AccountSetupFormProps) {
  const queryClient = useQueryClient()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: 'Compte courant',
      type: 'checking',
      institution: 'CIC',
    },
  })
  const { errors } = form.formState

  const create = useMutation({
    mutationFn: (values: Values) =>
      unwrap(
        accountsControllerCreate({
          body: {
            name: values.name,
            type: values.type,
            institution: values.institution || null,
          },
          throwOnError: false,
        }),
      ),
    onSuccess: async (account) => {
      toast.success(`Compte « ${account.name} » créé`)
      await queryClient.invalidateQueries({ queryKey: importKeys.accounts })
      onCreated?.(account)
    },
    onError: (error) => toast.error(genericErrorMessage(error)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LandmarkIcon className="text-muted-foreground size-4" />
          Créez votre premier compte
        </CardTitle>
        <CardDescription>
          Les opérations importées sont rattachées à un compte courant ou à un
          livret.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
        >
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="account-name">Nom du compte</FieldLabel>
            <Input
              id="account-name"
              aria-invalid={!!errors.name}
              {...form.register('name')}
            />
            {errors.name && <FieldError>{errors.name.message}</FieldError>}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="account-type">Type</FieldLabel>
              <NativeSelect
                id="account-type"
                className="w-full"
                {...form.register('type')}
              >
                <NativeSelectOption value="checking">
                  Compte courant
                </NativeSelectOption>
                <NativeSelectOption value="savings">
                  Livret d’épargne
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field data-invalid={!!errors.institution}>
              <FieldLabel htmlFor="account-institution">Banque</FieldLabel>
              <Input
                id="account-institution"
                aria-invalid={!!errors.institution}
                {...form.register('institution')}
              />
              {errors.institution && (
                <FieldError>{errors.institution.message}</FieldError>
              )}
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={create.isPending}>
              Créer le compte
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
