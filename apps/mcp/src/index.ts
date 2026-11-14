#!/usr/bin/env node
/**
 * Finances MCP server over stdio. stdout carries the MCP protocol: anything
 * else goes to stderr, and never amounts, labels or tool outputs.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ApiClient } from './api/client.js'
import { ConfigError, loadConfig } from './config.js'
import { createServer } from './server.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const api = new ApiClient({ baseUrl: config.apiUrl, token: config.token })
  const server = createServer({ api, now: () => new Date() })
  await server.connect(new StdioServerTransport())
  console.error(`[finances-mcp] ready (API ${new URL(config.apiUrl).origin})`)
}

main().catch((error: unknown) => {
  console.error(
    error instanceof ConfigError
      ? `[finances-mcp] configuration: ${error.message}`
      : `[finances-mcp] failed to start: ${error instanceof Error ? error.name : 'error'}`,
  )
  process.exit(1)
})
