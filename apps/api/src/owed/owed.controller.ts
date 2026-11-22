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
import '#/auth/request-user'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { TransactionDto } from '#/transactions/dto/transaction.dto'
import {
  ContactDto,
  ContactOwedDto,
  ContactsQueryDto,
  CreateContactDto,
  CreateDebtDto,
  CreateSharesDto,
  ForgiveReceivableDto,
  LinkRepaymentDto,
  LinkRepaymentResultDto,
  OwedSummaryDto,
  ReceivableDto,
  RecurringShareInfoDto,
  RepaymentOptionsDto,
  RepaymentOptionsQueryDto,
  RepaymentSuggestionDto,
  ReplaceSharesDto,
  SetRecurringShareDto,
  UpdateContactDto,
  UpdateReceivableDto,
} from './dto/owed.dto'
import { OwedService } from './owed.service'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const

@ApiTags('Contacts')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly owed: OwedService) {}

  @Get()
  @ApiOperation({
    summary: 'Contacts',
    description:
      'The people the owner shares expenses with (#359), by name, with what is open both ways. Archived ones only with `archived=true`.',
  })
  @ApiQuery({ type: ContactsQueryDto })
  @ApiOkResponse({ type: [ContactDto] })
  list(@Query() query: ContactsQueryDto): Promise<ContactDto[]> {
    return this.owed.listContacts(query.archived ?? false)
  }

  @Post()
  @ApiOperation({
    summary: 'Add a contact',
    description: 'Session only (contact settings).',
  })
  @ApiBody({ type: CreateContactDto })
  @ApiOkResponse({ type: ContactDto })
  @ApiConflictResponse({ description: 'A contact already has this name.' })
  create(@Body() dto: CreateContactDto): Promise<ContactDto> {
    return this.owed.createContact(dto)
  }

  @Get(':id/owed')
  @ApiOperation({
    summary: 'A contact’s page',
    description:
      'Totals, open items and history both ways (« Il vous doit », « Vous lui devez », never netted), this month’s expected repayments and the recurring items shared with them.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: ContactOwedDto })
  @ApiNotFoundResponse({ description: 'Unknown contact.' })
  contactOwed(@Param('id', ParseUUIDPipe) id: string): Promise<ContactOwedDto> {
    return this.owed.contactOwed(id)
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a contact',
    description:
      'Name, bank words, usual repayment day, archive. Session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: UpdateContactDto })
  @ApiOkResponse({ type: ContactDto })
  @ApiConflictResponse({ description: 'A contact already has this name.' })
  @ApiNotFoundResponse({ description: 'Unknown contact.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<ContactDto> {
    return this.owed.updateContact(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a contact',
    description: 'Only one never used; archive the others. Session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'The contact has a history.' })
  @ApiNotFoundResponse({ description: 'Unknown contact.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.owed.deleteContact(id)
  }
}

@ApiTags('Owed')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('owed')
export class OwedController {
  constructor(private readonly owed: OwedService) {}

  @Get()
  @ApiOperation({
    summary: 'Money owed, both ways',
    description:
      '« Dépenses partagées »: « On me doit » and « Je dois » as two lists, never netted, one row per person (the oldest open item’s age), the people all settled apart, and this month’s repayments expected from shared recurring items. Outside the net worth.',
  })
  @ApiOkResponse({ type: OwedSummaryDto })
  summary(): Promise<OwedSummaryDto> {
    return this.owed.summary()
  }
}

@ApiTags('Owed')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('receivables')
export class ReceivablesController {
  constructor(private readonly owed: OwedService) {}

  @Post()
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Share an expense',
    description:
      'Says who owes what on an expense the owner paid (`owed_to_me`): a person by id or by name (created when new). The owner’s spending is then his part, on the day of the expense. Open to write tokens (MCP `share_expense`).',
  })
  @ApiBody({ type: CreateSharesDto })
  @ApiOkResponse({ type: TransactionDto })
  @ApiBadRequestResponse({
    description:
      'Not an expense paid from an account, a split expense without `splitId`, or shares above the expense.',
  })
  @ApiConflictResponse({
    description: 'One of the people already has a share of it.',
  })
  @ApiNotFoundResponse({ description: 'Unknown transaction or contact.' })
  create(@Body() dto: CreateSharesDto): Promise<TransactionDto> {
    return this.owed.createShares(dto)
  }

  @Post('debts')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Note an expense someone paid for the owner',
    description:
      '« Quelqu’un a payé pour moi »: a manual expense without an account holding the owner’s part (his spending, in its category, on its day) and what he owes the contact (`i_owe`), the bill kept beside. Open to write tokens.',
  })
  @ApiBody({ type: CreateDebtDto })
  @ApiOkResponse({ type: TransactionDto })
  @ApiBadRequestResponse({
    description:
      'A part above the bill, a category that is not an expense, or a day in the future.',
  })
  createDebt(@Body() dto: CreateDebtDto): Promise<TransactionDto> {
    return this.owed.createDebt(dto)
  }

  @Get('suggestions')
  @ApiOperation({
    summary: 'Repayments to confirm',
    description:
      'Review queue (« Remboursement de Camille ? »): recent transfers not linked yet whose label matches a contact’s bank words and whose amount is exactly some of their open items.',
  })
  @ApiOkResponse({ type: [RepaymentSuggestionDto] })
  suggestions(): Promise<RepaymentSuggestionDto[]> {
    return this.owed.repaymentSuggestions()
  }

  @Get('repayment-options')
  @ApiOperation({
    summary: 'What a transfer can repay',
    description:
      'For « C’est un remboursement › » (money in) or « Je rembourse … › » (money out): the people with something open that way, one person’s open items oldest first, and the suggestion to tick.',
  })
  @ApiQuery({ type: RepaymentOptionsQueryDto })
  @ApiOkResponse({ type: RepaymentOptionsDto })
  @ApiBadRequestResponse({
    description: 'An expense paid by a contact, or a split without `splitId`.',
  })
  @ApiNotFoundResponse({ description: 'Unknown transaction.' })
  options(
    @Query() query: RepaymentOptionsQueryDto,
  ): Promise<RepaymentOptionsDto> {
    return this.owed.repaymentOptions(
      query.transactionId,
      query.contactId,
      query.splitId,
    )
  }

  @Post('payments')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Link a repayment',
    description:
      'Links a transfer (or « Réglé autrement » without one) to one or several items, partly or in full: the linked part is neither income nor spending, the rest of the transfer stays in its category. Never past the transfer nor past what is left on an item. Open to write tokens (MCP `link_repayment`).',
  })
  @ApiBody({ type: LinkRepaymentDto })
  @ApiOkResponse({ type: LinkRepaymentResultDto })
  @ApiBadRequestResponse({
    description:
      'Past the transfer or an item, an item let go, the wrong direction, or a day in the future.',
  })
  @ApiNotFoundResponse({ description: 'Unknown transaction.' })
  link(@Body() dto: LinkRepaymentDto): Promise<LinkRepaymentResultDto> {
    return this.owed.linkRepayment(dto)
  }

  @Delete('payments/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Unlink a repayment',
    description: 'Session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Unknown payment.' })
  async unlink(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.owed.deletePayment(id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'One item' })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: ReceivableDto })
  @ApiNotFoundResponse({ description: 'Unknown item.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ReceivableDto> {
    return this.owed.findReceivable(id)
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit an item',
    description:
      'Its amount (never below what was repaid; for « Je dois », the owner’s part of the expense) or note. Session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: UpdateReceivableDto })
  @ApiOkResponse({ type: ReceivableDto })
  @ApiNotFoundResponse({ description: 'Unknown item.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReceivableDto,
  ): Promise<ReceivableDto> {
    return this.owed.updateReceivable(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete an item',
    description:
      'A share goes, its expense stays; what the owner owes goes with its expense « Quelqu’un a payé pour moi ». Session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Unknown item.' })
  @ApiConflictResponse({
    description:
      'Already repaid, even partly, or let go (#438): unlink its repayments, or claim it again, first.',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.owed.deleteReceivable(id)
  }

  @Post(':id/forgive')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Let a debt go',
    description:
      '« Je ne me fais pas rembourser » (or « … ne veut pas être remboursé »): what was not repaid comes back into (or, for `i_owe`, leaves) the owner’s spending. Reversible. Session only: Claude never lets a debt go.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: ForgiveReceivableDto })
  @ApiOkResponse({ type: ReceivableDto })
  @ApiBadRequestResponse({ description: 'Already repaid.' })
  @ApiConflictResponse({ description: 'Already let go.' })
  @ApiNotFoundResponse({ description: 'Unknown item.' })
  forgive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForgiveReceivableDto,
  ): Promise<ReceivableDto> {
    return this.owed.forgive(id, dto)
  }

  @Delete(':id/forgive')
  @ApiOperation({
    summary: 'Claim a debt again',
    description: '« Réclamer à nouveau ». Session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: ReceivableDto })
  @ApiNotFoundResponse({ description: 'Unknown item.' })
  unforgive(@Param('id', ParseUUIDPipe) id: string): Promise<ReceivableDto> {
    return this.owed.unforgive(id)
  }
}

@ApiTags('Owed')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller()
export class OwedLinksController {
  constructor(private readonly owed: OwedService) {}

  @Put('transactions/:id/shares')
  @ApiOperation({
    summary: 'Set who an expense is shared with',
    description:
      '« J’ai payé pour quelqu’un »: everyone listed gets or keeps a share of that amount, the others lose theirs (refused once partly repaid or let go). An empty list stops sharing it. Session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: ReplaceSharesDto })
  @ApiOkResponse({ type: TransactionDto })
  @ApiBadRequestResponse({
    description:
      'Not an expense paid from an account, shares above the expense, or a share below what was repaid on it.',
  })
  @ApiConflictResponse({ description: 'Removing a share repaid or let go.' })
  @ApiNotFoundResponse({ description: 'Unknown transaction or contact.' })
  replaceShares(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceSharesDto,
  ): Promise<TransactionDto> {
    return this.owed.replaceShares(id, dto)
  }

  @Put('recurring/:id/share')
  @ApiOperation({
    summary: 'Share a recurring item',
    description:
      'Each charge of a confirmed recurring debit booked from `from` on gets the contact’s share (a rate or an amount), unless it has its own; changing the share changes later charges only. Session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: SetRecurringShareDto })
  @ApiOkResponse({ type: RecurringShareInfoDto })
  @ApiBadRequestResponse({
    description: 'Not a confirmed debit, or both a rate and an amount.',
  })
  @ApiNotFoundResponse({ description: 'Unknown item or contact.' })
  setRecurringShare(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRecurringShareDto,
  ): Promise<RecurringShareInfoDto> {
    return this.owed.setRecurringShare(id, dto)
  }

  @Delete('recurring/:id/share')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Stop sharing a recurring item',
    description: 'The shares already made stay. Session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Unknown item.' })
  async clearRecurringShare(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.owed.clearRecurringShare(id)
  }
}
