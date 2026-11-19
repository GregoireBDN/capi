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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { CategorizationRulesService } from './categorization-rules.service'
import {
  ApplyCategorizationRulesResultDto,
  CategorizationRuleDto,
  CategorizationRuleMatchesDto,
  CategorizationRuleMatchesQueryDto,
  CategorizationRulePreviewDto,
  CategorizationRulesInsightsDto,
  CreateCategorizationRuleDto,
  MATCH_WINDOW_MONTHS,
  PreferCategorizationRuleDto,
  PreviewCategorizationRuleDto,
  ReorderCategorizationRulesDto,
  SuggestCategorizationRuleDto,
  SuggestedCategorizationRuleDto,
  UpdateCategorizationRuleDto,
} from './dto/categorization-rule.dto'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const

@ApiTags('Categorization rules')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('categorization-rules')
export class CategorizationRulesController {
  constructor(private readonly rulesService: CategorizationRulesService) {}

  @Get()
  @ApiOperation({ summary: 'List rules in evaluation order' })
  @ApiOkResponse({ type: [CategorizationRuleDto] })
  list(): Promise<CategorizationRuleDto[]> {
    return this.rulesService.list()
  }

  @Post()
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Create a rule',
    description:
      'Its place in the evaluation order is computed (`rank`: higher `priority`, then the most specific rule). Existing transactions are only affected by `POST /categorization-rules/apply`.',
  })
  @ApiBody({ type: CreateCategorizationRuleDto })
  @ApiCreatedResponse({ type: CategorizationRuleDto })
  @ApiBadRequestResponse({
    description:
      'Invalid regex, min > max, unknown category or account, or invalid body.',
  })
  create(
    @Body() dto: CreateCategorizationRuleDto,
  ): Promise<CategorizationRuleDto> {
    return this.rulesService.create(dto)
  }

  @Get('insights')
  @ApiOperation({
    summary: 'Match counts and conflicts of the rules',
    description: `How many transactions of the last ${MATCH_WINDOW_MONTHS} months each rule's conditions match, and the pairs of enabled rules that match the same transactions (not filed by hand) with different outcomes, with the one that wins.`,
  })
  @ApiOkResponse({ type: CategorizationRulesInsightsDto })
  insights(): Promise<CategorizationRulesInsightsDto> {
    return this.rulesService.insights()
  }

  @Post('matches')
  @TokenAccess('read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Transactions some rule conditions would match',
    description: `The transactions of the last ${MATCH_WINDOW_MONTHS} months the conditions match, whatever their category (count and the most recent ones). Nothing is saved.`,
  })
  @ApiBody({ type: CategorizationRuleMatchesQueryDto })
  @ApiOkResponse({ type: CategorizationRuleMatchesDto })
  @ApiBadRequestResponse({ description: 'Invalid pattern or body.' })
  matches(
    @Body() dto: CategorizationRuleMatchesQueryDto,
  ): Promise<CategorizationRuleMatchesDto> {
    return this.rulesService.matches(dto)
  }

  @Post('reorder')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Set the evaluation order by hand',
    description:
      'Takes every rule id once, first = evaluated first, and gives the rules the fewest priorities that produce this order (those left in their computed place stay at 0). Existing transactions change with `POST /categorization-rules/apply`.',
  })
  @ApiBody({ type: ReorderCategorizationRulesDto })
  @ApiOkResponse({ type: [CategorizationRuleDto] })
  @ApiBadRequestResponse({
    description: 'The ids are not exactly the current rules.',
  })
  reorder(
    @Body() dto: ReorderCategorizationRulesDto,
  ): Promise<CategorizationRuleDto[]> {
    return this.rulesService.reorder(dto.ids)
  }

  @Post(':id/prefer')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Make a rule win over another',
    description:
      'Raises the rule’s priority just above `overRuleId` when it comes after it in the evaluation order, so it wins the transactions both match. Existing transactions change with `POST /categorization-rules/apply`.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: PreferCategorizationRuleDto })
  @ApiOkResponse({ type: CategorizationRuleDto })
  @ApiBadRequestResponse({ description: 'Unknown or same `overRuleId`.' })
  @ApiNotFoundResponse()
  prefer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreferCategorizationRuleDto,
  ): Promise<CategorizationRuleDto> {
    return this.rulesService.prefer(id, dto.overRuleId)
  }

  @Post('suggest')
  @TokenAccess('read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Suggest a rule from a categorized transaction',
    description:
      'Proposes a `contains` rule (merchant key, else the stable part of the label). Nothing is saved.',
  })
  @ApiBody({ type: SuggestCategorizationRuleDto })
  @ApiOkResponse({ type: SuggestedCategorizationRuleDto })
  @ApiBadRequestResponse({ description: 'Unknown category or invalid body.' })
  suggest(
    @Body() dto: SuggestCategorizationRuleDto,
  ): Promise<SuggestedCategorizationRuleDto> {
    return this.rulesService.suggest(dto)
  }

  @Post('preview')
  @TokenAccess('read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Preview the effect of a new or edited rule',
    description:
      'What saving this rule (new, or replacing `ruleId`) and re-applying the rules would change: counts, the most recent changed transactions and its conflicts with other rules. Nothing is saved.',
  })
  @ApiBody({ type: PreviewCategorizationRuleDto })
  @ApiOkResponse({ type: CategorizationRulePreviewDto })
  @ApiBadRequestResponse({
    description:
      'Invalid regex, min > max, unknown category or account, or invalid body.',
  })
  @ApiNotFoundResponse({ description: 'Unknown `ruleId`.' })
  preview(
    @Body() dto: PreviewCategorizationRuleDto,
  ): Promise<CategorizationRulePreviewDto> {
    return this.rulesService.preview(dto)
  }

  @Post('apply')
  @TokenAccess('write')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Re-run the rules on existing transactions',
    description:
      'Re-evaluates uncategorized transactions and those categorized by a rule. Manually categorized transactions are never overwritten.',
  })
  @ApiOkResponse({ type: ApplyCategorizationRulesResultDto })
  apply(): Promise<ApplyCategorizationRulesResultDto> {
    return this.rulesService.apply()
  }

  @Patch(':id')
  @TokenAccess('write')
  @ApiOperation({ summary: 'Update a rule' })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: UpdateCategorizationRuleDto })
  @ApiOkResponse({ type: CategorizationRuleDto })
  @ApiBadRequestResponse({
    description:
      'Invalid regex, min > max, unknown category or account, or invalid body.',
  })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategorizationRuleDto,
  ): Promise<CategorizationRuleDto> {
    return this.rulesService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a rule',
    description:
      'Transactions it categorized are re-run through the remaining rules; those left unmatched go back to review.',
  })
  @ApiParam(ID_PARAM)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.rulesService.remove(id)
  }
}
