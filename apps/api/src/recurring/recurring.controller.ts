import {
  Body,
  Controller,
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

  @Patch(':id')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Edit a recurring item',
    description:
      'Confirm or dismiss it, rename it, change its category, fixed-cost flag, cadence or notes, cancel it from a date (`endedOn`, confirmed items only) or reactivate it (`endedOn: null`). Omitted fields are kept.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateRecurringItemDto })
  @ApiOkResponse({ type: RecurringItemDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, unknown category, or `endedOn` on an item that is not confirmed.',
  })
  @ApiForbiddenResponse({
    description:
      'Access token with `endedOn`: cancelling stays in the app (session only).',
  })
  @ApiNotFoundResponse({ description: 'Unknown item.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringItemDto,
    @Req() req: FastifyRequest,
  ): Promise<RecurringItemDto> {
    // The route is open to write tokens for the other fields; a
    // cancellation is the owner's, in the app.
    if (req.accessToken && dto.endedOn !== undefined) {
      throw new ForbiddenException(
        'Cancelling a recurring item needs a session',
      )
    }
    return this.recurringService.update(id, dto)
  }
}
