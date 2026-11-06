import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import {
  CreateGoalDto,
  ListGoalsQueryDto,
  SAVINGS_MONTHS_DEFAULT,
  SavingsGoalDto,
  SavingsOverviewDto,
  SavingsOverviewQueryDto,
  SavingsTargetDto,
  SavingsTargetResultDto,
  UpdateGoalDto,
} from './dto/savings.dto'
import { SavingsService } from './savings.service'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const

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
      'Per calendar month (Europe/Paris): income, expenses, net savings and rate (transfers excluded, as the dashboard), one-off impact, amounts moved from checking to savings / investments, gap to the monthly target. Averages over the 3, 6 and 12 full months before the current one. Savings stock: savings accounts and investments (value, contributions, gain).',
  })
  @ApiQuery({ type: SavingsOverviewQueryDto })
  @ApiOkResponse({ type: SavingsOverviewDto })
  @ApiBadRequestResponse({ description: 'Invalid number of months.' })
  overview(
    @Query() query: SavingsOverviewQueryDto,
  ): Promise<SavingsOverviewDto> {
    return this.savings.overview(query.months ?? SAVINGS_MONTHS_DEFAULT)
  }

  @Put('target')
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

  @Get('goals')
  @ApiOperation({
    summary: 'Savings goals with progress and projection',
    description:
      'Each goal comes with its current amount (linked accounts’ balances or manual amount), progress, the saving needed per month to reach it by its date, and the date it would be reached at the average monthly savings (6 full months, one-offs excluded).',
  })
  @ApiQuery({ type: ListGoalsQueryDto })
  @ApiOkResponse({ type: [SavingsGoalDto] })
  listGoals(@Query() query: ListGoalsQueryDto): Promise<SavingsGoalDto[]> {
    return this.savings.listGoals({ includeArchived: query.includeArchived })
  }

  @Post('goals')
  @ApiOperation({ summary: 'Create a savings goal' })
  @ApiBody({ type: CreateGoalDto })
  @ApiCreatedResponse({ type: SavingsGoalDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, unknown account, or `source = accounts` without accounts.',
  })
  createGoal(@Body() dto: CreateGoalDto): Promise<SavingsGoalDto> {
    return this.savings.createGoal(dto)
  }

  @Patch('goals/:id')
  @ApiOperation({
    summary: 'Change, archive or restore a savings goal',
    description:
      'Omitted fields keep their value; `accountIds` replaces the linked accounts.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: UpdateGoalDto })
  @ApiOkResponse({ type: SavingsGoalDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, unknown account, or `source = accounts` without accounts.',
  })
  @ApiNotFoundResponse()
  updateGoal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoalDto,
  ): Promise<SavingsGoalDto> {
    return this.savings.updateGoal(id, dto)
  }

  @Delete('goals/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a savings goal' })
  @ApiParam(ID_PARAM)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async removeGoal(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.savings.removeGoal(id)
  }
}
