/**
 * The app was named « Finances » until #464 and its localStorage keys began
 * with `finances.`; they begin with `capi.` now. Reads go through here so a
 * value saved under the old key is moved to the new one the first time it is
 * read, instead of being lost. Storage errors are left to the caller, which
 * already guards every access (private mode, blocked storage).
 */
export function getMovedItem(key: string, legacyKey: string): string | null {
  const value = localStorage.getItem(key)
  if (value !== null) return value
  const legacy = localStorage.getItem(legacyKey)
  if (legacy === null) return null
  localStorage.setItem(key, legacy)
  localStorage.removeItem(legacyKey)
  return legacy
}
