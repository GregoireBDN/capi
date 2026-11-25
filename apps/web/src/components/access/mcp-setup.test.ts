import { afterEach, describe, expect, it } from 'vitest'
import {
  claudeCodeCommand,
  desktopConfig,
  loadServerPath,
  scriptExample,
  shellQuote,
  uniqueName,
} from './mcp-setup'

/** Synthetic values only. */
const SETUP = {
  apiUrl: 'https://capi.example.test',
  token: `fin_pat_${'Z'.repeat(43)}`,
  serverPath: '/Users/owner/finances/apps/mcp/dist/index.js',
}

describe('desktopConfig', () => {
  it('is the whole claude_desktop_config.json with the URL and the token', () => {
    expect(JSON.parse(desktopConfig(SETUP))).toEqual({
      mcpServers: {
        finances: {
          command: 'node',
          args: [SETUP.serverPath],
          env: {
            CAPI_API_URL: SETUP.apiUrl,
            CAPI_API_TOKEN: SETUP.token,
          },
        },
      },
    })
  })

  it('escapes a path with quotes or spaces as JSON', () => {
    const serverPath = '/Users/o "q"/Mes projets/index.js'
    const config = JSON.parse(desktopConfig({ ...SETUP, serverPath })) as {
      mcpServers: { finances: { args: string[] } }
    }
    expect(config.mcpServers.finances.args).toEqual([serverPath])
  })
})

describe('claudeCodeCommand', () => {
  it('registers the server for the user with both variables', () => {
    expect(claudeCodeCommand(SETUP)).toBe(
      [
        'claude mcp add finances --scope user',
        `  -e CAPI_API_URL=${SETUP.apiUrl}`,
        `  -e CAPI_API_TOKEN=${SETUP.token}`,
        `  -- node ${SETUP.serverPath}`,
      ].join(' \\\n'),
    )
  })

  it('quotes a path the shell would split', () => {
    expect(
      claudeCodeCommand({
        ...SETUP,
        serverPath: "/Users/o'k/Mes projets/x.js",
      }),
    ).toContain(`-- node '/Users/o'\\''k/Mes projets/x.js'`)
  })
})

describe('scriptExample', () => {
  it('calls the API with the bearer token', () => {
    const example = scriptExample(SETUP)
    expect(example).toContain(`'Authorization: Bearer ${SETUP.token}'`)
    expect(example).toContain(`${SETUP.apiUrl}/api/accounts`)
  })
})

describe('shellQuote', () => {
  it('leaves safe words alone and single-quotes the rest', () => {
    expect(shellQuote('a=b/c.d')).toBe('a=b/c.d')
    expect(shellQuote('a b')).toBe(`'a b'`)
    expect(shellQuote(`it's`)).toBe(`'it'\\''s'`)
  })
})

describe('uniqueName', () => {
  it('numbers a name already taken', () => {
    expect(uniqueName('Claude sur Mac', [])).toBe('Claude sur Mac')
    expect(uniqueName('Claude sur Mac', ['claude sur mac'])).toBe(
      'Claude sur Mac 2',
    )
    expect(
      uniqueName('Claude sur Mac', ['Claude sur Mac', 'Claude sur Mac 2']),
    ).toBe('Claude sur Mac 3')
  })
})

describe('loadServerPath', () => {
  afterEach(() => localStorage.clear())

  it('moves the path saved under the key before #464 once', () => {
    localStorage.setItem('finances.mcp-server-path', SETUP.serverPath)
    expect(loadServerPath()).toBe(SETUP.serverPath)
    expect(localStorage.getItem('capi.mcp-server-path')).toBe(SETUP.serverPath)
    expect(localStorage.getItem('finances.mcp-server-path')).toBeNull()
  })

  it('prefers the current key', () => {
    localStorage.setItem('capi.mcp-server-path', '/new/index.js')
    localStorage.setItem('finances.mcp-server-path', '/old/index.js')
    expect(loadServerPath()).toBe('/new/index.js')
  })
})
