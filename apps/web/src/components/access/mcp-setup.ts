/**
 * The ready-to-paste setup of the local MCP server (#329): the Claude
 * Desktop config, the `claude mcp add` command and a script example, filled
 * with the app's URL and the token just created (`apps/mcp/README.md`).
 * The token only lives in the strings returned here: never stored, never
 * logged.
 */

export interface McpSetup {
  /** The app origin: the web server proxies `/api/*` with the bearer token. */
  apiUrl: string
  token: string
  /** Absolute path of `apps/mcp/dist/index.js` on the owner's Mac. */
  serverPath: string
}

/** Shown in the snippets until the owner gives the real path. */
export const SERVER_PATH_PLACEHOLDER =
  '/chemin/vers/finances/apps/mcp/dist/index.js'

/** `claude_desktop_config.json`, the whole file. */
export function desktopConfig({ apiUrl, token, serverPath }: McpSetup): string {
  return JSON.stringify(
    {
      mcpServers: {
        finances: {
          command: 'node',
          args: [serverPath],
          env: { FINANCES_API_URL: apiUrl, FINANCES_API_TOKEN: token },
        },
      },
    },
    null,
    2,
  )
}

/** A word for a POSIX shell: as is when safe, else single-quoted. */
export function shellQuote(value: string): string {
  if (/^[\w@%+=:,./-]+$/.test(value)) return value
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/** `claude mcp add` for the user scope (outside any repository). */
export function claudeCodeCommand({
  apiUrl,
  token,
  serverPath,
}: McpSetup): string {
  return [
    'claude mcp add finances --scope user',
    `  -e ${shellQuote(`FINANCES_API_URL=${apiUrl}`)}`,
    `  -e ${shellQuote(`FINANCES_API_TOKEN=${token}`)}`,
    `  -- node ${shellQuote(serverPath)}`,
  ].join(' \\\n')
}

/** One call with the token, for a script. */
export function scriptExample({
  apiUrl,
  token,
}: Pick<McpSetup, 'apiUrl' | 'token'>): string {
  return [
    `curl -H ${shellQuote(`Authorization: Bearer ${token}`)}`,
    `  ${shellQuote(`${apiUrl}/api/accounts`)}`,
  ].join(' \\\n')
}

/** Where the MCP server is on this device, remembered once typed. */
const SERVER_PATH_KEY = 'finances.mcp-server-path'

export function loadServerPath(): string {
  try {
    return localStorage.getItem(SERVER_PATH_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveServerPath(path: string): void {
  try {
    if (path) localStorage.setItem(SERVER_PATH_KEY, path)
    else localStorage.removeItem(SERVER_PATH_KEY)
  } catch {
    // Private window or blocked storage: the path is typed again next time.
  }
}

/**
 * A name for a new token that no active one has: « Claude sur Mac », then
 * « Claude sur Mac 2 »…
 */
export function uniqueName(base: string, taken: readonly string[]): string {
  const names = new Set(taken.map((name) => name.trim().toLowerCase()))
  if (!names.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) {
    const name = `${base} ${n}`
    if (!names.has(name.toLowerCase())) return name
  }
}
