import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'
import { DatabaseService } from '#/database/database.service'
import {
  importProfilesTable,
  type SelectImportProfile,
} from '#/database/schema'
import { headerKey } from '#/imports/crypto/parsers/common'
import { detectFormat, isBuiltInHeader } from './detect-format'
import type {
  CreateImportProfileDto,
  CsvInspectionDto,
  ImportProfileDto,
} from './dto/import-profile.dto'
import { inspectCsv } from './inspect'
import type { StoredCsvProfile } from './profile.types'
import { CsvFormatError } from './read-table'

/** Postgres unique violation. */
const UNIQUE_VIOLATION = '23505'

/**
 * Saved CSV import profiles (#431, ADR 0007): created from an unknown file
 * in the import preview, recognised from the header of the next files.
 * Never logs a file's content: errors name columns only.
 */
@Injectable()
export class ImportProfilesService {
  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.db
  }

  async list(): Promise<ImportProfileDto[]> {
    const rows = await this.db
      .select()
      .from(importProfilesTable)
      .orderBy(asc(importProfilesTable.name), asc(importProfilesTable.id))
    return rows.map(toDto)
  }

  /** Every saved profile, as the parsers read them. */
  async loadAll(): Promise<StoredCsvProfile[]> {
    const rows = await this.db.select().from(importProfilesTable)
    return rows.map(toStored)
  }

  async findStored(id: string): Promise<StoredCsvProfile> {
    const [row] = await this.db
      .select()
      .from(importProfilesTable)
      .where(eq(importProfilesTable.id, id))
    if (!row)
      throw new BadRequestException('profileId does not match any profile')
    return toStored(row)
  }

  /** Saves a cash profile for a header the app does not read yet. */
  async create(dto: CreateImportProfileDto): Promise<ImportProfileDto> {
    const values = cashProfileValues(dto)
    try {
      const [row] = await this.db
        .insert(importProfilesTable)
        .values(values)
        .returning()
      return toDto(row)
    } catch (error) {
      throw uniqueHeaderError(error)
    }
  }

  /**
   * Changes a cash profile's mapping (#433): from the import preview, when
   * its lines were read with the wrong columns. Same rules as `create`; the
   * imports made with it stay as they are.
   */
  async update(
    id: string,
    dto: CreateImportProfileDto,
  ): Promise<ImportProfileDto> {
    const values = cashProfileValues(dto)
    const [current] = await this.db
      .select({ target: importProfilesTable.target })
      .from(importProfilesTable)
      .where(eq(importProfilesTable.id, id))
    if (!current) throw new NotFoundException('Profile not found')
    if (current.target !== 'cash') {
      throw new BadRequestException('Only a bank profile can be changed here')
    }
    try {
      const [row] = await this.db
        .update(importProfilesTable)
        .set(values)
        .where(eq(importProfilesTable.id, id))
        .returning()
      return toDto(row)
    } catch (error) {
      throw uniqueHeaderError(error)
    }
  }

  async remove(id: string): Promise<void> {
    const removed = await this.db
      .delete(importProfilesTable)
      .where(eq(importProfilesTable.id, id))
      .returning({ id: importProfilesTable.id })
    if (removed.length === 0) throw new NotFoundException('Profile not found')
  }

  /** Header, first lines and a guessed mapping of a file; saves nothing. */
  async inspect(buffer: Buffer): Promise<CsvInspectionDto> {
    let inspection
    try {
      inspection = inspectCsv(buffer)
    } catch (error) {
      if (error instanceof CsvFormatError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }
    const detected = detectFormat(buffer, await this.loadAll())
    return {
      ...inspection,
      recognised: detected
        ? {
            source: detected.source,
            profileId:
              detected.source === 'csv_profile' ? detected.profile.id : null,
            profileName:
              detected.source === 'csv_profile' ? detected.profile.name : null,
          }
        : null,
    }
  }
}

function toStored(row: SelectImportProfile): StoredCsvProfile {
  return {
    id: row.id,
    name: row.name,
    target: row.target,
    encoding: row.encoding as StoredCsvProfile['encoding'],
    delimiter: row.delimiter as StoredCsvProfile['delimiter'],
    decimalSeparator:
      row.decimalSeparator as StoredCsvProfile['decimalSeparator'],
    dateFormat: row.dateFormat as StoredCsvProfile['dateFormat'],
    headers: row.headers,
    columns: row.columns,
    kindValues: row.kindValues,
  }
}

/**
 * The stored values of a cash profile: header keys, each mapped column in
 * the header once, an amount or both debit and credit.
 */
function cashProfileValues(dto: CreateImportProfileDto) {
  const headers = dto.headers.map(headerKey)
  while (headers.length > 0 && headers[headers.length - 1] === '') {
    headers.pop()
  }
  if (isBuiltInHeader(headers)) {
    throw new BadRequestException(
      'This header is already read without a profile (CIC export or standard format)',
    )
  }
  const columns: Record<string, string> = {}
  const used = new Set<string>()
  for (const [field, name] of Object.entries(dto.columns)) {
    if (name === undefined) continue
    const key = headerKey(name)
    if (!headers.includes(key)) {
      throw new BadRequestException(`columns.${field} is not in the header`)
    }
    if (used.has(key)) {
      throw new BadRequestException(`columns.${field} is already mapped`)
    }
    if (headers.filter((h) => h === key).length > 1) {
      throw new BadRequestException(
        `columns.${field} names a column the header has twice`,
      )
    }
    used.add(key)
    columns[field] = key
  }
  const hasAmount = columns.amount !== undefined
  const hasDebit = columns.debit !== undefined
  const hasCredit = columns.credit !== undefined
  if (hasAmount ? hasDebit || hasCredit : !(hasDebit && hasCredit)) {
    throw new BadRequestException(
      'Map either an amount column, or both a debit and a credit column',
    )
  }
  return {
    name: dto.name.trim(),
    target: 'cash' as const,
    encoding: dto.encoding,
    delimiter: dto.delimiter,
    decimalSeparator: dto.decimalSeparator,
    dateFormat: dto.dateFormat,
    headers,
    columns,
  }
}

/** A unique violation on the header becomes a 409. */
function uniqueHeaderError(error: unknown): unknown {
  const code = (error as { cause?: { code?: unknown } }).cause?.code
  return code === UNIQUE_VIOLATION
    ? new ConflictException('A profile already reads this header')
    : error
}

function toDto(row: SelectImportProfile): ImportProfileDto {
  const stored = toStored(row)
  return {
    id: stored.id,
    name: stored.name,
    target: stored.target,
    encoding: stored.encoding,
    delimiter: stored.delimiter,
    decimalSeparator: stored.decimalSeparator,
    dateFormat: stored.dateFormat,
    headers: stored.headers,
    columns: row.columns,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  }
}
