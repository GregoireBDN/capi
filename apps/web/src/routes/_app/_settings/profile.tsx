import { createFileRoute, redirect } from '@tanstack/react-router'
import { ROUTES } from '#/lib/routes'

/** The former Profil page is now Réglages (#300): old links and bookmarks land there. */
export const Route = createFileRoute('/_app/_settings/profile')({
  beforeLoad: () => {
    throw redirect({ to: ROUTES.settings, replace: true, statusCode: 301 })
  },
})
