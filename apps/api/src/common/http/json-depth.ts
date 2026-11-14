import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ErrorResponse } from '../filters/all-exceptions.filter'

/**
 * Deepest nesting of objects and arrays a request body may have. The API's
 * deepest DTO (e.g. transaction splits) is a few levels deep; anything far
 * beyond is not a real request.
 */
export const MAX_JSON_DEPTH = 32

/**
 * Whether `value` nests objects / arrays deeper than `max` levels (a scalar is
 * depth 0, `{}` or `[]` depth 1). Walks the value with an explicit stack, so
 * the check itself can't overflow the call stack.
 */
export function exceedsJsonDepth(value: unknown, max: number): boolean {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  while (stack.length > 0) {
    const { value: current, depth } = stack.pop()!
    if (current === null || typeof current !== 'object') continue
    if (depth + 1 > max) return true
    for (const child of Object.values(current)) {
      if (child !== null && typeof child === 'object') {
        stack.push({ value: child, depth: depth + 1 })
      }
    }
  }
  return false
}

/**
 * Refuses deeply nested JSON bodies with a 400 before validation (#182).
 * `JSON.parse` copes with them, but `ValidationPipe` walks the body
 * recursively and overflows the stack, which ended in a 500 and an error log.
 * Runs as a Fastify `preValidation` hook, after parsing and before the Nest
 * handler (pipes, guards' bodies); answers with the API's error envelope.
 */
export function registerJsonDepthLimit(
  fastify: FastifyInstance,
  max = MAX_JSON_DEPTH,
): void {
  fastify.addHook('preValidation', (request, reply, done) => {
    if (!exceedsJsonDepth(request.body, max)) return done()
    void reply.code(400).send(tooDeep(request, max))
  })
}

function tooDeep(request: FastifyRequest, max: number): ErrorResponse {
  return {
    statusCode: 400,
    error: 'Bad Request',
    message: [`Request body nested deeper than ${max} levels`],
    requestId: String(request.id),
    timestamp: new Date().toISOString(),
    path: request.url,
  }
}
