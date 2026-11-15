import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { FastifyRequest } from 'fastify'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import {
  CommitImportDto,
  DeleteImportResultDto,
  ImportDetailDto,
  ImportSummaryDto,
  PreviewImportBodyDto,
  PreviewImportFieldsDto,
} from './dto/import.dto'
import { ImportsService } from './imports.service'
import { IMPORT_FILE_FIELD, readMultipartUpload } from './upload/multipart'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const

@ApiTags('Imports')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  // Preview and commit are open to `write` tokens for the MCP import tools
  // (#103): they keep the preview → commit flow, dedupe and continuity check.
  // Deleting (discarding or undoing) an import stays session-only.
  @Post('preview')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Upload a bank export and preview it',
    description:
      'Parses the file, classifies every row (new / duplicate / conflict) against the account, proposes categories and checks the running balance. Stores a pending import; no transaction is written until `POST /imports/{id}/commit`. Pending previews older than 24 h are discarded when a new one is made.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: PreviewImportBodyDto })
  @ApiCreatedResponse({ type: ImportDetailDto })
  @ApiBadRequestResponse({
    description:
      'Missing file or fields, not a CIC CSV export, unknown, archived or non-transactional account.',
  })
  @ApiPayloadTooLargeResponse({ description: 'The file exceeds 5 MB.' })
  @ApiUnsupportedMediaTypeResponse({ description: 'Not a multipart body.' })
  @ApiForbiddenResponse({
    description: 'Personal access token without the `write` scope.',
  })
  async preview(@Req() request: FastifyRequest): Promise<ImportDetailDto> {
    const upload = await readMultipartUpload(request)
    const fields = plainToInstance(PreviewImportFieldsDto, upload.fields)
    const errors = await validate(fields, {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
    if (errors.length > 0) {
      throw new BadRequestException(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      )
    }
    if (!upload.file) {
      throw new BadRequestException(`${IMPORT_FILE_FIELD} is required`)
    }
    return this.importsService.preview({
      accountId: fields.accountId,
      source: fields.source,
      fileName: upload.file.fileName,
      buffer: upload.file.buffer,
    })
  }

  @Post(':id/commit')
  @TokenAccess('write')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Commit a previewed import',
    description:
      'Writes the new rows and the conflicts resolved as `import`, atomically. Unresolved conflicts are skipped. Rows stored by another import since the preview count as duplicates.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: CommitImportDto })
  @ApiOkResponse({ type: ImportDetailDto })
  @ApiBadRequestResponse({
    description:
      'Unknown row index, resolution of a non-conflict row, unknown category.',
  })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: 'Already committed, or the preview is outdated.',
  })
  @ApiForbiddenResponse({
    description: 'Personal access token without the `write` scope.',
  })
  commit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommitImportDto,
  ): Promise<ImportDetailDto> {
    return this.importsService.commit(id, dto)
  }

  @Get()
  @ApiOperation({
    summary: 'Import history',
    description: 'Committed and pending imports, newest first.',
  })
  @ApiOkResponse({ type: [ImportSummaryDto] })
  list(): Promise<ImportSummaryDto[]> {
    return this.importsService.list()
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an import',
    description: 'Includes the preview rows while the import is pending.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: ImportDetailDto })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ImportDetailDto> {
    return this.importsService.findOne(id)
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Discard or undo an import',
    description:
      'A pending import is discarded. A committed import is undone: it is deleted with every transaction it wrote.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: DeleteImportResultDto })
  @ApiNotFoundResponse()
  remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeleteImportResultDto> {
    return this.importsService.remove(id)
  }
}
