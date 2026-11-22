import { headerKey } from '#/imports/crypto/parsers/common'
import { type CsvRecord, isBlankRecord, readCsv } from '#/imports/history/csv'
import { decodeWindows1252 } from '#/imports/parsers/windows-1252'
import {
  CSV_DELIMITERS,
  type CsvDelimiter,
  type CsvEncoding,
} from './profile.types'

/**
 * Thrown when a file cannot be read as the expected CSV at all (empty, not
 * decodable, a mapped column missing from the header). Problems on single
 * lines are never thrown: they are `ParseIssue`s. The message names columns
 * only, never cells, so it is safe to log and to show.
 */
export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsvFormatError'
  }
}

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const

export interface CsvTable {
  encoding: CsvEncoding
  delimiter: CsvDelimiter
  /** The first non-blank record. */
  header: CsvRecord
  /** Header fields normalized with `headerKey`. */
  headerKeys: string[]
  /** Non-blank records after the header, in file order. */
  records: CsvRecord[]
  /** Lines whose quoted field is never closed (reported, never read). */
  unterminatedLines: number[]
}

/**
 * Decodes `bytes`: `encoding` when given, else UTF-8 when they are valid
 * UTF-8 (a BOM is dropped) and Windows-1252 otherwise.
 */
export function decodeCsv(
  bytes: Buffer,
  encoding: CsvEncoding | null,
): { text: string; encoding: CsvEncoding } {
  const hasBom =
    bytes.length >= 3 && UTF8_BOM.every((byte, i) => bytes[i] === byte)
  if (encoding === 'windows-1252' && !hasBom) {
    return { text: decodeWindows1252(bytes), encoding }
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text, encoding: 'utf-8' }
  } catch {
    if (encoding === 'utf-8' || hasBom) {
      throw new CsvFormatError('The file is not valid UTF-8')
    }
    return { text: decodeWindows1252(bytes), encoding: 'windows-1252' }
  }
}

/**
 * The delimiter of a header line: the candidate splitting it into the most
 * fields outside quotes (`;` first on a tie, the CIC's and the French one).
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const firstLine =
    text
      .replace(/^﻿/, '')
      .split(/\r\n|\r|\n/)
      .find((line) => line.trim() !== '') ?? ''
  let best: CsvDelimiter = ';'
  let bestCount = 0
  for (const delimiter of CSV_DELIMITERS) {
    const count = countOutsideQuotes(firstLine, delimiter)
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

function countOutsideQuotes(line: string, char: string): number {
  let count = 0
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === char && !inQuotes) count++
  }
  return count
}

/**
 * Reads `bytes` as a table: decoded, split on the delimiter (detected when
 * null), the first non-blank record as the header.
 *
 * @throws {CsvFormatError} when the file is empty or not decodable.
 */
export function readCsvTable(
  bytes: Buffer,
  options: { encoding: CsvEncoding | null; delimiter: CsvDelimiter | null },
): CsvTable {
  const { text, encoding } = decodeCsv(bytes, options.encoding)
  const delimiter = options.delimiter ?? detectDelimiter(text)
  const { records, unterminatedLines } = readCsv(text, delimiter)
  const nonBlank = records.filter((record) => !isBlankRecord(record))
  const header = nonBlank[0]
  if (!header) throw new CsvFormatError('The file is empty')
  if (unterminatedLines.some((line) => line <= header.lineNumber)) {
    throw new CsvFormatError('The header has an unterminated quoted field')
  }
  return {
    encoding,
    delimiter,
    header,
    headerKeys: header.fields.map(headerKey),
    records: nonBlank.slice(1),
    unterminatedLines,
  }
}

/**
 * The header's columns that `used` does not read, by their name in the file
 * (blank names, such as a trailing separator's, are left out).
 */
export function unusedColumns(table: CsvTable, used: Set<number>): string[] {
  return table.header.fields
    .map((name, index) => ({ name: name.trim(), index }))
    .filter(({ name, index }) => name !== '' && !used.has(index))
    .map(({ name }) => name)
}
