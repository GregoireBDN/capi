import type { Plugin } from 'vite'


/**
 * Dev-only fix: keep every `Set-Cookie` header on responses served by the Vite
 * dev server.
 *
 * The dev middlewares (Nitro's) set a header (`vary`) before the SSR response
 * is written with `writeHead(status, rawHeaders)`. Once a header has been set,
 * Node (20.x at least) applies raw header arrays with `setHeader`, so repeated
 * names overwrite each other and only the last `Set-Cookie` survives — e.g. a
 * login through the `/api` proxy would keep `refresh_token` but drop `token`.
 * The production server writes raw headers directly and is not affected.
 *
 * This middleware runs first and makes `writeHead` append raw headers instead.
 */
export function multipleSetCookieInDev(): Plugin {
  return {
    name: 'finances:dev-multiple-set-cookie',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        const writeHead = res.writeHead.bind(res)
        res.writeHead = ((statusCode: number, ...rest: unknown[]) => {
          const headers = rest.at(-1)
          if (!Array.isArray(headers)) {
            return writeHead(statusCode, ...(rest as []))
          }
          const pairs: Array<[string, unknown]> = Array.isArray(headers[0])
            ? (headers as Array<[string, unknown]>)
            : Array.from({ length: headers.length / 2 }, (_, i) => [
                String(headers[2 * i]),
                headers[2 * i + 1],
              ])
          for (const [name, value] of pairs) {
            if (name.toLowerCase() === 'set-cookie') {
              res.appendHeader(name, value as string)
            } else {
              res.setHeader(name, value as string)
            }
          }
          const statusMessage = rest.length > 1 ? rest[0] : undefined
          return typeof statusMessage === 'string'
            ? writeHead(statusCode, statusMessage)
            : writeHead(statusCode)
        })
        next()
      })
    },
  }
}
