import {
  Body,
  Controller,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import {
  BULK_UPDATE_MAX_IDS,
  BulkUpdateResultDto,
  BulkUpdateTransactionsDto,
  ListTransactionsQueryDto,
  ReviewCountDto,
  TransactionDto,
  TransactionListDto,
  UpdateTransactionDto,
} from './dto/transaction.dto'
import { TransactionsService } from './transactions.service'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const

@ApiTags('Transactions')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List transactions',
    description:
      'Filtered and paginated, newest booking date first (ties broken by id). `needsReview=true` is the review queue.',
  })
  // Explicit: the spec is generated without decorator metadata (tsx), so
  // Swagger cannot infer the query DTO from the parameter type.
  @ApiQuery({ type: ListTransactionsQueryDto })
  @ApiOkResponse({ type: TransactionListDto })
  @ApiBadRequestResponse({ description: 'Invalid filters.' })
  list(@Query() query: ListTransactionsQueryDto): Promise<TransactionListDto> {
    return this.transactionsService.list(query)
  }

  @Get('review-count')
  @ApiOperation({ summary: 'Number of transactions waiting for review' })
  @ApiOkResponse({ type: ReviewCountDto })
  async reviewCount(): Promise<ReviewCountDto> {
    return { count: await this.transactionsService.reviewCount() }
  }

  @Post('bulk-update')
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

  @Patch(':id')
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
