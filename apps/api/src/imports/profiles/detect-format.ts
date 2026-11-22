import { headerKey } from '#/imports/crypto/parsers/common'
import type { CsvProfile, StoredCsvProfile } from './profile.types'
import { readCsvTable } from './read-table'
import { standardProfileFor } from './standard-format'

/**
 * Which reader a CSV file is for (#431): the CIC export, the standard
 * format, or a saved profile whose header is exactly the file's. Pure.
 */
export type DetectedFormat =
  | { source: 'cic_csv' }
  | { source: 'standard_csv'; profile: CsvProfile }
  | { source: 'csv_profile'; profile: StoredCsvProfile }

/** Header keys of the CIC export that tell it apart (`Débit` and `Crédit`). */
const CIC_KEYS = ['date', 'debit', 'credit', 'libelle'] as const

/** Trailing blank names (a trailing separator) do not count. */
export function trimHeaderKeys(keys: string[]): string[] {
  const out = [...keys]
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

export function sameHeader(a: string[], b: string[]): boolean {
  const x = trimHeaderKeys(a)
  const y = trimHeaderKeys(b)
  return x.length === y.length && x.every((key, i) => key === y[i])
}

/** Header keys of `bytes` read with the given options, or null if unreadable. */
function headerKeysOf(
  bytes: Buffer,
  options: Pick<CsvProfile, 'encoding' | 'delimiter'>,
): string[] | null {
  try {
    return readCsvTable(bytes, options).headerKeys
  } catch {
    return null
  }
}

/**
 * The format of `bytes`, or null when none is recognised. A saved profile is
 * looked for first, so a header the owner mapped by hand keeps its mapping;
 * then the CIC export, then the standard formats.
 */
export function detectFormat(
  bytes: Buffer,
  profiles: StoredCsvProfile[],
): DetectedFormat | null {
  for (const profile of profiles) {
    const keys = headerKeysOf(bytes, profile)
    if (keys && sameHeader(keys, profile.headers)) {
      return { source: 'csv_profile', profile }
    }
  }
  const semicolon = headerKeysOf(bytes, { encoding: null, delimiter: ';' })
  if (semicolon && CIC_KEYS.every((key) => semicolon.includes(key))) {
    return { source: 'cic_csv' }
  }
  const keys = headerKeysOf(bytes, { encoding: null, delimiter: null })
  const standard = keys ? standardProfileFor(keys) : null
  return standard ? { source: 'standard_csv', profile: standard } : null
}

/** Whether header names (as in the file) are read without a saved profile. */
export function isBuiltInHeader(headerKeys: string[]): boolean {
  const keys = headerKeys.map(headerKey)
  return (
    CIC_KEYS.every((key) => keys.includes(key)) ||
    standardProfileFor(keys) !== null
  )
}
