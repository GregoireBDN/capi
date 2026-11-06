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
import { ForecastDto, ForecastQueryDto } from './dto/forecast.dto'
import { ForecastService } from './forecast.service'

@ApiTags('Forecast')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('forecast')
export class ForecastController {
  constructor(private readonly forecastService: ForecastService) {}

  @Get()
  @ApiOperation({
    summary: 'End-of-month cash-flow forecast',
    description:
      'Current balance of the selected accounts, the remaining occurrences of their confirmed, active recurring items until the end of the month (Europe/Paris), and optionally an estimate of the day-to-day spending; projected day by day with the lowest point and the first day under the threshold. Transfers and one-offs never count in the estimate.',
  })
  @ApiQuery({ type: ForecastQueryDto })
  @ApiOkResponse({ type: ForecastDto })
  @ApiBadRequestResponse({
    description: 'Invalid query, or an unknown or investment account.',
  })
  forecast(@Query() query: ForecastQueryDto): Promise<ForecastDto> {
    return this.forecastService.forecast({
      accountIds: query.accountIds,
      thresholdCents: query.threshold,
      includeVariable: query.includeVariable,
    })
  }
}
