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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import {
  IMPORT_FILE_FIELD,
  readMultipartUpload,
} from '#/imports/upload/multipart'
import { CryptoImportsService } from './crypto-imports.service'
import {
  CommitCryptoImportDto,
  CryptoImportDto,
  CryptoImportUploadDto,
  DeleteCryptoImportResultDto,
} from './dto/crypto-import.dto'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const

// Session only: personal access tokens are refused on these writes (no
// `@TokenAccess`), and imports never get `write` token access.
@ApiTags('Crypto imports')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('accounts/:id/crypto-imports')
export class AccountCryptoImportsController {
  constructor(private readonly imports: CryptoImportsService) {}

  @Post()
  @ApiOperation({
    summary: 'Upload an exchange export and preview it',
    description:
      'Parses a Binance or Coinbase "Transactions" CSV export (detected from its headers), marks every line new or already imported, lists unknown operation types and tickers without a price id, and computes the holdings the account will have. Stores a pending import; nothing else is written until `POST /crypto-imports/{id}/commit`.',
  })
  @ApiParam(ID_PARAM)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CryptoImportUploadDto })
  @ApiCreatedResponse({ type: CryptoImportDto })
  @ApiBadRequestResponse({
    description:
      'Missing file, not a Binance or Coinbase export, export of another exchange, not an exchange crypto account, archived account.',
  })
  @ApiNotFoundResponse()
  @ApiPayloadTooLargeResponse({ description: 'The file exceeds 5 MB.' })
  @ApiUnsupportedMediaTypeResponse({ description: 'Not a multipart body.' })
  async preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: FastifyRequest,
  ): Promise<CryptoImportDto> {
    const upload = await readMultipartUpload(request)
    if (Object.keys(upload.fields).length > 0) {
      throw new BadRequestException('Only the file is expected')
    }
    if (!upload.file) {
      throw new BadRequestException(`${IMPORT_FILE_FIELD} is required`)
    }
    return this.imports.preview({
      accountId: id,
      fileName: upload.file.fileName,
      buffer: upload.file.buffer,
    })
  }
}

@ApiTags('Crypto imports')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('crypto-imports')
export class CryptoImportsController {
  constructor(private readonly imports: CryptoImportsService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get an exchange import',
    description: 'Includes the parsed lines while the import is pending.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: CryptoImportDto })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CryptoImportDto> {
    return this.imports.findOne(id)
  }

  @Post(':id/commit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Commit a previewed exchange import',
    description:
      "Writes the new lines atomically (lines stored meanwhile count as duplicates), saves the price ids chosen for unknown tickers, replaces the account's imported holdings with the sum of its movements (manual lines are never touched) and values the account.",
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: CommitCryptoImportDto })
  @ApiOkResponse({ type: CryptoImportDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, ticker that needs no price id, account no longer an open exchange account.',
  })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: 'Already committed, or the preview is outdated.',
  })
  commit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommitCryptoImportDto,
  ): Promise<CryptoImportDto> {
    return this.imports.commit(id, dto)
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Discard or undo an exchange import',
    description:
      'A pending import is discarded. A committed one is undone: its movements are deleted and the imported holdings recomputed.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: DeleteCryptoImportResultDto })
  @ApiNotFoundResponse()
  remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeleteCryptoImportResultDto> {
    return this.imports.remove(id)
  }
}
