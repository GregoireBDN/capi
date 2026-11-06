/**
 * Registers `/sw.js` (emitted by `plugins/service-worker.ts` in production
 * builds only) and reports waiting updates.
 *
 * Update policy: a new worker waits until the user accepts the "Nouvelle
 * version disponible" toast, then takes over and every open page reloads.
 * Activating it behind the user's back (skipWaiting on install) would delete
 * the previous precache while an old page may still lazy-load chunks that the
 * new deploy no longer serves.
 */

export const SERVICE_WORKER_URL = '/sw.js'

/** Only in production builds, on secure contexts (localhost counts). */
export function shouldRegisterServiceWorker(env: {
  production: boolean
  secureContext: boolean
  supported: boolean
}): boolean {
  return env.production && env.secureContext && env.supported
}

/** Re-check for a new version at most this often when the app is reopened. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export interface ServiceWorkerHandlers {
  /** A new version is installed and waiting; call `activate` to switch. */
  onUpdateReady: (activate: () => void) => void
}

export async function registerServiceWorker({
  onUpdateReady,
}: ServiceWorkerHandlers): Promise<void> {
  const shouldRegister = shouldRegisterServiceWorker({
    production: import.meta.env.PROD,
    secureContext: window.isSecureContext,
    supported: 'serviceWorker' in navigator,
  })
  if (!shouldRegister) return

  const container = navigator.serviceWorker
  // A page already controlled is running the previous version: reload it when
  // the new worker takes over. On the very first install `clients.claim()`
  // also fires `controllerchange`, which must not reload.
  const wasControlled = container.controller !== null
  let reloading = false
  container.addEventListener('controllerchange', () => {
    if (!wasControlled || reloading) return
    reloading = true
    window.location.reload()
  })

  const registration = await container.register(SERVICE_WORKER_URL, {
    scope: '/',
  })

  const notify = (worker: ServiceWorker | null) => {
    // Without a controller this is the first install, not an update.
    if (!worker || !container.controller) return
    onUpdateReady(() => worker.postMessage({ type: 'SKIP_WAITING' }))
  }

  notify(registration.waiting)
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') notify(installing)
    })
  })

  // An installed PWA can stay open for days without a full navigation.
  let lastCheck = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return
    lastCheck = Date.now()
    registration.update().catch(() => {})
  })
}
