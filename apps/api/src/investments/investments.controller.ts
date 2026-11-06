import { Controller, Get, UseGuards } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { InvestmentsSummaryDto } from './dto/snapshot.dto'
import { InvestmentsService } from './investments.service'

@ApiTags('Investments')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('investments')
export class InvestmentsController {
  constructor(private readonly investments: InvestmentsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Value, contributions and gain of the investment accounts',
    description:
      'Non-archived brokerage, life insurance, employee savings and crypto accounts, from their latest snapshots. The gain only covers accounts whose contributions are known.',
  })
  @ApiOkResponse({ type: InvestmentsSummaryDto })
  summary(): Promise<InvestmentsSummaryDto> {
    return this.investments.summary()
  }
}
