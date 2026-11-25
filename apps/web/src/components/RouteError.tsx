import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { TriangleAlert, WifiOff } from 'lucide-react'
import { Button } from '@capi/ui'
import { isNetworkError } from '#/lib/network-error'

/**
 * Router error component (`defaultErrorComponent`): shown when a route guard
 * or loader fails, e.g. an in-app navigation while the phone is offline (the
 * service worker's `offline.html` only covers full page loads).
 *
 * "Réessayer" re-runs the guards and loaders of the requested page
 * (`router.invalidate()` also resets this boundary). For a network error it
 * also retries by itself when the browser comes back online. The error's own
 * message is never shown: it is in English and may come from the API.
 */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  const offline = isNetworkError(error)

  const retry = () => {
    setRetrying(true)
    void router.invalidate().finally(() => {
      setRetrying(false)
    })
  }

  useEffect(() => {
    if (!offline) return
    const onOnline = () => {
      void router.invalidate()
    }
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
    }
  }, [offline, router])

  const Icon = offline ? WifiOff : TriangleAlert

  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">
        {offline ? 'Hors ligne' : 'Une erreur est survenue'}
      </h1>
      <p className="max-w-[22rem] text-muted-foreground">
        {offline
          ? 'Reconnectez-vous pour voir vos finances. La page se rechargera dès le retour du réseau.'
          : 'Cette page n’a pas pu se charger.'}
      </p>
      <Button type="button" onClick={retry} disabled={retrying}>
        Réessayer
      </Button>
    </div>
  )
}
