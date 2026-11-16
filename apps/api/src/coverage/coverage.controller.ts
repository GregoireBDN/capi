import { Controller, Get, UseGuards } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { DatabaseService } from '#/database/database.service'
import { coverageSummary } from './coverage'
import { CoverageDto } from './dto/coverage.dto'

@ApiTags('Coverage')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('coverage')
export class CoverageController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @ApiOperation({
    summary: 'How far the data goes, for the month navigators',
    description:
      'The latest day with imported data, the month pages open on without a `month` parameter (the current month when it has data, else the month the data stops in) and the months that have transactions.',
  })
  @ApiOkResponse({ type: CoverageDto })
  coverage(): Promise<CoverageDto> {
    return coverageSummary(this.database.db)
  }
}
