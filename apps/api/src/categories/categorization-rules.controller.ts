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
  CategorizationRulePreviewDto,
  CreateCategorizationRuleDto,
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
      'The rule is appended last (lowest priority). Existing transactions are only affected by `POST /categorization-rules/apply`.',
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

  @Post('reorder')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Set the evaluation order',
    description:
      'Takes every rule id exactly once; the first id gets the highest priority.',
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
    summary: 'Preview the effect of a new rule',
    description:
      'Counts the transactions a rule with this body would categorize once created and applied. Nothing is saved.',
  })
  @ApiBody({ type: CreateCategorizationRuleDto })
  @ApiOkResponse({ type: CategorizationRulePreviewDto })
  @ApiBadRequestResponse({
    description:
      'Invalid regex, min > max, unknown category or account, or invalid body.',
  })
  preview(
    @Body() dto: CreateCategorizationRuleDto,
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
