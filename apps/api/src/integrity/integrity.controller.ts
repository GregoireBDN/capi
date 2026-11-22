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
import { IntegrityDto, IntegrityQueryDto } from './dto/integrity.dto'
import { IntegrityService } from './integrity.service'

/** Data integrity checks (#427): read only, open to read tokens. */
@ApiTags('Integrity')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('integrity')
export class IntegrityController {
  constructor(private readonly integrity: IntegrityService) {}

  @Get()
  @ApiOperation({
    summary: 'Consistency checks computed from the stored data',
    description:
      'For the month: bank balances recomputed from the transactions vs the bank’s running balance and the statements, transactions entered by hand never matched by an import, income − expenses vs saved, moves between own accounts counted as income or expense. As it stands now: crypto quantities vs the last complete chain read, money owed never below zero and repayments never past their transfer. Each finding names its account and day. A check that cannot run is `failed`; the others still answer. Nothing is fixed automatically.',
  })
  @ApiQuery({ type: IntegrityQueryDto })
  @ApiOkResponse({ type: IntegrityDto })
  @ApiBadRequestResponse({ description: 'Invalid month.' })
  check(@Query() query: IntegrityQueryDto): Promise<IntegrityDto> {
    return this.integrity.check(query.month)
  }
}
