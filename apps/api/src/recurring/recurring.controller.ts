import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import '#/auth/request-user'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import {
  ConfirmRecurringItemsDto,
  DeclarePrepaidDto,
  PrepaidDeclarationDto,
  RecurringConfirmResultDto,
  RecurringDetectResultDto,
  RecurringItemDto,
  RecurringListQueryDto,
  RecurringSummaryDto,
  UpdateRecurringItemDto,
} from './dto/recurring.dto'
import { RecurringService } from './recurring.service'

@ApiTags('Recurring')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('recurring')
export class RecurringController {
  constructor(private readonly recurringService: RecurringService) {}

  @Post('detect')
  @TokenAccess('write')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Detect recurring transactions',
    description:
      'Runs the detector over every transaction (transfers and one-offs ignored). New active series become suggestions; confirmed and dismissed items keep their status and user fields, only their stats are refreshed. Dismissed items are never suggested again. Idempotent.',
  })
  @ApiOkResponse({ type: RecurringDetectResultDto })
  detect(): Promise<RecurringDetectResultDto> {
    return this.recurringService.detect()
  }

  @Get()
  @ApiOperation({
    summary: 'Recurring items with their stats',
    description:
      'Stats are computed from the transactions: typical and latest amounts, monthly-equivalent and yearly costs, next expected date, price change, active or not, latest occurrences.',
  })
  // Explicit: the spec is generated without decorator metadata (tsx), so
  // Swagger cannot infer the query DTO from the parameter type.
  @ApiQuery({ type: RecurringListQueryDto })
  @ApiOkResponse({ type: [RecurringItemDto] })
  @ApiBadRequestResponse({ description: 'Invalid status.' })
  list(@Query() query: RecurringListQueryDto): Promise<RecurringItemDto[]> {
    return this.recurringService.list(query.status)
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Monthly and yearly recurring costs',
    description:
      'Confirmed, active items only: debits (fixed costs, the others, subscriptions) and credits. Yearly = sum of the yearly costs; monthly = yearly / 12.',
  })
  @ApiOkResponse({ type: RecurringSummaryDto })
  summary(): Promise<RecurringSummaryDto> {
    return this.recurringService.summary()
  }

  @Post('confirm')
  @TokenAccess('write')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Confirm several items',
    description: 'Unknown ids and already confirmed items are ignored.',
  })
  @ApiBody({ type: ConfirmRecurringItemsDto })
  @ApiOkResponse({ type: RecurringConfirmResultDto })
  @ApiBadRequestResponse({ description: 'Invalid ids.' })
  confirm(
    @Body() dto: ConfirmRecurringItemsDto,
  ): Promise<RecurringConfirmResultDto> {
    return this.recurringService.confirm(dto.ids)
  }

  @Post('prepaid')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Declare a prepaid subscription',
    description:
      'Makes an expense the upfront payment of a subscription paid for `termMonths` (#314): the recurring item of its account and merchant becomes, or is created as, a confirmed prepaid item. Its monthly cost is the payment ÷ the term, its renewal the payment date + the term; later charges of the merchant around the renewal date are linked to it. Session only.',
  })
  @ApiBody({ type: DeclarePrepaidDto })
  @ApiOkResponse({ type: PrepaidDeclarationDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, a transaction that is not an expense, or a label without a merchant.',
  })
  @ApiNotFoundResponse({ description: 'Unknown transaction.' })
  @ApiConflictResponse({
    description: 'The transaction already pays a prepaid subscription.',
  })
  declarePrepaid(
    @Body() dto: DeclarePrepaidDto,
  ): Promise<PrepaidDeclarationDto> {
    return this.recurringService.declarePrepaid(dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Remove a prepaid item',
    description:
      'Undoes a declaration that created the item: its payments are unlinked. Prepaid items only. Session only.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'The item is not prepaid.' })
  @ApiNotFoundResponse({ description: 'Unknown item.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.recurringService.remove(id)
  }

  @Patch(':id')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Edit a recurring item',
    description:
      'Confirm or dismiss it, rename it, change its category, fixed-cost flag, cadence or notes, cancel it from a date (`endedOn`, confirmed items only) or reactivate it (`endedOn: null`), set or clear its prepaid term (`termMonths`), keep its coming renewal (`keepRenewal`). Omitted fields are kept.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateRecurringItemDto })
  @ApiOkResponse({ type: RecurringItemDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, unknown category, `endedOn` on an item that is not confirmed, `keepRenewal` on an item that is not prepaid, or a term on a credit or an item without a debit.',
  })
  @ApiForbiddenResponse({
    description:
      'Access token with `endedOn: null`, `termMonths` or `keepRenewal`: reactivating, the prepaid term and renewals stay in the app (session only). Cancelling (`endedOn` a date) is open to write tokens (#597): `cancel_subscription`, re-approved by the owner each time.',
  })
  @ApiNotFoundResponse({ description: 'Unknown item.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringItemDto,
    @Req() req: FastifyRequest,
  ): Promise<RecurringItemDto> {
    // The route is open to write tokens; a token may cancel from a date
    // (#597, `cancel_subscription`), reactivating stays the owner's, in the app.
    if (req.accessToken && dto.endedOn === null) {
      throw new ForbiddenException(
        'Reactivating a recurring item needs a session',
      )
    }
    if (
      req.accessToken &&
      (dto.termMonths !== undefined || dto.keepRenewal !== undefined)
    ) {
      throw new ForbiddenException(
        'The prepaid term and renewals of a recurring item need a session',
      )
    }
    return this.recurringService.update(id, dto)
  }
}
