import { createIsomorphicFn } from '@tanstack/react-start'
import { createContext, useContext } from 'react'

/**
 * Which deployment this web server is (#454). Staging (#421) runs the same
 * images as production, so the difference is a runtime variable of the web
 * service, `APP_ENVIRONMENT=staging` (`docker-compose.staging.yml`), read on
 * the server only. Anything else, unset included (production, dev), is
 * production: production never needs the variable.
 */
export type AppEnvironment = 'production' | 'staging'

export function parseAppEnvironment(
  value: string | null | undefined,
): AppEnvironment {
  return value?.trim().toLowerCase() === 'staging' ? 'staging' : 'production'
}

/**
 * Attribute of `<html>` carrying the environment the server rendered
 * (`routes/__root.tsx`), which the client reads back: no request, so it also
 * holds offline and after `router.invalidate()`.
 */
export const ENVIRONMENT_ATTRIBUTE = 'data-environment'

export const readAppEnvironment = createIsomorphicFn()
  .server(() => parseAppEnvironment(process.env['APP_ENVIRONMENT']))
  .client(() =>
    parseAppEnvironment(
      document.documentElement.getAttribute(ENVIRONMENT_ATTRIBUTE),
    ),
  )

const AppEnvironmentContext = createContext<AppEnvironment>('production')

/** Set once in `routes/__root.tsx`; production when absent (tests). */
export const AppEnvironmentProvider = AppEnvironmentContext.Provider

export function useAppEnvironment(): AppEnvironment {
  return useContext(AppEnvironmentContext)
}
