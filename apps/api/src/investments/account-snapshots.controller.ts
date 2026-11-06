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
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { ParseCalendarDatePipe } from './calendar-date'
import {
  AccountPerformanceDto,
  BulkSnapshotsDto,
  BulkSnapshotsResultDto,
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
}
