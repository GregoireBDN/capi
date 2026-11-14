import './load-env'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AppModule } from './app.module'
import { createOpenApiDocument } from './config/swagger'

async function generateSpec() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: false },
  )

  app.setGlobalPrefix('api')

  // Same document as the development Swagger UI (`config/swagger.ts`).
  const document = createOpenApiDocument(app)
  const outPath = resolve(process.cwd(), 'openapi.json')
  writeFileSync(outPath, JSON.stringify(document, null, 2))
  console.log(`OpenAPI spec written to ${outPath}`)

  await app.close()
}

generateSpec().catch((err) => {
  console.error(err)
  process.exit(1)
})
