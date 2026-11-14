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
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
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
  BULK_UPDATE_MAX_IDS,
  BulkUpdateResultDto,
  BulkUpdateTransactionsDto,
  ListTransactionsQueryDto,
  ReviewCountDto,
  TransactionDto,
  TransactionFiltersQueryDto,
  TransactionListDto,
  TransactionSummaryDto,
  UpdateTransactionDto,
} from './dto/transaction.dto'
import {
  CreateManualExpenseDto,
  UpdateManualExpenseDto,
} from './dto/manual-expense.dto'
import { ManualExpensesService } from './manual-expenses.service'
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
    private readonly manualExpenses: ManualExpensesService,
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

  @Post('manual')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Note an expense by hand',
    description:
      'Amount, expense category, day (default: today in Europe/Paris), optional label (default: the category name), account (default: the first checking account). Counts in spending and budgets at once, never as imported data; the import of the bank export replaces it with the matching bank row, keeping its category and note.',
  })
  @ApiBody({ type: CreateManualExpenseDto })
  @ApiCreatedResponse({ type: TransactionDto })
  @ApiBadRequestResponse({
    description:
      'Not an expense category, not an open checking or savings account, no checking account, a future day, or invalid body.',
  })
  createManual(@Body() dto: CreateManualExpenseDto): Promise<TransactionDto> {
    return this.manualExpenses.create(dto)
  }

  @Patch('manual/:id')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Edit an expense noted by hand',
    description: 'Same fields as when noting it; all optional.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: UpdateManualExpenseDto })
  @ApiOkResponse({ type: TransactionDto })
  @ApiBadRequestResponse({ description: 'Invalid body or nothing to update.' })
  @ApiNotFoundResponse({ description: 'No manual expense with this id.' })
  updateManual(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateManualExpenseDto,
  ): Promise<TransactionDto> {
    return this.manualExpenses.update(id, dto)
  }

  @Delete('manual/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an expense noted by hand' })
  @ApiParam(ID_PARAM)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'No manual expense with this id.' })
  async removeManual(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.manualExpenses.remove(id)
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
