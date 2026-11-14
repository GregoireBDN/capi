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
  Res,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server'
import type { FastifyReply } from 'fastify'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { AuthService } from '#/auth/auth.service'
import { CurrentUser } from '#/auth/decorators/current-user.decorator'
import { FreshAuthGuard } from '#/auth/guards/fresh-auth.guard'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import type { RequestUser } from '#/auth/request-user'
import { setSessionCookies } from '#/auth/session-cookies'
import { THROTTLE_LIMITS, THROTTLE_TTL } from '#/throttle.config'
import {
  AuthenticatePasskeyDto,
  PasskeyDto,
  RegisterPasskeyDto,
  RenamePasskeyDto,
  WEBAUTHN_OPTIONS_SCHEMA,
} from './dto/passkey.dto'
import { PasskeysService } from './passkeys.service'

const OPTIONS_THROTTLE = {
  default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.passkeyOptions },
}
const VERIFY_THROTTLE = {
  default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.passkeyVerify },
}

/**
 * Passkeys (WebAuthn). Sign-in (`authentication/*`) is public and issues the
 * same session as a password login. Everything else needs the session: a
 * personal access token can never list, add, rename or revoke a passkey.
 */
@ApiTags('Passkeys')
@TokenAccess('none')
@Controller('auth/passkeys')
export class PasskeysController {
  constructor(
    private readonly passkeys: PasskeysService,
    private readonly auth: AuthService,
  ) {}

  @Post('authentication/options')
  @HttpCode(200)
  @Throttle(OPTIONS_THROTTLE)
  @ApiOperation({
    summary: 'Start a passkey sign-in (discoverable credential)',
  })
  @ApiOkResponse({ schema: WEBAUTHN_OPTIONS_SCHEMA })
  @ApiTooManyRequestsResponse()
  authenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return this.passkeys.authenticationOptions()
  }

  @Post('authentication/verify')
  @HttpCode(200)
  @Throttle(VERIFY_THROTTLE)
  @ApiOperation({
    summary: 'Sign in with a passkey',
    description:
      'Sets the same `token` and `refresh_token` cookies as a password login.',
  })
  @ApiBody({ type: AuthenticatePasskeyDto })
  @ApiOkResponse({ schema: { example: { success: true } } })
  @ApiUnauthorizedResponse({
    description:
      'Unknown, expired or used challenge; unknown or revoked passkey; failed verification.',
  })
  @ApiTooManyRequestsResponse()
  async authenticate(
    @Body() body: AuthenticatePasskeyDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const userId = await this.passkeys.authenticate(body.response)
    setSessionCookies(reply, await this.auth.createSession(userId))
    await reply.send({ success: true })
  }

  @Get()
  @UseGuards(JwtGuard)
  @ApiCookieAuth('token')
  @ApiOperation({ summary: 'List the passkeys of the signed-in user' })
  @ApiOkResponse({ type: [PasskeyDto] })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'Called with an access token.' })
  list(@CurrentUser() user: RequestUser): Promise<PasskeyDto[]> {
    return this.passkeys.list(user.sub)
  }

  @Post('registration/options')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  @Throttle(OPTIONS_THROTTLE)
  @ApiCookieAuth('token')
  @ApiOperation({
    summary: 'Start adding a passkey',
    description:
      'Needs a fresh session: a password or passkey sign-in within the last 5 minutes.',
  })
  @ApiOkResponse({ schema: WEBAUTHN_OPTIONS_SCHEMA })
  @ApiBadRequestResponse({ description: 'Too many passkeys.' })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({
    description:
      'Recent authentication required, or called with an access token.',
  })
  @ApiTooManyRequestsResponse()
  registrationOptions(
    @CurrentUser() user: RequestUser,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    return this.passkeys.registrationOptions(user)
  }

  @Post('registration/verify')
  @UseGuards(JwtGuard)
  @Throttle(VERIFY_THROTTLE)
  @ApiCookieAuth('token')
  @ApiOperation({ summary: 'Save a new passkey (fresh session only)' })
  @ApiBody({ type: RegisterPasskeyDto })
  @ApiOkResponse({ type: PasskeyDto })
  @ApiBadRequestResponse({
    description:
      'Unknown, expired or used challenge; verification failed; already registered or too many.',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({
    description:
      'Recent authentication required, or called with an access token.',
  })
  @ApiTooManyRequestsResponse()
  register(
    @CurrentUser() user: RequestUser,
    @Body() body: RegisterPasskeyDto,
  ): Promise<PasskeyDto> {
    return this.passkeys.register(user, body.response, body.name)
  }

  @Patch(':id')
  @UseGuards(JwtGuard)
  @ApiCookieAuth('token')
  @ApiOperation({ summary: 'Rename a passkey' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: RenamePasskeyDto })
  @ApiOkResponse({ type: PasskeyDto })
  @ApiNotFoundResponse()
  rename(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenamePasskeyDto,
  ): Promise<PasskeyDto> {
    return this.passkeys.rename(user.sub, id, body.name)
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtGuard, FreshAuthGuard)
  @ApiCookieAuth('token')
  @ApiOperation({
    summary: 'Revoke a passkey',
    description:
      'It can no longer sign in. The password always stays available. Needs a fresh session: a password or passkey sign-in within the last 5 minutes.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({
    description:
      'Recent authentication required, or called with an access token.',
  })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.passkeys.remove(user.sub, id)
  }
}
