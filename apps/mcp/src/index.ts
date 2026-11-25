#!/usr/bin/env node
/**
 * Capi MCP server.
 *
 * - Default: stdio, started by the MCP client on the owner's machine with a
 *   personal access token. stdout carries the MCP protocol: anything else goes
 *   to stderr, and never amounts, labels or tool outputs.
 * - `--http` (or `MCP_TRANSPORT=http`): the remote adapter for claude.ai and
 *   the Claude apps (#78, ADR 0003), Streamable HTTP + OAuth. Refuses to start
 *   unless `REMOTE_MCP_ENABLED=true`.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ApiClient } from './api/client.js'
import { ConfigError, loadConfig } from './config.js'
import { loadHttpConfig } from './http/config.js'
import { startHttpServer } from './http/server.js'
import { createServer } from './server.js'

const httpMode =
  process.argv.includes('--http') || process.env.MCP_TRANSPORT === 'http'

async function startStdio(): Promise<void> {
  const config = loadConfig()
  const api = new ApiClient({ baseUrl: config.apiUrl, token: config.token })
  const server = createServer({ api, now: () => new Date() })
  await server.connect(new StdioServerTransport())
  console.error(`[capi-mcp] ready (API ${new URL(config.apiUrl).origin})`)
}

async function startHttp(): Promise<void> {
  const config = loadHttpConfig()
  const server = await startHttpServer({ config })
  const address = server.address()
  const where =
    address && typeof address === 'object'
      ? `${address.address}:${address.port}`
      : `${config.host}:${config.port}`
  console.error(
    `[capi-mcp] remote MCP listening on ${where} (public ${config.publicUrl}/mcp)`,
  )
  const stop = () => server.close(() => process.exit(0))
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}

;(httpMode ? startHttp() : startStdio()).catch((error: unknown) => {
  console.error(
    error instanceof ConfigError
      ? `[capi-mcp] configuration: ${error.message}`
      : `[capi-mcp] failed to start: ${error instanceof Error ? error.name : 'error'}`,
  )
  process.exit(1)
})
