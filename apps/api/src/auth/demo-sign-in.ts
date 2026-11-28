import {
  databaseNameOf,
  PROTECTED_DATABASE_NAMES,
  STAGING_DATABASE_PATTERN,
} from '#/database/demo/guard'

/**
 * The demo sign-in of the pull request previews (#608): the sign-in page
 * signs in the demo account (`usertest@finances.test`, whose password is
 * public) without typing anything, so a preview opens on the dashboard.
 *
 * It exists only where the demo seed may write and the owner asked for it,
 * both at once:
 * - `DEMO_AUTO_SIGN_IN=true`, which only `docker-compose.preview.yml` sets
 *   (from the previews' settings panel);
 * - the API's database is the `_staging` one named by
 *   `DEMO_STAGING_DATABASE`, never `finances`, the demo seed's own rule
 *   (`database/demo/guard.ts`), whatever `NODE_ENV` says.
 * Production has neither (database `finances`, no `DEMO_STAGING_DATABASE`):
 * there the route answers 404 like any unknown path.
 */
export interface DemoSignInConfig {
  /** `DEMO_AUTO_SIGN_IN` */
  enabled: boolean
  /** `DATABASE_URL` */
  databaseUrl: string
  /** `DEMO_STAGING_DATABASE` */
  stagingDatabase: string | undefined
}

export function demoSignInAllowed({
  enabled,
  databaseUrl,
  stagingDatabase,
}: DemoSignInConfig): boolean {
  if (!enabled || !stagingDatabase) return false
  const name = databaseNameOf(databaseUrl)
  return (
    name !== '' &&
    name === stagingDatabase &&
    STAGING_DATABASE_PATTERN.test(name) &&
    !PROTECTED_DATABASE_NAMES.has(name.toLowerCase())
  )
}
