import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
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
  FixImportLineDto,
  ImportDetailDto,
  ImportSummaryDto,
  PreviewImportBodyDto,
  PreviewImportFieldsDto,
} from './dto/import.dto'
import { ImportsService } from './imports.service'
import { IMPORT_FILE_FIELD, readMultipartUpload } from './upload/multipart'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const
const LINE_PARAM = {
  name: 'lineNumber',
  type: 'integer',
  description: '1-based line in the file.',
} as const

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
      'Reads the file with its format (the CIC export, the standard cash format, or a saved import profile, recognised from the header unless `source` / `profileId` say it), parses it, classifies every row (new / duplicate / conflict) against the account, proposes categories and checks the running balance. Stores a pending import; no transaction is written until `POST /imports/{id}/commit`. Pending previews older than 24 h are discarded when a new one is made.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: PreviewImportBodyDto })
  @ApiCreatedResponse({ type: ImportDetailDto })
  @ApiBadRequestResponse({
    description:
      'Missing file or fields, unrecognised format (`Unrecognised CSV format`), a mapped column missing, unknown profile, unknown, archived or non-transactional account.',
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
      profileId: fields.profileId,
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

  // Typing a line is session only: the MCP converts a statement to the
  // standard format instead.
  @Put(':id/lines/:lineNumber')
  @ApiOperation({
    summary: 'Type an unreadable line of a pending import',
    description:
      'Replaces a line the file’s format could not read (or a line typed before) with the values typed, then checks the whole preview again: dedupe, continuity, manual expenses, rules. The typed row may come out new, duplicate or conflict. Lines that were read cannot be changed. Nothing is written but the pending import (#433).',
  })
  @ApiParam(ID_PARAM)
  @ApiParam(LINE_PARAM)
  @ApiBody({ type: FixImportLineDto })
  @ApiOkResponse({ type: ImportDetailDto })
  @ApiBadRequestResponse({
    description: 'Invalid values, or a line that was read.',
  })
  @ApiNotFoundResponse({ description: 'No such import or unreadable line.' })
  @ApiConflictResponse({
    description: 'Already committed, or the preview is outdated.',
  })
  fixLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineNumber', ParseIntPipe) lineNumber: number,
    @Body() dto: FixImportLineDto,
  ): Promise<ImportDetailDto> {
    return this.importsService.fixLine(id, lineNumber, dto)
  }

  @Delete(':id/lines/:lineNumber')
  @ApiOperation({
    summary: 'Put a typed line back as unreadable',
    description:
      'The line typed in the preview is left out of the import again, and the preview is checked again (#433).',
  })
  @ApiParam(ID_PARAM)
  @ApiParam(LINE_PARAM)
  @ApiOkResponse({ type: ImportDetailDto })
  @ApiNotFoundResponse({ description: 'No such import or typed line.' })
  @ApiConflictResponse({
    description: 'Already committed, or the preview is outdated.',
  })
  unfixLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineNumber', ParseIntPipe) lineNumber: number,
  ): Promise<ImportDetailDto> {
    return this.importsService.unfixLine(id, lineNumber)
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
