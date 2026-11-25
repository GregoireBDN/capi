/**
 * The app was named « Finances » until #464: its MCP variables were
 * `FINANCES_API_URL` / `FINANCES_API_TOKEN`. They are `CAPI_*` now, and the
 * old names are still read when the new one is unset, so an existing Claude
 * Desktop or compose configuration keeps working.
 */
export function readEnv(
  env: NodeJS.ProcessEnv,
  name: 'CAPI_API_URL' | 'CAPI_API_TOKEN',
): string | undefined {
  const value = env[name]?.trim()
  if (value) return value
  return env[name.replace(/^CAPI_/, 'FINANCES_')]?.trim() || undefined
}
