import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  MailCheckIcon,
  RefreshCwIcon,
} from 'lucide-react'
import {
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@finances/ui'
import { authControllerResendVerification } from '#/api'
import { isRateLimited, rateLimitMessage } from '#/lib/api-errors'
import { ROUTES } from '#/lib/routes'

/** Reminder shown to a signed-in user whose email is not verified yet. */
export function VerifyEmailCard({ email }: { email: string }) {
  const [resending, setResending] = useState(false)
  const [sent, setSent] = useState(false)

  async function onResend() {
    setResending(true)
    const res = await authControllerResendVerification({ throwOnError: false })
    setResending(false)
    if (res.error) {
      toast.error(
        isRateLimited(res.response)
          ? rateLimitMessage(res.response)
          : "Impossible d'envoyer l'email",
      )
      return
    }
    setSent(true)
    toast.success('Email renvoyé avec succès')
  }

  return (
    <Card>
      <CardHeader className="flex flex-col items-start gap-3 sm:flex-row">
        <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
          <MailCheckIcon className="size-5" />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-base">
            Vérifiez votre adresse email
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Un lien de confirmation a été envoyé à{' '}
            <span className="text-foreground font-medium">{email}</span>.
            Cliquez dessus pour activer l&apos;ensemble des fonctionnalités de
            votre compte.
          </CardDescription>
        </div>
      </CardHeader>

      <CardFooter className="flex-wrap gap-2">
        {sent ? (
          <div className="text-success flex items-center gap-2 text-sm font-medium">
            <CheckCircle2Icon className="size-4" />
            Email renvoyé. Pensez à vérifier vos spams.
          </div>
        ) : (
          <>
            <Button onClick={onResend} loading={resending} size="sm">
              <RefreshCwIcon className="size-4" />
              Renvoyer le lien
            </Button>
            <Button asChild variant="secondary" ghost size="sm">
              <Link to={ROUTES.verifyEmail}>
                J&apos;ai reçu l&apos;email
                <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
