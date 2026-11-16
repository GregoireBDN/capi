import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Label,
  PasswordInput,
} from '@finances/ui'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { LockKeyholeIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { authControllerChangePassword } from '#/api'
import { accessTokenKeys } from '#/components/access-tokens/queries'
import { changePasswordSchema } from '#/components/auth/auth.schemas'
import type { ChangePasswordValues } from '#/components/auth/auth.schemas'
import { ReauthSheet } from '#/components/auth/ReauthSheet'
import { ApiRequestError, unwrap } from '#/lib/queries'
import { needsReauth } from '#/lib/reauth'
import { useHydrated } from '#/lib/use-hydrated'

const WRONG_CURRENT_PASSWORD = 'Current password is incorrect'
const SAME_PASSWORD = 'New password must differ from the current one'

const emptyValues: ChangePasswordValues = {
  currentPassword: '',
  newPassword: '',
  confirm: '',
  revokeAccessTokens: false,
}

/**
 * Profile section: changes the password with the current one. The API also
 * wants a fresh session: when the last sign-in is too old, `ReauthSheet`
 * asks for the password or a passkey, then the same values are sent again.
 * Every other session is ended; this one stays signed in.
 */
export function ChangePasswordCard({ email }: { email: string }) {
  const id = useId()
  const queryClient = useQueryClient()
  const [reauthOpen, setReauthOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hydrated = useHydrated()
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: emptyValues,
  })
  const { errors, isSubmitting } = form.formState

  async function submit(values: ChangePasswordValues) {
    setError(null)
    try {
      await unwrap(
        authControllerChangePassword({
          body: {
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
            revokeAccessTokens: values.revokeAccessTokens,
          },
          throwOnError: false,
        }),
      )
    } catch (failure) {
      if (needsReauth(failure)) {
        setReauthOpen(true)
        return
      }
      const apiMessage =
        failure instanceof ApiRequestError ? failure.apiMessage : null
      if (apiMessage?.includes(WRONG_CURRENT_PASSWORD)) {
        form.setError('currentPassword', {
          message: 'Mot de passe actuel incorrect.',
        })
      } else if (apiMessage?.includes(SAME_PASSWORD)) {
        form.setError('newPassword', {
          message: 'Choisissez un mot de passe différent de l’actuel',
        })
      } else if (failure instanceof ApiRequestError && failure.status === 429) {
        setError('Trop de tentatives. Réessayez dans une minute.')
      } else if (
        failure instanceof ApiRequestError &&
        failure.status === null
      ) {
        setError('Connexion impossible. Vérifiez votre réseau et réessayez.')
      } else {
        setError('Le mot de passe n’a pas pu être changé. Réessayez.')
      }
      return
    }
    form.reset(emptyValues)
    toast.success(
      values.revokeAccessTokens
        ? 'Mot de passe changé. Vos autres sessions, vos jetons d’accès et vos applications connectées ont été révoqués.'
        : 'Mot de passe changé. Vos autres sessions ont été fermées.',
    )
    if (values.revokeAccessTokens) {
      await queryClient.invalidateQueries({ queryKey: accessTokenKeys.all })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockKeyholeIcon className="size-4 text-muted-foreground" />
          Mot de passe
        </CardTitle>
        <CardDescription>
          Changer de mot de passe ferme vos sessions sur les autres appareils ;
          celle-ci reste ouverte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          method="post"
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit(submit)}
        >
          {/* Lets the password manager match the account. */}
          <input
            type="email"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            hidden
          />
          <Field data-invalid={!!errors.currentPassword}>
            <FieldLabel htmlFor={`${id}-current`}>
              Mot de passe actuel
            </FieldLabel>
            <PasswordInput
              id={`${id}-current`}
              autoComplete="current-password"
              aria-invalid={!!errors.currentPassword}
              {...form.register('currentPassword')}
            />
            {errors.currentPassword && (
              <FieldError>{errors.currentPassword.message}</FieldError>
            )}
          </Field>
          <Field data-invalid={!!errors.newPassword}>
            <FieldLabel htmlFor={`${id}-new`}>Nouveau mot de passe</FieldLabel>
            <PasswordInput
              id={`${id}-new`}
              autoComplete="new-password"
              aria-invalid={!!errors.newPassword}
              {...form.register('newPassword')}
            />
            {errors.newPassword ? (
              <FieldError>{errors.newPassword.message}</FieldError>
            ) : (
              <FieldDescription>Au moins 12 caractères.</FieldDescription>
            )}
          </Field>
          <Field data-invalid={!!errors.confirm}>
            <FieldLabel htmlFor={`${id}-confirm`}>
              Confirmer le nouveau mot de passe
            </FieldLabel>
            <PasswordInput
              id={`${id}-confirm`}
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
              {...form.register('confirm')}
            />
            {errors.confirm && (
              <FieldError>{errors.confirm.message}</FieldError>
            )}
          </Field>
          <div className="flex min-h-11 items-start gap-2 py-1">
            <Checkbox
              id={`${id}-tokens`}
              className="mt-0.5"
              checked={form.watch('revokeAccessTokens')}
              onCheckedChange={(value) =>
                form.setValue('revokeAccessTokens', value === true)
              }
            />
            <Label htmlFor={`${id}-tokens`} className="font-normal">
              Révoquer aussi les jetons d’accès et les applications connectées
              (Claude, scripts)
            </Label>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              className="w-full sm:w-auto"
              loading={isSubmitting}
              disabled={!hydrated}
            >
              Changer le mot de passe
            </Button>
          </div>
        </form>
      </CardContent>

      <ReauthSheet
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        email={email}
        purpose="changer de mot de passe"
        continueLabel="Changer le mot de passe"
        continueDescription="Vous pouvez maintenant changer le mot de passe."
        onContinue={() => {
          setReauthOpen(false)
          void form.handleSubmit(submit)()
        }}
      />
    </Card>
  )
}
