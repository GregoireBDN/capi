import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { ParseCalendarDatePipe } from './calendar-date'
import {
  AccountPerformanceDto,
  BulkSnapshotsDto,
  BulkSnapshotsResultDto,
  InvestedBasePreviewDto,
  InvestedFiguresDto,
  SetInvestedBaseDto,
  SnapshotDto,
  UpsertSnapshotDto,
} from './dto/snapshot.dto'
import { InvestmentsService } from './investments.service'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const
const DATE_PARAM = {
  name: 'date',
  type: String,
  format: 'date',
  description: 'Calendar day of the snapshot (`YYYY-MM-DD`).',
  example: '2026-09-30',
} as const

@ApiTags('Accounts')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('accounts/:id')
export class AccountSnapshotsController {
  constructor(private readonly investments: InvestmentsService) {}

  @Get('snapshots')
  @ApiOperation({
    summary: 'List the value snapshots of an account',
    description: 'Oldest first. Any account type.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: [SnapshotDto] })
  @ApiNotFoundResponse()
  list(@Param('id', ParseUUIDPipe) id: string): Promise<SnapshotDto[]> {
    return this.investments.list(id)
  }

  @Put('snapshots/:date')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Create or replace the snapshot of a day',
    description:
      'Value (and net contributions) at the end of `date`, which may not be after today (Europe/Paris). Omitted fields are cleared. Refused on an archived account.',
  })
  @ApiParam(ID_PARAM)
  @ApiParam(DATE_PARAM)
  @ApiBody({ type: UpsertSnapshotDto })
  @ApiOkResponse({ type: SnapshotDto })
  @ApiBadRequestResponse({
    description: 'Invalid or future date, invalid body, archived account.',
  })
  @ApiNotFoundResponse()
  upsert(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date', ParseCalendarDatePipe) date: string,
    @Body() dto: UpsertSnapshotDto,
  ): Promise<SnapshotDto> {
    return this.investments.upsert(id, date, dto)
  }

  @Delete('snapshots/:date')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete the snapshot of a day' })
  @ApiParam(ID_PARAM)
  @ApiParam(DATE_PARAM)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Invalid date, archived account.' })
  @ApiNotFoundResponse({ description: 'Unknown account, or no snapshot.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date', ParseCalendarDatePipe) date: string,
  ): Promise<void> {
    await this.investments.remove(id, date)
  }

  @Post('snapshots/bulk')
  @TokenAccess('write')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Upsert a statement history',
    description:
      'Up to 500 days in one transaction: all rows are written or none. An existing day gets the new value; its contributions are replaced only when the row has some, and its note is kept.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: BulkSnapshotsDto })
  @ApiOkResponse({ type: BulkSnapshotsResultDto })
  @ApiBadRequestResponse({
    description: 'Invalid rows, duplicate or future dates, archived account.',
  })
  @ApiNotFoundResponse()
  bulk(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BulkSnapshotsDto,
  ): Promise<BulkSnapshotsResultDto> {
    return this.investments.bulkUpsert(id, dto.rows)
  }

  @Get('performance')
  @ApiOperation({
    summary: 'Value, contributions, gain and history of an account',
    description:
      'Computed from its snapshots: latest value, latest known net contributions, gain and simple return, changes since the previous snapshot and over one year, staleness, and every snapshot for the chart.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: AccountPerformanceDto })
  @ApiNotFoundResponse()
  performance(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountPerformanceDto> {
    return this.investments.performance(id)
  }

  @Put('invested-base')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Set the invested base of a wallet or manual crypto account',
    description:
      "What was invested in the account up to a day (#358, « Investi jusqu’au … »). The invested amount is then that base plus the cost of the coins linked to the account after that day; the snapshots from that day get it as their contributions. Not for exchange accounts, which keep their holdings' cost.",
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: SetInvestedBaseDto })
  @ApiOkResponse({ type: InvestedFiguresDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, future day, archived account, not a wallet or manual crypto account.',
  })
  @ApiNotFoundResponse()
  setInvestedBase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetInvestedBaseDto,
  ): Promise<InvestedFiguresDto> {
    return this.investments.setInvestedBase(id, dto)
  }

  @Post('invested-base/preview')
  @TokenAccess('read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Preview an invested base',
    description:
      'The invested amount, gain and rate of the account now and with this base. Saves nothing.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: SetInvestedBaseDto })
  @ApiOkResponse({ type: InvestedBasePreviewDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, future day, archived account, not a wallet or manual crypto account.',
  })
  @ApiNotFoundResponse()
  previewInvestedBase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetInvestedBaseDto,
  ): Promise<InvestedBasePreviewDto> {
    return this.investments.previewInvestedBase(id, dto)
  }

  @Delete('invested-base')
  @TokenAccess('none')
  @ApiOperation({
    summary: 'Remove the invested base of a crypto account',
    description:
      "The coins linked to it (or its holdings' invested amounts) give its invested amount again. Session only.",
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: InvestedFiguresDto })
  @ApiBadRequestResponse({
    description: 'Archived account, not a wallet or manual crypto account.',
  })
  @ApiNotFoundResponse()
  clearInvestedBase(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvestedFiguresDto> {
    return this.investments.clearInvestedBase(id)
  }
}
