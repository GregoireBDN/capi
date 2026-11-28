import {
  authControllerResendVerification,
  authControllerVerifyEmail,
} from '#/api'
import { isRateLimited, rateLimitMessage } from '#/lib/api-errors'
import { useAuth } from '#/lib/auth-context'
import { ROUTES } from '#/lib/routes'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { AuthFrame, AuthPanel } from '#/components/auth/AuthFrame'
import { Button, Spinner, cn } from '@capi/ui'
import {
  CheckCircle2Icon,
  MailIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

export const Route = createFileRoute('/verify-email')({
  validateSearch: z.object({ token: z.string().optional() }),
  component: VerifyEmailPage,
})

type Status = 'idle' | 'loading' | 'success' | 'error'

function VerifyEmailPage() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [status, setStatus] = useState<Status>(token ? 'loading' : 'idle')
  const [resending, setResending] = useState(false)
  const [resendSent, setResendSent] = useState(false)

  useEffect(() => {
    if (!token) return

    authControllerVerifyEmail({ body: { token }, throwOnError: false })
      .then((res) => {
        setStatus(res.error ? 'error' : 'success')
      })
      .catch(() => setStatus('error'))
  }, [token])

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
    setResendSent(true)
  }

  if (status === 'loading') {
    return (
      <AuthFrame>
        <AuthPanel title="Vérification…">
          <div className="flex justify-center py-2">
            <Spinner />
          </div>
        </AuthPanel>
      </AuthFrame>
    )
  }

  const home = (
    <Button asChild size="lg" fullWidth>
      <Link to={ROUTES.home}>Retour à l&apos;accueil</Link>
    </Button>
  )
  const resend =
    user &&
    (resendSent ? (
      <p className="text-success-foreground bg-success/15 flex items-center justify-center gap-2 rounded-control px-3 py-2 text-sm font-medium">
        <CheckCircle2Icon aria-hidden className="size-4" />
        Nouvel email envoyé
      </p>
    ) : (
      <Button
        variant="secondary"
        ghost
        size="lg"
        fullWidth
        onClick={onResend}
        loading={resending}
      >
        <RefreshCwIcon />
        Renvoyer l&apos;email
      </Button>
    ))

  if (status === 'success') {
    return (
      <AuthFrame>
        <AuthPanel>
          <StatusIcon tone="success">
            <CheckCircle2Icon />
          </StatusIcon>
          <h1 className="font-heading text-center text-lg font-semibold">
            Email vérifié
          </h1>
          <Button
            size="lg"
            fullWidth
            onClick={() => navigate({ to: ROUTES.home })}
          >
            Continuer
          </Button>
        </AuthPanel>
      </AuthFrame>
    )
  }

  if (status === 'error') {
    return (
      <AuthFrame>
        <AuthPanel>
          <StatusIcon tone="danger">
            <TriangleAlertIcon />
          </StatusIcon>
          <h1 className="font-heading text-center text-lg font-semibold">
            Lien invalide
          </h1>
          <p className="text-muted-foreground text-center text-sm text-balance">
            Ce lien a expiré ou a déjà servi.
          </p>
          {resend}
          {home}
        </AuthPanel>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame>
      <AuthPanel>
        <StatusIcon tone="primary">
          <MailIcon />
        </StatusIcon>
        <h1 className="font-heading text-center text-lg font-semibold">
          Vérifiez votre email
        </h1>
        <p className="text-muted-foreground text-center text-sm text-balance">
          Ouvrez le lien reçu (pensez aux spams).
        </p>
        {resend}
        {home}
      </AuthPanel>
    </AuthFrame>
  )
}

/** The page's state at a glance: a round icon above the title. */
function StatusIcon({
  tone,
  children,
}: {
  tone: 'primary' | 'success' | 'danger'
  children: ReactNode
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'mx-auto grid size-12 place-items-center rounded-full [&_svg]:size-6',
        tone === 'primary' && 'bg-primary/10 text-primary',
        tone === 'success' && 'bg-success/20 text-success-foreground',
        tone === 'danger' && 'bg-destructive/10 text-destructive',
      )}
    >
      {children}
    </span>
  )
}
