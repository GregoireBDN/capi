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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { IMPORT_FILE_FIELD, readMultipartUpload } from '../upload/multipart'
import {
  CreateImportProfileDto,
  CsvInspectionDto,
  ImportProfileDto,
  InspectCsvBodyDto,
} from './dto/import-profile.dto'
import { ImportProfilesService } from './import-profiles.service'

/**
 * CSV import profiles (#431). Reading them is open to tokens like every GET;
 * creating, deleting and inspecting a file stay with the session (the MCP
 * converts a statement into the standard format instead).
 */
@ApiTags('Imports')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('import-profiles')
export class ImportProfilesController {
  constructor(private readonly profiles: ImportProfilesService) {}

  @Get()
  @ApiOperation({
    summary: 'Saved import profiles',
    description:
      'How the CSV files of each source are read; a file whose header matches one is recognised.',
  })
  @ApiOkResponse({ type: [ImportProfileDto] })
  list(): Promise<ImportProfileDto[]> {
    return this.profiles.list()
  }

  @Post('inspect')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Read the header of a CSV file',
    description:
      'Its encoding, separator, header, first lines, the format it is already recognised as, and a guessed mapping for a new profile. Saves nothing.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: InspectCsvBodyDto })
  @ApiOkResponse({ type: CsvInspectionDto })
  @ApiBadRequestResponse({ description: 'Missing file, empty or unreadable.' })
  @ApiPayloadTooLargeResponse({ description: 'The file exceeds 5 MB.' })
  async inspect(@Req() request: FastifyRequest): Promise<CsvInspectionDto> {
    const upload = await readMultipartUpload(request)
    if (Object.keys(upload.fields).length > 0) {
      throw new BadRequestException('Only a file is expected')
    }
    if (!upload.file) {
      throw new BadRequestException(`${IMPORT_FILE_FIELD} is required`)
    }
    return this.profiles.inspect(upload.file.buffer)
  }

  @Post()
  @ApiOperation({
    summary: 'Save an import profile',
    description:
      'Which column is which for the files of one source, with their date layout, decimal mark, encoding and separator.',
  })
  @ApiBody({ type: CreateImportProfileDto })
  @ApiCreatedResponse({ type: ImportProfileDto })
  @ApiBadRequestResponse({
    description:
      'A column not in the header or mapped twice, no amount, or a header read without a profile.',
  })
  @ApiConflictResponse({ description: 'A profile already reads this header.' })
  create(@Body() dto: CreateImportProfileDto): Promise<ImportProfileDto> {
    return this.profiles.create(dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete an import profile',
    description: 'The imports made with it stay.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.profiles.remove(id)
  }
}
