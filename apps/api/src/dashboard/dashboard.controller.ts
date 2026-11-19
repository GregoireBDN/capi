import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { DashboardService } from './dashboard.service'
import {
  DashboardHistoryDto,
  DashboardHistoryQueryDto,
  DashboardOverviewDto,
  DashboardOverviewQueryDto,
  HISTORY_MONTHS_DEFAULT,
} from './dto/dashboard.dto'
import { MonthReviewDto, MonthReviewQueryDto } from './dto/review.dto'

@ApiTags('Dashboard')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Net worth, accounts and the month at a glance',
    description:
      'Net worth now (per account, cash vs investments, with the date each account’s data goes up to) and at the end of the previous month; income, expenses, net and savings rate of `month` and of the month before (transfers excluded, one-offs reported); review queue size. Without `month`: the current month when it has data, else the month the data stops in. While the month is partial, the previous month only counts the same first days (`period`).',
  })
  @ApiQuery({ type: DashboardOverviewQueryDto })
  @ApiOkResponse({ type: DashboardOverviewDto })
  @ApiBadRequestResponse({ description: 'Invalid month.' })
  overview(
    @Query() query: DashboardOverviewQueryDto,
  ): Promise<DashboardOverviewDto> {
    return this.dashboardService.overview(query.month)
  }

  @Get('history')
  @ApiOperation({
    summary: 'Monthly cash flow and month-end net worth',
    description:
      'The last `months` calendar months (Europe/Paris), current month included, oldest first: income, expenses and net (transfers excluded) and the net worth at each month end, with the balance of each account (and its type) behind it.',
  })
  @ApiQuery({ type: DashboardHistoryQueryDto })
  @ApiOkResponse({ type: DashboardHistoryDto })
  @ApiBadRequestResponse({ description: 'Invalid number of months.' })
  history(
    @Query() query: DashboardHistoryQueryDto,
  ): Promise<DashboardHistoryDto> {
    return this.dashboardService.history(query.months ?? HISTORY_MONTHS_DEFAULT)
  }

  @Get('review')
  @ApiOperation({
    summary: 'Review of a month against its budget',
    description:
      'Net worth at the month end and its change (saved from the month’s cash flow vs the rest), income, expenses and savings rate (transfers excluded), spending vs the budget with the categories furthest above and below their target, and the accounts not updated up to the month end. Default month (`defaultMonth`): the oldest past month left open since the first month ever closed, else the current month in Europe/Paris (the previous month before any close); the current month is read so far (net worth as of today).',
  })
  @ApiQuery({ type: MonthReviewQueryDto })
  @ApiOkResponse({ type: MonthReviewDto })
  @ApiBadRequestResponse({ description: 'Invalid month.' })
  review(@Query() query: MonthReviewQueryDto): Promise<MonthReviewDto> {
    return this.dashboardService.review(query.month)
  }
}
