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
  ApiCookieAuth,
  ApiConflictResponse,
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
  BULK_UPDATE_MAX_IDS,
  BulkUpdateResultDto,
  BulkUpdateTransactionsDto,
  ListTransactionsQueryDto,
  ReviewCountDto,
  SplitTransactionDto,
  TransactionDto,
  TransactionFiltersQueryDto,
  TransactionListDto,
  TransactionSummaryDto,
  UpdateTransactionDto,
} from './dto/transaction.dto'
import {
  CreateManualTransactionDto,
  ManualSuggestionsDto,
  ManualSuggestionsQueryDto,
  UpdateManualTransactionDto,
} from './dto/manual-transaction.dto'
import { ManualTransactionsService } from './manual-transactions.service'
import { TransactionsService } from './transactions.service'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const

@ApiTags('Transactions')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly manualTransactions: ManualTransactionsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List transactions',
    description:
      'Filtered and paginated, newest booking date first unless `sort` says otherwise (ties broken by id). `needsReview=true` is the review queue.',
  })
  // Explicit: the spec is generated without decorator metadata (tsx), so
  // Swagger cannot infer the query DTO from the parameter type.
  @ApiQuery({ type: ListTransactionsQueryDto })
  @ApiOkResponse({ type: TransactionListDto })
  @ApiBadRequestResponse({ description: 'Invalid filters.' })
  list(@Query() query: ListTransactionsQueryDto): Promise<TransactionListDto> {
    return this.transactionsService.list(query)
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Totals of the transactions matching the filters',
    description:
      'Same filters as the list. Income and expense exclude transfers between own accounts, which are only counted (`transferCount`); one-off amounts are reported apart as well as included.',
  })
  @ApiQuery({ type: TransactionFiltersQueryDto })
  @ApiOkResponse({ type: TransactionSummaryDto })
  @ApiBadRequestResponse({ description: 'Invalid filters.' })
  summary(
    @Query() query: TransactionFiltersQueryDto,
  ): Promise<TransactionSummaryDto> {
    return this.transactionsService.summary(query)
  }

  @Get('review-count')
  @ApiOperation({ summary: 'Number of transactions waiting for review' })
  @ApiOkResponse({ type: ReviewCountDto })
  async reviewCount(): Promise<ReviewCountDto> {
    return { count: await this.transactionsService.reviewCount() }
  }

  @Post('bulk-update')
  @TokenAccess('write')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Apply the same changes to several transactions',
    description: `At most ${BULK_UPDATE_MAX_IDS} ids, in one database transaction. Same semantics as \`PATCH /transactions/{id}\`.`,
  })
  @ApiBody({ type: BulkUpdateTransactionsDto })
  @ApiOkResponse({ type: BulkUpdateResultDto })
  @ApiBadRequestResponse({
    description:
      'Unknown category or rule, nothing to update, or invalid body.',
  })
  bulkUpdate(
    @Body() dto: BulkUpdateTransactionsDto,
  ): Promise<BulkUpdateResultDto> {
    return this.transactionsService.bulkUpdate(dto)
  }

  @Get('manual/suggestions')
  @ApiOperation({
    summary: 'Labels to suggest when entering a transaction by hand',
    description:
      'Most used first: the labels typed on manual transactions of the kind over the last year (counted double) and the merchants of imported rows of the kind seen at least twice over the last six months, each with the category it is filed under at least 70 % of the time when that category is open, else null.',
  })
  @ApiQuery({ type: ManualSuggestionsQueryDto })
  @ApiOkResponse({ type: ManualSuggestionsDto })
  @ApiBadRequestResponse({ description: 'Unknown kind.' })
  manualSuggestions(
    @Query() query: ManualSuggestionsQueryDto,
  ): Promise<ManualSuggestionsDto> {
    return this.manualTransactions.suggestions(query.kind)
  }

  @Post('manual')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Enter a transaction by hand',
    description:
      'Expense, income or transfer: amount and direction (default: in for income, out otherwise), kind (default: the category’s, else expense), optional category (without one it goes to review and needs a label), day (default: today in Europe/Paris), label (default: the category name), account (default: the first checking account), one-off flag and note. Counts in statistics, budgets and balances at once, never as imported data; the import of the bank export replaces it with the matching bank row, keeping its category, note and split.',
  })
  @ApiBody({ type: CreateManualTransactionDto })
  @ApiCreatedResponse({ type: TransactionDto })
  @ApiBadRequestResponse({
    description:
      'Unknown category, neither label nor category, not an open checking or savings account, no checking account, a future day, or invalid body.',
  })
  createManual(
    @Body() dto: CreateManualTransactionDto,
  ): Promise<TransactionDto> {
    return this.manualTransactions.create(dto)
  }

  @Patch('manual/:id')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Edit a transaction entered by hand',
    description:
      'Same fields as when entering it; all optional. The sign is kept unless `direction` is sent; a split transaction keeps its amount.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: UpdateManualTransactionDto })
  @ApiOkResponse({ type: TransactionDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, nothing to update, or an amount change on a split transaction.',
  })
  @ApiNotFoundResponse({ description: 'No manual transaction with this id.' })
  updateManual(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateManualTransactionDto,
  ): Promise<TransactionDto> {
    return this.manualTransactions.update(id, dto)
  }

  @Delete('manual/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a transaction entered by hand' })
  @ApiParam(ID_PARAM)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'No manual transaction with this id.' })
  @ApiConflictResponse({
    description:
      'It carries a share already repaid or let go (#438): unlink its repayments, or claim it again, first.',
  })
  async removeManual(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.manualTransactions.remove(id)
  }

  @Put(':id/splits')
  // Open to write tokens (#357, MCP `split_transaction`); undoing the split
  // (`DELETE`) stays session-only like the other undos.
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Split a transaction between categories',
    description:
      'Replaces the parts (2 to 20). Each has the sign of the transaction and they sum exactly to its amount; the transaction takes the category of the largest part. Statistics and budgets count each part in its category, with its category’s kind: an incoming part in an expense category is a refund of that category, one in an income category is income (a transfer’s parts stay transfers). Choosing a category for the whole transaction (`PATCH`) ends the split.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: SplitTransactionDto })
  @ApiOkResponse({ type: TransactionDto })
  @ApiBadRequestResponse({
    description:
      'Parts that do not sum to the amount, of the wrong sign, an unknown category, a transfer category mixed with income or expense ones, or invalid body.',
  })
  @ApiNotFoundResponse()
  split(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SplitTransactionDto,
  ): Promise<TransactionDto> {
    return this.transactionsService.split(id, dto.parts)
  }

  @Delete(':id/splits')
  @ApiOperation({
    summary: 'Undo the split of a transaction',
    description: 'It stays in its current category (the largest part’s).',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: TransactionDto })
  @ApiNotFoundResponse()
  unsplit(@Param('id', ParseUUIDPipe) id: string): Promise<TransactionDto> {
    return this.transactionsService.unsplit(id)
  }

  @Delete(':id/correction')
  @ApiOperation({
    summary: 'Restore the bank amount and date of a corrected transaction',
    description:
      'An imported transaction keeps its bank amount and date (#398): corrections made before can only be undone, never made again.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: TransactionDto })
  @ApiBadRequestResponse({
    description: 'The bank amount would not match the split parts.',
  })
  @ApiNotFoundResponse()
  restoreBankValues(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TransactionDto> {
    return this.transactionsService.restoreBankValues(id)
  }

  @Patch(':id')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Correct a transaction',
    description:
      'Category, kind, one-off flag, note or review flag. A category set here is a manual one: rules never overwrite it.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: UpdateTransactionDto })
  @ApiOkResponse({ type: TransactionDto })
  @ApiBadRequestResponse({
    description: 'Unknown category or rule, or invalid body.',
  })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionDto> {
    return this.transactionsService.update(id, dto)
  }
}
