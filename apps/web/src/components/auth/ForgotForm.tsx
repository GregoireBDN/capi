import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheckIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { authControllerForgotPassword } from '#/api'
import { isRateLimited, rateLimitMessage } from '#/lib/api-errors'
import { forgotSchema } from './auth.schemas'
import type { ForgotValues } from './auth.schemas'
import { Button, Field, FieldError, FieldLabel, Input } from '@capi/ui'
import { useHydrated } from '#/lib/use-hydrated'

export function ForgotForm() {
  const [sent, setSent] = useState(false)

  const hydrated = useHydrated()
  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: ForgotValues) {
    const res = await authControllerForgotPassword({
      body: values,
      throwOnError: false,
    })
    if (isRateLimited(res.response)) {
      toast.error(rateLimitMessage(res.response))
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <span
          aria-hidden
          className="bg-primary/10 text-primary grid size-11 place-items-center rounded-full"
        >
          <MailCheckIcon className="size-5" />
        </span>
        <p className="text-muted-foreground text-sm text-balance">
          Si ce compte existe, le lien vient de partir par email.
        </p>
      </div>
    )
  }

  return (
    <form
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-3"
      noValidate
    >
      <Field data-invalid={!!form.formState.errors.email}>
        <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!form.formState.errors.email}
          {...form.register('email')}
        />
        {form.formState.errors.email && (
          <FieldError>{form.formState.errors.email.message}</FieldError>
        )}
      </Field>
      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={form.formState.isSubmitting}
        disabled={!hydrated}
      >
        Envoyer le lien
      </Button>
    </form>
  )
}
