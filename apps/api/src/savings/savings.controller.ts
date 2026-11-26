import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import {
  SAVINGS_MONTHS_DEFAULT,
  SavingsOverviewDto,
  SavingsOverviewQueryDto,
  SavingsTargetDto,
  SavingsTargetResultDto,
} from './dto/savings.dto'
import { SavingsService } from './savings.service'


@ApiTags('Savings')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('savings')
export class SavingsController {
  constructor(private readonly savings: SavingsService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Monthly savings, averages, target and savings stock',
    description:
      'Headline figures of `month` (default: the current month when it has data, else the month the data stops in). Per calendar month (Europe/Paris): income, expenses, net savings and rate (transfers excluded, as the dashboard), one-off impact, amounts moved from checking to savings / investments, gap to the monthly target. Averages over the 3, 6 and 12 full months before the current one. Savings stock: savings accounts and investments (value, contributions, gain).',
  })
  @ApiQuery({ type: SavingsOverviewQueryDto })
  @ApiOkResponse({ type: SavingsOverviewDto })
  @ApiBadRequestResponse({ description: 'Invalid number of months.' })
  overview(
    @Query() query: SavingsOverviewQueryDto,
  ): Promise<SavingsOverviewDto> {
    return this.savings.overview(query.months ?? SAVINGS_MONTHS_DEFAULT, {
      month: query.month,
    })
  }

  @Put('target')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Set or clear the monthly savings target',
    description: 'Null clears the target.',
  })
  @ApiBody({ type: SavingsTargetDto })
  @ApiOkResponse({ type: SavingsTargetResultDto })
  @ApiBadRequestResponse({ description: 'Invalid amount.' })
  setTarget(@Body() dto: SavingsTargetDto): Promise<SavingsTargetResultDto> {
    return this.savings.setTarget(dto.monthlyTargetCents)
  }
}
