import { useEffect } from 'react'
import { toast } from 'sonner'
import { registerServiceWorker } from '#/lib/pwa/service-worker-registration'

/**
 * Registers the service worker (production builds only) and offers to reload
 * when a new version is ready. Renders nothing.
 */
export function ServiceWorkerUpdates() {
  useEffect(() => {
    registerServiceWorker({
      onUpdateReady: (activate) => {
        toast('Nouvelle version disponible', {
          id: 'sw-update',
          duration: Infinity,
          action: { label: 'Recharger', onClick: activate },
        })
      },
    }).catch((error: unknown) => {
      console.warn('Service worker registration failed', error)
    })
  }, [])

  return null
}
