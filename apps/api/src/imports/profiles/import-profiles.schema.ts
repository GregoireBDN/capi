import { sql } from 'drizzle-orm'
import {
  check,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'
import { coreColumns } from '#/database/schema/core.schema'
import {
  IMPORT_PROFILE_TARGETS,
  type InvestmentMovementKind,
} from '#/database/schema/domain-enums'
import {
  CSV_DELIMITERS,
  CSV_ENCODINGS,
  DATE_FORMATS,
  DECIMAL_SEPARATORS,
} from './profile.types'

export const importProfileTargetEnum = pgEnum(
  'import_profile_target',
  IMPORT_PROFILE_TARGETS,
)

/**
 * `'a', 'b'` for an `IN (…)` check (constants of the code); `;` and tab are
 * written `chr(59)` / `chr(9)`, since the migration generator splits on `;`.
 */
const sqlList = (values: readonly string[]) =>
  sql.raw(
    values
      .map((v) =>
        /^[\w./-]+$/.test(v) || v === ','
          ? `'${v}'`
          : `chr(${v.codePointAt(0)})`,
      )
      .join(', '),
  )

/**
 * How to read the CSV files of one source (#431, ADR 0007): which column is
 * which, the date layout, the decimal mark, the encoding and the separator.
 * Recognised from the file's header (`headers`, normalized with
 * `headerKey`), created from an unknown file in the import preview. Holds
 * column names only, never a file's rows.
 *
 * Database rules: the settings among the known values, `columns` (field →
 * header key) naming only fields of its target and columns of its header,
 * each column once, the required fields there (`import_profile_columns_valid`,
 * migration 0047); `kind_values` on investment profiles only, mapping to the
 * standard kinds; one profile per header and separator.
 */
export const importProfilesTable = pgTable(
  'import_profiles',
  {
    ...coreColumns,
    name: varchar('name', { length: 100 }).notNull(),
    target: importProfileTargetEnum('target').notNull(),
    encoding: varchar('encoding', { length: 20 }).notNull(),
    delimiter: varchar('delimiter', { length: 1 }).notNull(),
    decimalSeparator: varchar('decimal_separator', { length: 1 }).notNull(),
    dateFormat: varchar('date_format', { length: 10 }).notNull(),
    headers: text('headers').array().notNull(),
    columns: jsonb('columns').$type<Record<string, string>>().notNull(),
    kindValues:
      jsonb('kind_values').$type<Record<string, InvestmentMovementKind>>(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [
    unique('import_profiles_header_unique').on(t.delimiter, t.headers),
    check('import_profiles_name_not_blank', sql`btrim(${t.name}) <> ''`),
    check(
      'import_profiles_encoding_known',
      sql`${t.encoding} IN (${sqlList(CSV_ENCODINGS)})`,
    ),
    check(
      'import_profiles_delimiter_known',
      sql`${t.delimiter} IN (${sqlList(CSV_DELIMITERS)})`,
    ),
    check(
      'import_profiles_decimal_separator_known',
      sql`${t.decimalSeparator} IN (${sqlList(DECIMAL_SEPARATORS)})`,
    ),
    check(
      'import_profiles_date_format_known',
      sql`${t.dateFormat} IN (${sqlList(DATE_FORMATS)})`,
    ),
    check(
      'import_profiles_headers_size',
      sql`cardinality(${t.headers}) BETWEEN 1 AND 200`,
    ),
    check(
      'import_profiles_columns_valid',
      sql`import_profile_columns_valid(${t.target}::text, ${t.columns}, ${t.headers})`,
    ),
    check(
      'import_profiles_kind_values_valid',
      sql`${t.kindValues} IS NULL OR (${t.target} = 'investment' AND import_profile_kind_values_valid(${t.kindValues}))`,
    ),
  ],
)

export type SelectImportProfile = typeof importProfilesTable.$inferSelect
export type InsertImportProfile = typeof importProfilesTable.$inferInsert
