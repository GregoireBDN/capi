import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { authControllerResetPassword } from '#/api'
import { newPasswordField } from '#/components/auth/auth.schemas'
import { ROUTES } from '#/lib/routes'
import { AuthFooter, AuthFrame, AuthPanel } from '#/components/auth/AuthFrame'
import {
  Button,
  Checkbox,
  Field,
  FieldError,
  FieldLabel,
  Label,
  PasswordInput,
} from '@capi/ui'
import { useHydrated } from '#/lib/use-hydrated'

export const Route = createFileRoute('/reset-password')({
  validateSearch: z.object({ token: z.string().optional() }),
  component: ResetPasswordPage,
})

const resetSchema = z
  .object({
    password: newPasswordField,
    confirm: z.string().min(1, 'Confirmez le mot de passe'),
    revokeAccessTokens: z.boolean(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirm'],
  })

type ResetValues = z.infer<typeof resetSchema>

function ResetPasswordPage() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const [done, setDone] = useState(false)

  const hydrated = useHydrated()
  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '', revokeAccessTokens: false },
  })

  async function onSubmit(values: ResetValues) {
    if (!token) {
      toast.error('Lien invalide ou expiré')
      return
    }

    const res = await authControllerResetPassword({
      body: {
        token,
        password: values.password,
        revokeAccessTokens: values.revokeAccessTokens,
      },
      throwOnError: false,
    })

    if (res.error) {
      const message = getErrorMessage(res.error)
      toast.error(message)
      return
    }

    setDone(true)
    toast.success('Mot de passe mis à jour')
    setTimeout(() => navigate({ to: ROUTES.auth }), 2000)
  }

  if (!token) {
    return (
      <AuthFrame>
        <AuthPanel title="Lien invalide">
          <p className="text-muted-foreground text-center text-sm text-balance">
            Ce lien a expiré ou a déjà servi.
          </p>
          <Button asChild size="lg" fullWidth>
            <a href={ROUTES.auth}>Retour à la connexion</a>
          </Button>
        </AuthPanel>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame>
      <AuthPanel title="Nouveau mot de passe">
        {done ? (
          <p className="text-muted-foreground text-center text-sm py-4">
            Mot de passe mis à jour. Toutes vos sessions ont été fermées :
            reconnectez-vous. Redirection en cours…
          </p>
        ) : (
          <form
            method="post"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-3"
            noValidate
          >
            <Field data-invalid={!!form.formState.errors.password}>
              <FieldLabel htmlFor="new-password">Mot de passe</FieldLabel>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                aria-invalid={!!form.formState.errors.password}
                {...form.register('password')}
              />
              {form.formState.errors.password && (
                <FieldError>
                  {form.formState.errors.password.message}
                </FieldError>
              )}
            </Field>

            <Field data-invalid={!!form.formState.errors.confirm}>
              <FieldLabel htmlFor="confirm-password">Confirmer</FieldLabel>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                aria-invalid={!!form.formState.errors.confirm}
                {...form.register('confirm')}
              />
              {form.formState.errors.confirm && (
                <FieldError>{form.formState.errors.confirm.message}</FieldError>
              )}
            </Field>

            <Field>
              <div className="flex min-h-11 items-start gap-2 py-1">
                <Checkbox
                  id="revoke-access-tokens"
                  className="mt-0.5"
                  checked={form.watch('revokeAccessTokens')}
                  onCheckedChange={(value) =>
                    form.setValue('revokeAccessTokens', value === true)
                  }
                />
                <Label htmlFor="revoke-access-tokens" className="font-normal">
                  Déconnecter aussi Claude et les scripts
                </Label>
              </div>
            </Field>

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={form.formState.isSubmitting}
              disabled={!hydrated}
            >
              Enregistrer
            </Button>
          </form>
        )}
      </AuthPanel>
      <AuthFooter>
        <Button asChild variant="secondary" link size="xs">
          <a href={ROUTES.auth}>Retour à la connexion</a>
        </Button>
      </AuthFooter>
    </AuthFrame>
  )
}

/** French message for a refused reset (API messages stay untranslated). */
function getErrorMessage(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? error.message
      : undefined
  const messages = Array.isArray(message) ? message : [message]
  if (messages.includes('Invalid or expired token')) {
    return 'Lien invalide, expiré ou déjà utilisé. Demandez-en un nouveau.'
  }
  return 'Une erreur est survenue'
}
