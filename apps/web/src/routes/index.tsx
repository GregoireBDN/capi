import { createFileRoute } from '@tanstack/react-router'
import { redirectFromHome } from '#/lib/auth-guard'

// Single-user app: there is no public landing page. `/` only dispatches to the
// dashboard (signed in) or to the login page (signed out).
export const Route = createFileRoute('/')({
  beforeLoad: redirectFromHome,
})
