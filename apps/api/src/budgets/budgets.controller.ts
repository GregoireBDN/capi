import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { BudgetsService } from './budgets.service'
import {
  BUDGET_HISTORY_MONTHS_DEFAULT,
  BUDGET_SUGGEST_MONTHS_DEFAULT,
  BudgetDto,
  BudgetHistoryDto,
  BudgetHistoryQueryDto,
  BudgetMonthDto,
  BudgetMonthQueryDto,
  BudgetRemoveQueryDto,
  BudgetSuggestionsDto,
  BudgetSuggestQueryDto,
  EnvelopesDto,
  EnvelopesQueryDto,
  IncomeSuggestionsDto,
  IncomeSuggestQueryDto,
  UpsertBudgetDto,
} from './dto/budget.dto'
import { currentParisMonth } from './months'

const CATEGORY_PARAM = {
  name: 'categoryId',
  type: String,
  format: 'uuid',
} as const

@ApiTags('Budgets')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  @ApiOperation({
    summary: 'Targets vs spending for a month',
    description:
      'Planned income vs received (`income`, `income` lines of each planned category, transfers never), the balance of the plan (`plan.toSaveCents`) and, per budgeted expense category: target in effect, spent (expense transactions of the category, refunds deducted, transfers never counted), remaining, share used and status; totals; the spending outside budgeted categories; and how far the month’s data goes (`period`). Without `month`: the current month when it has data, else the month the data stops in.',
  })
  // Explicit: the spec is generated without decorator metadata (tsx), so
  // Swagger cannot infer the query DTO from the parameter type.
  @ApiQuery({ type: BudgetMonthQueryDto })
  @ApiOkResponse({ type: BudgetMonthDto })
  @ApiBadRequestResponse({ description: 'Invalid month.' })
  month(@Query() query: BudgetMonthQueryDto): Promise<BudgetMonthDto> {
    return this.budgetsService.month(query.month)
  }

  @Get('envelopes')
  @ApiOperation({
    summary: 'Envelopes followed during a month',
    description:
      'Budget lines flagged `tracked` for `month` (default: the current month in Europe/Paris): spent (imported and manual expenses of the category), remaining, and the share of the target matching the days elapsed (`paceCents`; the whole target for a past month, nothing ahead of it).',
  })
  @ApiQuery({ type: EnvelopesQueryDto })
  @ApiOkResponse({ type: EnvelopesDto })
  @ApiBadRequestResponse({ description: 'Invalid month.' })
  envelopes(@Query() query: EnvelopesQueryDto): Promise<EnvelopesDto> {
    return this.budgetsService.envelopes(query.month)
  }

  @Get('history')
  @ApiOperation({
    summary: 'Target and spending per month',
    description:
      'For every category budgeted in at least one month of the window, plus monthly totals over the budgeted categories.',
  })
  @ApiQuery({ type: BudgetHistoryQueryDto })
  @ApiOkResponse({ type: BudgetHistoryDto })
  @ApiBadRequestResponse({ description: 'Invalid months or month.' })
  history(@Query() query: BudgetHistoryQueryDto): Promise<BudgetHistoryDto> {
    return this.budgetsService.history(
      query.month ?? currentParisMonth(),
      query.months ?? BUDGET_HISTORY_MONTHS_DEFAULT,
    )
  }

  @Post('suggest')
  @TokenAccess('read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Suggest targets from past spending',
    description:
      'Average monthly spending of each expense category over the full months before `month`, one-offs excluded, rounded to the euro. Nothing is saved.',
  })
  @ApiQuery({ type: BudgetSuggestQueryDto })
  @ApiOkResponse({ type: BudgetSuggestionsDto })
  @ApiBadRequestResponse({ description: 'Invalid months or month.' })
  suggest(
    @Query() query: BudgetSuggestQueryDto,
  ): Promise<BudgetSuggestionsDto> {
    return this.budgetsService.suggest(
      query.month ?? currentParisMonth(),
      query.months ?? BUDGET_SUGGEST_MONTHS_DEFAULT,
    )
  }

  @Get('income-suggestions')
  @ApiOperation({
    summary: 'Prepare the planned income of a month',
    description:
      'The plan in effect (carried over from the month before) for the income categories that have one, else the confirmed recurring credits (salary, benefits) of each income category at their typical amount, rounded to the euro. Nothing is saved.',
  })
  @ApiQuery({ type: IncomeSuggestQueryDto })
  @ApiOkResponse({ type: IncomeSuggestionsDto })
  @ApiBadRequestResponse({ description: 'Invalid month.' })
  incomeSuggestions(
    @Query() query: IncomeSuggestQueryDto,
  ): Promise<IncomeSuggestionsDto> {
    return this.budgetsService.suggestIncome(query.month ?? currentParisMonth())
  }

  @Put(':categoryId')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Set the monthly target of a category',
    description:
      'Applies from `effectiveFrom` (default: the current month) on; earlier months keep their target. An expense category gets a spending target, an income category a planned income (never `tracked`); a transfer category is refused.',
  })
  @ApiParam(CATEGORY_PARAM)
  @ApiBody({ type: UpsertBudgetDto })
  @ApiOkResponse({ type: BudgetDto })
  @ApiBadRequestResponse({
    description:
      'A transfer category, `tracked` on an income category, or invalid body.',
  })
  @ApiNotFoundResponse({ description: 'Unknown category.' })
  upsert(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpsertBudgetDto,
  ): Promise<BudgetDto> {
    return this.budgetsService.upsert(
      categoryId,
      dto.effectiveFrom ?? currentParisMonth(),
      dto,
    )
  }

  @Delete(':categoryId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Stop budgeting a category',
    description:
      'From `from` (default: the current month) on. Targets planned for later months are deleted; earlier months keep their target.',
  })
  @ApiParam(CATEGORY_PARAM)
  @ApiQuery({ type: BudgetRemoveQueryDto })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Invalid month.' })
  @ApiNotFoundResponse({ description: 'The category never had a budget.' })
  async remove(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Query() query: BudgetRemoveQueryDto,
  ): Promise<void> {
    await this.budgetsService.remove(
      categoryId,
      query.from ?? currentParisMonth(),
    )
  }
}
