import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import {
  AccountEnvelopesDto,
  ApplySplitDto,
  AttachTransactionDto,
  CreateEnvelopeDto,
  EnvelopeDetailDto,
  EnvelopeSummaryDto,
  EnvelopeMonthDto,
  EnvelopeMonthQueryDto,
  EnvelopeOffersDto,
  ListEnvelopesQueryDto,
  MoveEnvelopeMoneyDto,
  SetSplitKeyDto,
  TopUpEnvelopeDto,
  UpdateEnvelopeDto,
} from './dto/envelope.dto'
import { EnvelopesService } from './envelopes.service'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const
const TRANSACTION_PARAM = {
  name: 'transactionId',
  type: String,
  format: 'uuid',
} as const

/**
 * Envelopes (#429, ADR 0008). Tokens and the MCP read them. A `write` token
 * may only create one and add to one from « libre » (#518, the MCP's
 * `create_envelope` and `add_to_envelope`); every other write (change,
 * delete, moves out of an envelope, attaching, splits, keys) is session only.
 */
@ApiTags('Envelopes')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller()
export class EnvelopesController {
  constructor(private readonly envelopes: EnvelopesService) {}

  @Get('envelopes')
  @ApiOperation({
    summary: 'Envelopes with what they hold per account and their plan',
    description:
      'Money set aside for a goal: never a transaction, so net worth and statistics are untouched. Each envelope comes with its total, what it paid, its amount per account and the monthly amount needed to reach its target by its due date.',
  })
  @ApiQuery({ type: ListEnvelopesQueryDto })
  @ApiOkResponse({ type: [EnvelopeSummaryDto] })
  list(@Query() query: ListEnvelopesQueryDto): Promise<EnvelopeSummaryDto[]> {
    return this.envelopes.list({ includeArchived: query.includeArchived })
  }

  @Get('envelopes/offers')
  @ApiOperation({
    summary: 'Savings to split, transfers and expenses to attach',
    description:
      'Nothing is attached without the owner: each offer is confirmed, or answered « Non » (`POST /envelopes/offers/:transactionId/dismiss`).',
  })
  @ApiOkResponse({ type: EnvelopeOffersDto })
  offers(): Promise<EnvelopeOffersDto> {
    return this.envelopes.offers()
  }

  @Get('envelopes/month')
  @ApiOperation({
    summary: 'What envelopes paid in a month, per category',
    description:
      'Each envelope that paid an expense booked in the month: paid, put aside, what is left, and per category (what it adds to the month’s budget).',
  })
  @ApiQuery({ type: EnvelopeMonthQueryDto })
  @ApiOkResponse({ type: EnvelopeMonthDto })
  month(@Query() query: EnvelopeMonthQueryDto): Promise<EnvelopeMonthDto> {
    return this.envelopes.month(query.month)
  }

  @Get('envelopes/:id')
  @ApiOperation({
    summary: 'An envelope with its history and movements',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: EnvelopeDetailDto })
  @ApiNotFoundResponse()
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<EnvelopeDetailDto> {
    return this.envelopes.detail(id)
  }

  @Post('envelopes')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Create an envelope',
    description:
      '`start` takes an amount per account from its « libre »; the money does not move.',
  })
  @ApiBody({ type: CreateEnvelopeDto })
  @ApiCreatedResponse({ type: EnvelopeSummaryDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, unknown or non-expense category, unknown account, or more than « libre ».',
  })
  create(@Body() dto: CreateEnvelopeDto): Promise<EnvelopeSummaryDto> {
    return this.envelopes.create(dto)
  }

  @Patch('envelopes/:id')
  @ApiOperation({
    summary: 'Change, archive or restore an envelope',
    description:
      'Omitted fields keep their value; `categoryIds` replaces them.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: UpdateEnvelopeDto })
  @ApiOkResponse({ type: EnvelopeSummaryDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEnvelopeDto,
  ): Promise<EnvelopeSummaryDto> {
    return this.envelopes.update(id, dto)
  }

  @Delete('envelopes/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete an envelope',
    description: 'Its money goes back to « libre »; balances do not change.',
  })
  @ApiParam(ID_PARAM)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.envelopes.remove(id)
  }

  @Post('envelopes/moves')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Move money between envelopes and « libre » on one account',
    description:
      'The balance does not change. Never more than the envelope (or « libre ») holds there.',
  })
  @ApiBody({ type: MoveEnvelopeMoneyDto })
  @ApiOkResponse({ type: AccountEnvelopesDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  move(@Body() dto: MoveEnvelopeMoneyDto): Promise<AccountEnvelopesDto> {
    return this.envelopes.move(dto)
  }

  @Post('envelopes/:id/top-up')
  @HttpCode(200)
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Add money to an envelope from an account’s « libre »',
    description:
      'A move from « libre » into the envelope on one account (#518): the balance does not change, never more than « libre ». Open to `write` tokens; taking money out of an envelope stays session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: TopUpEnvelopeDto })
  @ApiOkResponse({ type: AccountEnvelopesDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, unknown account, archived envelope, or more than « libre ».',
  })
  @ApiNotFoundResponse()
  topUp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TopUpEnvelopeDto,
  ): Promise<AccountEnvelopesDto> {
    return this.envelopes.topUp(id, dto)
  }

  @Post('envelopes/:id/transactions')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Attach an expense or a transfer out to an envelope',
    description:
      'An expense keeps its category and counts once in the month; the envelope pays it (or `amountCents` of it) and adds that to the month’s budget. A transfer out carries the envelope’s money (or `amountCents` of it) to its other account.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: AttachTransactionDto })
  @ApiOkResponse({ type: EnvelopeDetailDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Already attached to an envelope.' })
  attach(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachTransactionDto,
  ): Promise<EnvelopeDetailDto> {
    return this.envelopes.attach(id, dto)
  }

  @Delete('envelopes/:id/transactions/:transactionId')
  @ApiOperation({
    summary: 'Detach an expense, a transfer or a saving split',
  })
  @ApiParam(ID_PARAM)
  @ApiParam(TRANSACTION_PARAM)
  @ApiOkResponse({ type: EnvelopeDetailDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: 'The envelope would fall below zero on an account.',
  })
  detach(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ): Promise<EnvelopeDetailDto> {
    return this.envelopes.detach(id, transactionId)
  }

  @Post('envelopes/splits/:transactionId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Split a saving between envelopes',
    description:
      'The shares given, else the account’s key (rounded down to the cent, the rest « libre »).',
  })
  @ApiParam(TRANSACTION_PARAM)
  @ApiBody({ type: ApplySplitDto })
  @ApiOkResponse({ type: AccountEnvelopesDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Already split.' })
  applySplit(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: ApplySplitDto,
  ): Promise<AccountEnvelopesDto> {
    return this.envelopes.applySplit(transactionId, dto)
  }

  @Post('envelopes/offers/:transactionId/dismiss')
  @HttpCode(204)
  @ApiOperation({ summary: '« Non » to the envelope offers on a transaction' })
  @ApiParam(TRANSACTION_PARAM)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async dismiss(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ): Promise<void> {
    await this.envelopes.dismissOffer(transactionId)
  }

  @Get('accounts/:id/envelopes')
  @ApiOperation({
    summary: 'An account split between its envelopes and « libre »',
    description:
      '« Libre » is the balance minus the envelopes; `shortfallCents` is what is missing when the balance falls under them (never reduced automatically). With the account’s split key.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: AccountEnvelopesDto })
  @ApiNotFoundResponse()
  forAccount(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountEnvelopesDto> {
    return this.envelopes.forAccount(id)
  }

  @Put('accounts/:id/envelope-key')
  @ApiOperation({
    summary: 'Set an account’s split key',
    description:
      'Each envelope’s share of the new savings arriving on the account, in basis points; at most 10 000 in all, the rest is « libre ». Applied as offers the owner confirms.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: SetSplitKeyDto })
  @ApiOkResponse({ type: AccountEnvelopesDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  setSplitKey(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSplitKeyDto,
  ): Promise<AccountEnvelopesDto> {
    return this.envelopes.setSplitKey(id, dto)
  }
}
