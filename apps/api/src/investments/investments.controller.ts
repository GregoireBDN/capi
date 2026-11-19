import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiParam,
  ApiQuery,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { shiftMonth } from '#/dashboard/calendar'
import { parisToday } from './days'
import {
  InvestmentFlowsDto,
  InvestmentFlowsQueryDto,
  InvestmentsSummaryDto,
} from './dto/snapshot.dto'
import {
  InvestmentMovementDto,
  InvestmentMovementsDto,
  InvestmentMovementsQueryDto,
  LinkCryptoMovementDto,
} from './dto/movements.dto'
import { InvestmentsService } from './investments.service'
import { MovementsService } from './movements.service'

/** Months `GET /investments/flows` covers by default. */
export const INVESTMENT_FLOWS_MONTHS_DEFAULT = 12

@ApiTags('Investments')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('investments')
export class InvestmentsController {
  constructor(
    private readonly investments: InvestmentsService,
    private readonly movements: MovementsService,
  ) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Value, contributions and gain of the investment accounts',
    description:
      'Non-archived brokerage, life insurance, employee savings and crypto accounts, from their latest snapshots. Contributions come from the transfers linked to an account when it has some (`contributionsSource`), else from the snapshots. The gain only covers accounts whose contributions are known.',
  })
  @ApiOkResponse({ type: InvestmentsSummaryDto })
  summary(): Promise<InvestmentsSummaryDto> {
    return this.investments.summary()
  }

  @Get('flows')
  @ApiOperation({
    summary: 'Where the invested money went',
    description:
      'Transfers linked to investment accounts (#296) over the last `months` calendar months, the current one (Europe/Paris) included: per account and per month. Transfers stay transfers: never income or expense.',
  })
  @ApiQuery({
    name: 'months',
    required: false,
    type: 'integer',
    description: 'Calendar months covered, the current one included (1–120, default 12).',
  })
  @ApiOkResponse({ type: InvestmentFlowsDto })
  flows(@Query() query: InvestmentFlowsQueryDto): Promise<InvestmentFlowsDto> {
    const today = parisToday()
    const months = query.months ?? INVESTMENT_FLOWS_MONTHS_DEFAULT
    const from = `${shiftMonth(today.slice(0, 7), 1 - months)}-01`
    return this.investments.flows(from, today)
  }

  @Get('movements')
  @ApiOperation({
    summary: 'Movements towards the investments',
    description:
      'Bank transfers linked to investment accounts and coins moved between an exchange and the owner’s other crypto accounts (#296), over the last `months` calendar months, newest first; with `accountId`, only those of that account.',
  })
  @ApiQuery({
    name: 'months',
    required: false,
    type: 'integer',
    description: 'Calendar months covered, the current one included (1–120, default 12).',
  })
  @ApiQuery({
    name: 'accountId',
    required: false,
    type: String,
    format: 'uuid',
    description: 'Only the movements of this account.',
  })
  @ApiOkResponse({ type: InvestmentMovementsDto })
  listMovements(
    @Query() query: InvestmentMovementsQueryDto,
  ): Promise<InvestmentMovementsDto> {
    const today = parisToday()
    const months = query.months ?? INVESTMENT_FLOWS_MONTHS_DEFAULT
    const from = `${shiftMonth(today.slice(0, 7), 1 - months)}-01`
    return this.movements.list(from, today, query.accountId)
  }
}

@ApiTags('Investments')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('crypto-movements')
export class CryptoMovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Patch(':id')
  @ApiOperation({
    summary: 'Link an exchange withdrawal or deposit to another crypto account',
    description:
      'The Ledger the coins went to or came from (#296); `null` unlinks it. A wallet’s contributions are the cost of the coins withdrawn to it. Session only.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: LinkCryptoMovementDto })
  @ApiOkResponse({ type: InvestmentMovementDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  link(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: LinkCryptoMovementDto,
  ): Promise<InvestmentMovementDto> {
    return this.movements.linkCrypto(id, body.counterpartAccountId ?? null)
  }
}
