import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { UserRoundIcon } from 'lucide-react'
import { Button } from '@capi/ui'
import { authControllerDemoSignIn } from '#/api'
import { useAuth } from '#/lib/auth-context'
import { demoSignInIsAutomatic, forgetSignedOut } from '#/lib/demo-sign-in'
import { postLoginReturnPath } from '#/lib/post-login'
import { ROUTES } from '#/lib/routes'

/**
 * The demo sign-in of a pull request preview (#608, only rendered when the
 * API offers it): signs the demo account in as soon as the page opens, then
 * goes to the dashboard. Right after « Se déconnecter » it waits for a tap
 * on the button instead, so the form can be tested too.
 */
export function DemoSignIn() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [state, setState] = useState<'idle' | 'pending' | 'failed'>('idle')
  /** One automatic attempt per page, even when effects run twice. */
  const started = useRef(false)

  const signIn = useCallback(async () => {
    setState('pending')
    const res = await authControllerDemoSignIn({ throwOnError: false })
    if (res.error !== undefined || !res.response?.ok) {
      setState('failed')
      return
    }
    forgetSignedOut()
    await refresh()
    const back = postLoginReturnPath()
    await (back ? navigate({ href: back }) : navigate({ to: ROUTES.dashboard }))
  }, [navigate, refresh])

  useEffect(() => {
    if (started.current || !demoSignInIsAutomatic()) return
    started.current = true
    void signIn()
  }, [signIn])

  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <Button
        type="button"
        fullWidth
        loading={state === 'pending'}
        iconStart={<UserRoundIcon aria-hidden />}
        onClick={() => void signIn()}
      >
        Compte démo
      </Button>
      {state === 'failed' && (
        <p role="alert" className="text-destructive text-sm">
          Connexion au compte démo impossible.
        </p>
      )}
    </div>
  )
}
