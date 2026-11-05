import fastifyMultipart, {
  type FastifyMultipartOptions,
} from '@fastify/multipart'
import {
  BadRequestException,
  HttpException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { FastifyRequest } from 'fastify'

/** Largest accepted bank export. A year of CIC exports is a few hundred KB. */
export const IMPORT_FILE_MAX_BYTES = 5 * 1024 * 1024

/** Multipart form field carrying the file. */
export const IMPORT_FILE_FIELD = 'file'

const MULTIPART_OPTIONS: FastifyMultipartOptions = {
  limits: {
    fileSize: IMPORT_FILE_MAX_BYTES,
    files: 1,
    fields: 10,
    fieldSize: 1024,
    parts: 11,
  },
  throwFileSizeLimit: true,
}

/**
 * Registers `@fastify/multipart` (limits above). Only the API entrypoint and
 * HTTP tests need it: the OpenAPI generator reads the decorators only.
 */
export async function registerMultipart(
  app: NestFastifyApplication,
): Promise<void> {
  await app.register(fastifyMultipart, MULTIPART_OPTIONS)
}

export interface UploadedFile {
  fileName: string
  buffer: Buffer
}

export interface MultipartUpload {
  file: UploadedFile | null
  /** Text fields, by name. */
  fields: Record<string, string>
}

/**
 * Reads a multipart body holding at most one file (field `file`) and a few
 * text fields. The file is buffered in memory (bounded by
 * `IMPORT_FILE_MAX_BYTES`). Errors become 4xx HTTP exceptions whose messages
 * never echo the file contents.
 */
export async function readMultipartUpload(
  request: FastifyRequest,
): Promise<MultipartUpload> {
  if (!request.isMultipart()) {
    throw new UnsupportedMediaTypeException(
      'Expected a multipart/form-data body',
    )
  }
  const fields = new Map<string, string>()
  let file: UploadedFile | null = null
  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        // Drain the stream first: an unread file part stalls the request.
        const buffer = await part.toBuffer()
        if (part.fieldname !== IMPORT_FILE_FIELD) {
          throw new BadRequestException(
            `Unexpected file field; send the file as "${IMPORT_FILE_FIELD}"`,
          )
        }
        file = { fileName: part.filename, buffer }
      } else {
        if (fields.has(part.fieldname)) {
          throw new BadRequestException(`Field ${part.fieldname} is repeated`)
        }
        fields.set(part.fieldname, String(part.value))
      }
    }
  } catch (error) {
    throw toHttpException(error)
  }
  return { file, fields: Object.fromEntries(fields) }
}

function toHttpException(error: unknown): HttpException {
  if (error instanceof HttpException) return error
  const code = (error as { code?: unknown } | null)?.code
  switch (code) {
    case 'FST_REQ_FILE_TOO_LARGE':
      return new PayloadTooLargeException(
        `The file exceeds the ${IMPORT_FILE_MAX_BYTES / 1024 / 1024} MB limit`,
      )
    case 'FST_FILES_LIMIT':
      return new BadRequestException('Send a single file')
    case 'FST_FIELDS_LIMIT':
    case 'FST_PARTS_LIMIT':
      return new BadRequestException('Too many form fields')
    case 'FST_PROTO_VIOLATION':
      return new BadRequestException('Invalid form field name')
    default:
      return new BadRequestException('Invalid multipart body')
  }
}
