import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ApiClient } from '../api/client.js'
import { createServer } from '../server.js'

export const TEST_TOKEN = `fin_pat_${'a'.repeat(43)}`

type Route = unknown | ((url: URL) => unknown)

/** Fake `fetch`: JSON per path, or a `Response` for errors. Records every URL. */
export function mockFetch(routes: Record<string, Route>) {
  const calls: { url: URL; headers: Headers }[] = []
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(input instanceof Request ? input.url : input)
    calls.push({ url, headers: new Headers(init?.headers) })
    const route = routes[url.pathname]
    if (route === undefined) return new Response('{}', { status: 404 })
    const body = typeof route === 'function' ? route(url) : route
    if (body instanceof Response) return body
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return { fetch: fetchImpl, calls }
}

/** An MCP client connected in memory to the server, backed by `routes`. */
export async function connect(
  routes: Record<string, Route>,
  now = new Date('2026-11-14T10:00:00Z'),
) {
  const { fetch, calls } = mockFetch(routes)
  const api = new ApiClient({
    baseUrl: 'http://api.test',
    token: TEST_TOKEN,
    fetch,
  })
  const server = createServer({ api, now: () => now })
  const client = new Client({ name: 'test', version: '0.0.0' })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ])

  async function call(name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args })
    const content = result.content as { type: string; text: string }[]
    return {
      text: content.map((c) => c.text).join('\n'),
      isError: result.isError === true,
    }
  }
  return { client, call, calls }
}

export function jsonError(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}
