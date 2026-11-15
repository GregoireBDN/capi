import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { CurrentUser } from '#/auth/decorators/current-user.decorator'
import { FreshAuthGuard } from '#/auth/guards/fresh-auth.guard'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import type { RequestUser } from '#/auth/request-user'
import { THROTTLE_LIMITS, THROTTLE_TTL } from '#/throttle.config'
import {
  ApproveAuthorizationDto,
  AuthorizationDetailsDto,
  AuthorizationRedirectDto,
  AuthorizeRequestDto,
  OAuthAuditEntryDto,
  OAuthGrantDto,
  OAuthTokenInfoDto,
} from './dto/oauth.dto'
import { OAUTH_ERRORS } from './oauth.constants'
import { OAuthError, OAuthService } from './oauth.service'

const REGISTER_THROTTLE = {
  default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.oauthRegister },
}
const TOKEN_THROTTLE = {
  default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.oauthToken },
}

const AUDIT_DEFAULT_LIMIT = 20
const AUDIT_MAX_LIMIT = 200

const OBJECT_SCHEMA = { type: 'object', additionalProperties: true } as const

/**
 * Runs an RFC endpoint and renders an `OAuthError` as the RFC wants it
 * (`{ error, error_description }`), not as the app's error envelope.
 */
async function rfcReply(
  reply: FastifyReply,
  status: number,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    const body = await run()
    await reply.status(status).send(body ?? {})
  } catch (error) {
    if (!(error instanceof OAuthError)) throw error
    await reply
      .status(error.status)
      .send({ error: error.error, error_description: error.description })
  }
}

/**
 * The public side of the authorization server, reached by the connector's
 * servers through the MCP adapter (`apps/mcp --http`): metadata, Dynamic
 * Client Registration, token and revocation endpoints. JSON bodies only; the
 * adapter converts form posts. Mounted only when `REMOTE_MCP_ENABLED=true`.
 */
@ApiTags('OAuth (remote MCP)')
@Controller('oauth')
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Get('metadata')
  @ApiOperation({
    summary: 'Authorization server metadata (RFC 8414)',
    description:
      'Served publicly by the MCP adapter as `/.well-known/oauth-authorization-server`.',
  })
  @ApiOkResponse({ schema: OBJECT_SCHEMA })
  metadata() {
    return this.oauth.metadata()
  }

  @Post('register')
  @HttpCode(201)
  @Throttle(REGISTER_THROTTLE)
  @ApiOperation({
    summary: 'Dynamic Client Registration (RFC 7591), public clients only',
  })
  @ApiBody({ schema: OBJECT_SCHEMA })
  @ApiCreatedResponse({ schema: OBJECT_SCHEMA })
  @ApiBadRequestResponse({ description: 'RFC 7591 error.' })
  @ApiTooManyRequestsResponse()
  async register(
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await rfcReply(reply, 201, () => this.oauth.registerClient(body))
  }

  @Post('token')
  @Throttle(TOKEN_THROTTLE)
  @ApiOperation({
    summary: 'Token endpoint: authorization code (PKCE S256) or refresh token',
  })
  @ApiBody({ schema: OBJECT_SCHEMA })
  @ApiOkResponse({ schema: OBJECT_SCHEMA })
  @ApiBadRequestResponse({ description: 'RFC 6749 §5.2 error.' })
  @ApiTooManyRequestsResponse()
  async token(
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await rfcReply(reply, 200, () => this.oauth.token(body))
  }

  @Post('revoke')
  @Throttle(TOKEN_THROTTLE)
  @ApiOperation({ summary: 'Token revocation (RFC 7009)' })
  @ApiBody({ schema: OBJECT_SCHEMA })
  @ApiOkResponse({ schema: OBJECT_SCHEMA })
  @ApiTooManyRequestsResponse()
  async revoke(
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await rfcReply(reply, 200, () => this.oauth.revokeToken(body))
  }
}

/**
 * The owner's side: the consent page and the connected applications on the
 * profile page. Session only, never a token; approving needs a fresh session
 * (a sign-in in the last 5 minutes), like creating an access token.
 */
@ApiTags('OAuth (remote MCP)')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@ApiForbiddenResponse({ description: 'Called with a token.' })
@UseGuards(JwtGuard)
@TokenAccess('none')
@Controller('oauth')
export class OAuthConsentController {
  constructor(private readonly oauth: OAuthService) {}

  @Get('authorize')
  @ApiOperation({
    summary:
      'Check an authorization request and describe it for the consent page',
  })
  @ApiOkResponse({ type: AuthorizationDetailsDto })
  @ApiBadRequestResponse({
    description: 'Unknown client, redirect URI, PKCE, scope or resource.',
  })
  details(
    @Query() query: AuthorizeRequestDto,
  ): Promise<AuthorizationDetailsDto> {
    return this.oauth.authorizationDetails(query)
  }

  @Post('authorize')
  @HttpCode(200)
  @UseGuards(FreshAuthGuard)
  @ApiOperation({
    summary: 'Approve an authorization request',
    description:
      'Issues a single-use code and returns where to send the browser. Needs a fresh session.',
  })
  @ApiBody({ type: ApproveAuthorizationDto })
  @ApiOkResponse({ type: AuthorizationRedirectDto })
  @ApiBadRequestResponse()
  approve(
    @CurrentUser() user: RequestUser,
    @Body() body: ApproveAuthorizationDto,
  ): Promise<AuthorizationRedirectDto> {
    const { allowWrite, ...params } = body
    return this.oauth.approve(user.sub, params, allowWrite)
  }

  @Post('authorize/deny')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refuse an authorization request' })
  @ApiBody({ type: AuthorizeRequestDto })
  @ApiOkResponse({ type: AuthorizationRedirectDto })
  @ApiBadRequestResponse()
  deny(@Body() body: AuthorizeRequestDto): Promise<AuthorizationRedirectDto> {
    return this.oauth.deny(body)
  }

  @Get('grants')
  @ApiOperation({ summary: 'Connected applications (active grants)' })
  @ApiOkResponse({ type: [OAuthGrantDto] })
  grants(@CurrentUser() user: RequestUser): Promise<OAuthGrantDto[]> {
    return this.oauth.listGrants(user.sub)
  }

  @Delete('grants/:id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Disconnect an application (revokes its access and refresh tokens)',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async revokeGrant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.oauth.revokeGrant(user.sub, id)
  }

  @Get('audit')
  @ApiOperation({
    summary: 'Latest API calls made by connected applications',
    description: 'Method, route pattern and status only. Kept 90 days.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    maximum: AUDIT_MAX_LIMIT,
  })
  @ApiOkResponse({ type: [OAuthAuditEntryDto] })
  audit(
    @CurrentUser() user: RequestUser,
    @Query('limit', new DefaultValuePipe(AUDIT_DEFAULT_LIMIT), ParseIntPipe)
    limit: number,
  ): Promise<OAuthAuditEntryDto[]> {
    return this.oauth.audit(
      user.sub,
      Math.min(Math.max(limit, 1), AUDIT_MAX_LIMIT),
    )
  }
}

/**
 * For the MCP adapter: checks the access token it was given before serving
 * an MCP request. Answers only to an OAuth access token (never a personal
 * access token or a session), so the adapter cannot be used with another
 * credential.
 */
@ApiTags('OAuth (remote MCP)')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('oauth')
export class OAuthTokenInfoController {
  @Get('token-info')
  @ApiOperation({
    summary: 'Scope and expiry of the presented OAuth access token',
  })
  @ApiOkResponse({ type: OAuthTokenInfoDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'Not an OAuth access token.' })
  tokenInfo(@Req() request: FastifyRequest): OAuthTokenInfoDto {
    const token = request.accessToken
    if (token?.kind !== 'oauth' || !token.expiresAt) {
      throw new ForbiddenException(OAUTH_ERRORS.NOT_AN_OAUTH_TOKEN)
    }
    return { scope: token.scope, expiresAt: token.expiresAt.toISOString() }
  }
}
