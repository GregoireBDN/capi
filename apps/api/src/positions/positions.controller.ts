import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  type PipeTransform,
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
import { ParseCalendarDatePipe } from '#/investments/calendar-date'
import {
  PositionsDto,
  PutStatementDto,
  SecurityDto,
  SetCashDto,
  SetSecurityPriceDto,
  StatementPreviewDto,
  UpsertLineDto,
} from './dto/positions.dto'
import { isValidIsin, normalizeIsin } from './isin'
import { PositionsService } from './positions.service'

/** Route parameter pipe: a valid ISIN, normalized. */
class ParseIsinPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const isin = normalizeIsin(value)
    if (!isValidIsin(isin)) {
      throw new BadRequestException('isin must be a valid ISIN')
    }
    return isin
  }
}

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const
const AS_OF_PARAM = {
  name: 'asOf',
  type: String,
  format: 'date',
  description: "The statement's day (`YYYY-MM-DD`), not in the future.",
} as const
const ISIN_PARAM = {
  name: 'isin',
  type: String,
  example: 'ZZ00MSCIWD03',
} as const

@ApiTags('Positions')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('accounts/:id/positions')
export class PositionsController {
  constructor(
    @Inject(PositionsService) private readonly positions: PositionsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "A PEA's lines as of today (ADR 0006)",
    description:
      'Each line with its quantity, PRU, cost, latest price, value and result; the cash; the totals; the statements, newest first.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: PositionsDto })
  @ApiBadRequestResponse({ description: 'Not a PEA.' })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PositionsDto> {
    return this.positions.get(id)
  }

  @Put('statements/:asOf')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Write a whole statement of a day',
    description:
      "Every line held on `asOf` and the cash: the day's lines are replaced, the prices sent become that day's `statement` prices (a manual price is kept), unknown securities are created (a name is then required), and the account's values are computed again from that day. A typed value keeps its day. Open to write tokens (MCP `sync_security_positions`).",
  })
  @ApiParam(ID_PARAM)
  @ApiParam(AS_OF_PARAM)
  @ApiBody({ type: PutStatementDto })
  @ApiOkResponse({ type: PositionsDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body or ISIN, duplicate line, future day, unknown security without a name, archived account, not a PEA.',
  })
  @ApiNotFoundResponse()
  putStatement(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('asOf', ParseCalendarDatePipe) asOf: string,
    @Body() dto: PutStatementDto,
  ): Promise<PositionsDto> {
    return this.positions.putStatement(id, asOf, dto, 'mcp')
  }

  @Post('statements/:asOf/preview')
  @TokenAccess('read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Preview a statement',
    description:
      'What writing it would change: new, changed, removed and unchanged lines, the cash, the value of the day before and after. Saves nothing.',
  })
  @ApiParam(ID_PARAM)
  @ApiParam(AS_OF_PARAM)
  @ApiBody({ type: PutStatementDto })
  @ApiOkResponse({ type: StatementPreviewDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('asOf', ParseCalendarDatePipe) asOf: string,
    @Body() dto: PutStatementDto,
  ): Promise<StatementPreviewDto> {
    return this.positions.preview(id, asOf, dto)
  }

  @Delete('statements/:asOf')
  @TokenAccess('none')
  @ApiOperation({
    summary: 'Delete the statement of a day',
    description: 'Session only. Values are computed again from that day.',
  })
  @ApiParam(ID_PARAM)
  @ApiParam(AS_OF_PARAM)
  @ApiOkResponse({ type: PositionsDto })
  @ApiNotFoundResponse()
  removeStatement(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('asOf', ParseCalendarDatePipe) asOf: string,
  ): Promise<PositionsDto> {
    return this.positions.removeStatement(id, asOf)
  }

  @Put('lines/:isin')
  @TokenAccess('none')
  @ApiOperation({
    summary: 'Add or change a line, as of today',
    description:
      "Today's statement, or a copy of the latest one dated today, gets the line (the past is never rewritten). An omitted PRU keeps the one known. Session only.",
  })
  @ApiParam(ID_PARAM)
  @ApiParam(ISIN_PARAM)
  @ApiBody({ type: UpsertLineDto })
  @ApiOkResponse({ type: PositionsDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  upsertLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('isin', ParseIsinPipe) isin: string,
    @Body() dto: UpsertLineDto,
  ): Promise<PositionsDto> {
    return this.positions.upsertLine(id, isin, dto)
  }

  @Delete('lines/:isin')
  @TokenAccess('none')
  @ApiOperation({
    summary: 'Remove a line, as of today (sold)',
    description: 'Session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiParam(ISIN_PARAM)
  @ApiOkResponse({ type: PositionsDto })
  @ApiNotFoundResponse({ description: 'Unknown account, or no such line.' })
  removeLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('isin', ParseIsinPipe) isin: string,
  ): Promise<PositionsDto> {
    return this.positions.removeLine(id, isin)
  }

  @Put('cash')
  @TokenAccess('none')
  @ApiOperation({
    summary: 'Set the cash (« Liquidités »), as of today',
    description: 'Session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: SetCashDto })
  @ApiOkResponse({ type: PositionsDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  setCash(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCashDto,
  ): Promise<PositionsDto> {
    return this.positions.setCash(id, dto)
  }
}

@ApiTags('Positions')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('securities')
export class SecuritiesController {
  constructor(
    @Inject(PositionsService) private readonly positions: PositionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The securities the app knows (by ISIN)' })
  @ApiOkResponse({ type: [SecurityDto] })
  list(): Promise<SecurityDto[]> {
    return this.positions.securities()
  }

  @Put(':isin/prices/:day')
  @TokenAccess('none')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Set the manual price of a security on a day',
    description:
      'In euros, exact. Every account holding it gets its values computed again from that day. Session only.',
  })
  @ApiParam(ISIN_PARAM)
  @ApiParam({ name: 'day', type: String, format: 'date' })
  @ApiBody({ type: SetSecurityPriceDto })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Invalid ISIN, price or future day.' })
  @ApiNotFoundResponse({ description: 'Unknown security.' })
  async setPrice(
    @Param('isin', ParseIsinPipe) isin: string,
    @Param('day', ParseCalendarDatePipe) day: string,
    @Body() dto: SetSecurityPriceDto,
  ): Promise<void> {
    await this.positions.setPrice(isin, day, dto.priceEur)
  }
}
