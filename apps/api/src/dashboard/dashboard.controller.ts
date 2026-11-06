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
import { currentMonth } from './calendar'
import { DashboardService } from './dashboard.service'
import {
  DashboardHistoryDto,
  DashboardHistoryQueryDto,
  DashboardOverviewDto,
  DashboardOverviewQueryDto,
  HISTORY_MONTHS_DEFAULT,
} from './dto/dashboard.dto'

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
      'Net worth now (per account, cash vs investments) and at the end of the previous month; income, expenses, net and savings rate of `month` and of the month before (transfers excluded, one-offs reported); review queue size.',
  })
  @ApiQuery({ type: DashboardOverviewQueryDto })
  @ApiOkResponse({ type: DashboardOverviewDto })
  @ApiBadRequestResponse({ description: 'Invalid month.' })
  overview(
    @Query() query: DashboardOverviewQueryDto,
  ): Promise<DashboardOverviewDto> {
    return this.dashboardService.overview(query.month ?? currentMonth())
  }

  @Get('history')
  @ApiOperation({
    summary: 'Monthly cash flow and month-end net worth',
    description:
      'The last `months` calendar months (Europe/Paris), current month included, oldest first: income, expenses and net (transfers excluded) and the net worth at each month end.',
  })
  @ApiQuery({ type: DashboardHistoryQueryDto })
  @ApiOkResponse({ type: DashboardHistoryDto })
  @ApiBadRequestResponse({ description: 'Invalid number of months.' })
  history(
    @Query() query: DashboardHistoryQueryDto,
  ): Promise<DashboardHistoryDto> {
    return this.dashboardService.history(query.months ?? HISTORY_MONTHS_DEFAULT)
  }
}
