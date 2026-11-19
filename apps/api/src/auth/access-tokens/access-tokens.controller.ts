import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessTokensService } from '#/auth/access-tokens/access-tokens.service'
import {
  AccessTokenAuditEntryDto,
  AccessTokenDto,
  CreateAccessTokenDto,
  CreatedAccessTokenDto,
  UpdateAccessTokenDto,
} from '#/auth/access-tokens/dto/access-token.dto'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { CurrentUser } from '#/auth/decorators/current-user.decorator'
import { FreshAuthGuard } from '#/auth/guards/fresh-auth.guard'
import { JwtGuard } from '#/auth/guards/jwt.guard'

const AUDIT_DEFAULT_LIMIT = 50
const AUDIT_MAX_LIMIT = 200

/** Managing tokens needs the session: a token can never list, mint or revoke tokens. */
@ApiTags('Access tokens')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@ApiForbiddenResponse({ description: 'Called with an access token.' })
@UseGuards(JwtGuard)
@TokenAccess('none')
@Controller('access-tokens')
export class AccessTokensController {
  constructor(private readonly accessTokens: AccessTokensService) {}

  @Get()
  @ApiOperation({
    summary: 'List personal access tokens (revoked ones excluded)',
  })
  @ApiOkResponse({ type: [AccessTokenDto] })
  list(@CurrentUser() user: { sub: string }): Promise<AccessTokenDto[]> {
    return this.accessTokens.list(user.sub)
  }

  @Post()
  @UseGuards(FreshAuthGuard)
  @ApiOperation({
    summary: 'Create a personal access token',
    description:
      'The token is returned once in `token` and only its hash is stored. Needs a fresh session: a password or passkey sign-in within the last 5 minutes.',
  })
  @ApiBody({ type: CreateAccessTokenDto })
  @ApiCreatedResponse({ type: CreatedAccessTokenDto })
  @ApiBadRequestResponse({
    description: 'Invalid input or too many active tokens.',
  })
  @ApiForbiddenResponse({
    description:
      'Recent authentication required, or called with an access token.',
  })
  create(
    @CurrentUser() user: { sub: string },
    @Body() body: CreateAccessTokenDto,
  ): Promise<CreatedAccessTokenDto> {
    return this.accessTokens.create(user.sub, body)
  }

  @Get('audit')
  @ApiOperation({
    summary: 'Latest API calls made with access tokens',
    description: 'Method, route pattern and status only. Kept 90 days.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    maximum: AUDIT_MAX_LIMIT,
  })
  @ApiQuery({
    name: 'tokenId',
    required: false,
    type: String,
    format: 'uuid',
    description: 'Only the calls of this token.',
  })
  @ApiOkResponse({ type: [AccessTokenAuditEntryDto] })
  audit(
    @CurrentUser() user: { sub: string },
    @Query('limit', new DefaultValuePipe(AUDIT_DEFAULT_LIMIT), ParseIntPipe)
    limit: number,
    @Query('tokenId', new ParseUUIDPipe({ optional: true }))
    tokenId?: string,
  ): Promise<AccessTokenAuditEntryDto[]> {
    return this.accessTokens.audit(
      user.sub,
      Math.min(Math.max(limit, 1), AUDIT_MAX_LIMIT),
      tokenId,
    )
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a personal access token' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateAccessTokenDto })
  @ApiOkResponse({ type: AccessTokenDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  rename(
    @CurrentUser() user: { sub: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAccessTokenDto,
  ): Promise<AccessTokenDto> {
    return this.accessTokens.rename(user.sub, id, body)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a personal access token' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async revoke(
    @CurrentUser() user: { sub: string },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.accessTokens.revoke(user.sub, id)
  }
}
