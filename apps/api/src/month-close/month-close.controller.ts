import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { MONTH_PATTERN } from '#/dashboard/calendar'
import {
  CloseMonthDto,
  MonthCloseDto,
  MonthParamDto,
  UpdateMonthCloseDto,
} from './dto/month-close.dto'
import { MonthCloseService } from './month-close.service'

const MONTH_PARAM = {
  name: 'month',
  type: String,
  pattern: MONTH_PATTERN.source,
  example: '2026-10',
} as const

/**
 * Guided month-end review (#75). Reading is open to read tokens; ticking
 * steps, notes, closing and reopening are session-only (the default for
 * mutating routes).
 */
@ApiTags('Month close')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('month-close')
export class MonthCloseController {
  constructor(private readonly monthClose: MonthCloseService) {}

  @Get(':month')
  @ApiOperation({
    summary: 'Steps, progress and report of a month’s review',
    description:
      'Each step and whether it is done: imports up to date per cash account (missing days, running-balance gaps), review queue of the month empty, recurring items confirmed and the month’s price changes seen, budget seen, savings seen, investment values updated, month closed. The report as the data stands now and, once closed, the report frozen then with the figures changed since.',
  })
  @ApiParam(MONTH_PARAM)
  @ApiOkResponse({ type: MonthCloseDto })
  @ApiBadRequestResponse({ description: 'Invalid month.' })
  get(@Param() params: MonthParamDto): Promise<MonthCloseDto> {
    return this.monthClose.get(params.month)
  }

  @Patch(':month')
  @ApiOperation({
    summary: 'Save the notes and the steps marked as seen',
  })
  @ApiParam(MONTH_PARAM)
  @ApiBody({ type: UpdateMonthCloseDto })
  @ApiOkResponse({ type: MonthCloseDto })
  @ApiBadRequestResponse({ description: 'Invalid month or body.' })
  @ApiConflictResponse({ description: 'The month is closed.' })
  update(
    @Param() params: MonthParamDto,
    @Body() dto: UpdateMonthCloseDto,
  ): Promise<MonthCloseDto> {
    return this.monthClose.update(params.month, dto)
  }

  @Post(':month/close')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Close the month',
    description:
      'Freezes the month’s report (totals per category, income, expenses, savings, net worth, notes). Only a month before the current one (Europe/Paris) can be closed.',
  })
  @ApiParam(MONTH_PARAM)
  @ApiBody({ type: CloseMonthDto })
  @ApiOkResponse({ type: MonthCloseDto })
  @ApiBadRequestResponse({ description: 'Invalid month, or not over yet.' })
  @ApiConflictResponse({ description: 'Already closed.' })
  close(
    @Param() params: MonthParamDto,
    @Body() dto: CloseMonthDto,
  ): Promise<MonthCloseDto> {
    return this.monthClose.close(params.month, dto)
  }

  @Post(':month/reopen')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reopen a closed month',
    description: 'Drops the frozen report; the notes are kept.',
  })
  @ApiParam(MONTH_PARAM)
  @ApiOkResponse({ type: MonthCloseDto })
  @ApiBadRequestResponse({ description: 'Invalid month.' })
  @ApiConflictResponse({ description: 'Not closed.' })
  reopen(@Param() params: MonthParamDto): Promise<MonthCloseDto> {
    return this.monthClose.reopen(params.month)
  }
}
