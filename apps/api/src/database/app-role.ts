import type postgres from 'postgres'

/**
 * The role the API connects as (ADR 0009, #557): no superuser, no
 * `BYPASSRLS`, not the tables' owner, so row-level security applies to
 * every query it makes. Migrations and seeds keep the owner role.
 */
export const APP_ROLE = 'capi_app'

/**
 * Creates `capi_app` when missing and grants it what the API needs on every
 * table, sequence and function of `public` (rows only: no `TRUNCATE`, no
 * DDL), now and for what later migrations create. With `password`, the role
 * may sign in with it; without, it exists without a password (dev, specs:
 * reached through `SET ROLE`). Idempotent: `migrate.ts` runs it on every
 * deploy. Run as the owner role.
 */
export async function ensureAppRole(
  sql: postgres.Sql,
  password?: string,
): Promise<void> {
  await sql.unsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        CREATE ROLE ${APP_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      END IF;
    END $$
  `)
  // DDL takes no bound parameters: the password as a quoted literal.
  await sql.unsafe(
    password
      ? `ALTER ROLE ${APP_ROLE} LOGIN NOBYPASSRLS PASSWORD '${password.replaceAll("'", "''")}'`
      : `ALTER ROLE ${APP_ROLE} NOBYPASSRLS`,
  )
  for (const statement of [
    `GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`,
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${APP_ROLE}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO ${APP_ROLE}`,
  ]) {
    await sql.unsafe(statement)
  }
}
