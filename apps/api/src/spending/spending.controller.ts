import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import {
  SpendingByCategoryDto,
  SpendingByCategoryQueryDto,
  SpendingTrendDto,
  SpendingTrendQueryDto,
} from './dto/spending.dto'
import { SpendingService } from './spending.service'

@ApiTags('Spending')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('spending')
export class SpendingController {
  constructor(private readonly spendingService: SpendingService) {}

  @Get('by-category')
  @ApiOperation({
    summary: 'Spending of a month by category',
    description:
      'Every `expense` transaction of the month, netted per category (refunds reduce their category), with the previous month and the average of the previous full months. Transfers never count; one-offs only with `includeOneOffs=true`.',
  })
  // Explicit: the spec is generated without decorator metadata (tsx), so
  // Swagger cannot infer the query DTO from the parameter type.
  @ApiQuery({ type: SpendingByCategoryQueryDto })
  @ApiOkResponse({ type: SpendingByCategoryDto })
  @ApiBadRequestResponse({ description: 'Invalid filters.' })
  byCategory(
    @Query() query: SpendingByCategoryQueryDto,
  ): Promise<SpendingByCategoryDto> {
    return this.spendingService.byCategory(query)
  }

  @Get('trend')
  @ApiOperation({
    summary: 'Monthly spending over the last months',
    description:
      'Per month, the top categories of the period plus `other`, or a single category with `categoryId` / `uncategorized=true`. Same rules as `by-category`.',
  })
  @ApiQuery({ type: SpendingTrendQueryDto })
  @ApiOkResponse({ type: SpendingTrendDto })
  @ApiBadRequestResponse({ description: 'Invalid filters.' })
  @ApiNotFoundResponse({ description: 'Unknown category.' })
  trend(@Query() query: SpendingTrendQueryDto): Promise<SpendingTrendDto> {
    return this.spendingService.trend(query)
  }
}
