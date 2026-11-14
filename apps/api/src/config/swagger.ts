import type { INestApplication } from '@nestjs/common'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger'
import { env } from './env'

/** Swagger UI and the live OpenAPI document (development only, #180). */
export const SWAGGER_UI_PATH = 'api/docs'
export const SWAGGER_JSON_PATH = 'api/docs-json'

/**
 * The OpenAPI document of the API. `generate-spec.ts` writes it to
 * `openapi.json` at build time, which is all the typed clients need.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Finances API')
    .setVersion('1.0')
    .addCookieAuth('token')
    .build()
  return SwaggerModule.createDocument(app, config)
}

/**
 * The Swagger UI is the only HTML page and relies on inline scripts and
 * styles, so it gets a relaxed CSP, scoped to its own routes instead of
 * weakening the policy for the whole API.
 */
const SWAGGER_CSP = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: validator.swagger.io`,
].join('; ')

/**
 * Serves the Swagger UI (`/api/docs`) and the OpenAPI document
 * (`/api/docs-json`) outside production only: they hold no data but map the
 * whole attack surface, unauthenticated (audit F8, #180). In production both
 * paths are plain 404s. Returns whether they were registered.
 */
export function setupSwagger(app: NestFastifyApplication): boolean {
  if (env.isProduction) return false

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', (request, reply, payload, done) => {
      if (request.url.startsWith(`/${SWAGGER_UI_PATH}`)) {
        reply.header('Content-Security-Policy', SWAGGER_CSP)
      }
      done(null, payload)
    })

  SwaggerModule.setup(SWAGGER_UI_PATH, app, createOpenApiDocument(app), {
    jsonDocumentUrl: SWAGGER_JSON_PATH,
  })
  return true
}
