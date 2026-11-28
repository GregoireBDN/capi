import { sql } from 'drizzle-orm'
import type { DatabaseTransaction } from './database.service'

type Executor = Pick<DatabaseTransaction, 'execute'>

/**
 * What would let the API read another user's rows (ADR 0009, #558): the
 * role it connects as bypasses row-level security (a superuser, `BYPASSRLS`,
 * or the tables' owner), or a private table (one whose `user_id` defaults to
 * `app_user_id()`) lacks `ENABLE` + `FORCE ROW LEVEL SECURITY` or its
 * `<table>_owner` policy. Names roles and tables only, never rows. Empty
 * when the lock holds; `main.ts` refuses to start in production otherwise.
 */
export async function rowSecurityProblems(db: Executor): Promise<string[]> {
  const problems: string[] = []
  const [role] = await db.execute<{
    name: string
    superuser: boolean
    bypass: boolean
    owned: number
  }>(sql`
    select r.rolname as name, r.rolsuper as superuser, r.rolbypassrls as bypass,
      (select count(*)::int from pg_tables t
        where t.schemaname = 'public' and t.tableowner = current_user) as owned
    from pg_roles r where r.rolname = current_user`)
  if (role.superuser) problems.push(`role ${role.name} is a superuser`)
  if (role.bypass) problems.push(`role ${role.name} has BYPASSRLS`)
  if (role.owned > 0)
    problems.push(`role ${role.name} owns ${role.owned} tables`)
  const tables = await db.execute<{ name: string; problem: string }>(sql`
    select c.relname as name,
      case
        when not c.relrowsecurity then 'row-level security disabled'
        when not c.relforcerowsecurity then 'row-level security not forced'
        else 'no owner policy'
      end as problem
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id'
    join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where c.relkind = 'r'
      and pg_get_expr(d.adbin, d.adrelid) like '%app_user_id()%'
      and not (
        c.relrowsecurity and c.relforcerowsecurity
        and exists (
          select 1 from pg_policy p
          where p.polrelid = c.oid and p.polname = c.relname || '_owner'
        )
      )
    order by c.relname`)
  for (const table of tables) problems.push(`${table.name}: ${table.problem}`)
  return problems
}
