import './load-env'
import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyHelmet from '@fastify/helmet'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { registerJsonDepthLimit } from './common/http/json-depth'
import { registerNoStoreHeaders } from './common/http/no-store'
import { registerPermissionsPolicy } from './common/http/permissions-policy'
import { registerSameOriginCheck } from './common/http/same-origin'
import { env } from './config/env'
import { createFastifyAdapter } from './config/fastify-adapter'
import { REQUEST_ID_HEADER } from './config/logger'
import { SWAGGER_UI_PATH, setupSwagger } from './config/swagger'
import { registerMultipart } from './imports/upload/multipart'

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // Request ids and trusted proxies (client IP for rate limits and logs).
    createFastifyAdapter(),
    // Buffer bootstrap logs until the pino logger is wired in below, so even
    // early framework logs go through the structured logger.
    { bufferLogs: true },
  )

  // Route every Nest log (including the framework's own) through pino.
  app.useLogger(app.get(Logger))

  // Echo the correlation id back so callers can quote it when reporting issues.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      reply.header(REQUEST_ID_HEADER, request.id)
      done()
    })

  // `Cache-Control: no-store` on every response (see `common/http/no-store.ts`).
  // Helmet sets no caching headers, so nothing conflicts with it.
  registerNoStoreHeaders(app.getHttpAdapter().getInstance())

  // Unsafe requests from a page on another origin (a sibling subdomain's form
  // post with the owner's cookies) get 403 before anything else runs (#179).
  registerSameOriginCheck(app.getHttpAdapter().getInstance())

  // Deeply nested JSON bodies get a 400 before validation (#182).
  registerJsonDepthLimit(app.getHttpAdapter().getInstance())

  await app.register(fastifyCookie)

  // File uploads (bank exports): one file per request, size-limited. Only
  // the import preview reads multipart bodies (`readMultipartUpload`).
  await registerMultipart(app)

  // `Permissions-Policy` (helmet has none); helmet below adds COOP and CORP
  // (`common/http/permissions-policy.ts`, #204).
  registerPermissionsPolicy(app.getHttpAdapter().getInstance())

  // Security headers (CSP, HSTS, X-Frame-Options, etc.). The default CSP is
  // strict: the API only returns JSON, so no inline scripts/styles are needed.
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        baseUri: [`'self'`],
        objectSrc: [`'none'`],
        scriptSrc: [`'self'`],
        styleSrc: [`'self'`],
        imgSrc: [`'self'`, 'data:'],
      },
    },
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  // The web app reaches the API through its own origin (`/api` proxy), so
  // browser calls are same-origin; CORS only matters for direct calls from the
  // web origin (e.g. a dev setup without the proxy) and stays limited to it.
  app.enableCors({
    origin: env.APP_URL,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    // Expose rate-limit headers so the web client can warn the user before
    // they get blocked (and read the retry delay once they are).
    exposedHeaders: [
      'Retry-After',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
  })
  app.setGlobalPrefix('api')

  // Run onModuleDestroy hooks (e.g. draining the Postgres pool) on SIGTERM/SIGINT
  // so the process shuts down cleanly instead of dropping in-flight connections.
  app.enableShutdownHooks()

  // Swagger UI and live OpenAPI document: development only (#180).
  const swagger = setupSwagger(app)

  const port = env.PORT
  // Fastify listens on localhost unless told otherwise: the Docker image sets
  // HOST=0.0.0.0 so `web` can reach the API on the compose network.
  await app.listen(port, env.HOST)

  const logger = app.get(Logger)
  logger.log(`API running on http://localhost:${port}/api`)
  if (swagger) {
    logger.log(`Swagger UI: http://localhost:${port}/${SWAGGER_UI_PATH}`)
  }
}

bootstrap()
