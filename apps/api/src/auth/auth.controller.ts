import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { THROTTLE_LIMITS, THROTTLE_TTL } from '#/throttle.config'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { AuthService } from '#/auth/auth.service'
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  RegistrationStatusDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from '#/auth/dto/auth.dto'
import { FreshAuthGuard } from '#/auth/guards/fresh-auth.guard'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import {
  ACCESS_COOKIE,
  COOKIE_DEFAULTS,
  LEGACY_REFRESH_COOKIE_PATH,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  setSessionCookies,
} from '#/auth/session-cookies'
import { UserDto } from '#/user/user.dto'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(JwtGuard)
  @ApiCookieAuth('token')
  @ApiOkResponse({ type: UserDto })
  me(@Req() req: FastifyRequest) {
    const { sub } = (req as FastifyRequest & { user: { sub: string } }).user
    return this.authService.getUser(sub)
  }

  /**
   * Single-user instance: lets the web app hide the sign-up form once the
   * owner account exists.
   */
  @Get('registration-status')
  @ApiOkResponse({ type: RegistrationStatusDto })
  async registrationStatus(): Promise<RegistrationStatusDto> {
    return { open: await this.authService.isRegistrationOpen() }
  }

  @Post('register')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.register } })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ schema: { example: { success: true } } })
  @ApiForbiddenResponse({
    description: 'Registration is closed: an account already exists.',
  })
  async register(@Body() dto: RegisterDto, @Res() reply: FastifyReply) {
    const tokens = await this.authService.register(dto)
    setSessionCookies(reply, tokens)
    await reply.status(201).send({ success: true })
  }

  @Post('login')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.login } })
  @HttpCode(200)
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ schema: { example: { success: true } } })
  async login(@Body() dto: LoginDto, @Res() reply: FastifyReply) {
    const tokens = await this.authService.login(dto)
    setSessionCookies(reply, tokens)
    await reply.send({ success: true })
  }

  @Post('refresh')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.refresh } })
  @HttpCode(200)
  @ApiOkResponse({ schema: { example: { success: true } } })
  async refresh(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const token = req.cookies?.[REFRESH_COOKIE]
    if (!token) throw new UnauthorizedException()
    const tokens = await this.authService.rotateRefreshToken(token)
    setSessionCookies(reply, tokens)
    await reply.send({ success: true })
  }

  @Post('logout')
  @ApiOkResponse({ schema: { example: { success: true } } })
  async logout(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    await this.authService.revokeSession(req.cookies?.[REFRESH_COOKIE])
    // Drop pages and API responses the browser may still hold in its HTTP
    // cache. Not "storage": it would also unregister the service worker and
    // wipe its (non-sensitive) shell cache and the theme preference; not
    // "cookies": the session cookies are cleared explicitly below.
    await reply
      .header('Clear-Site-Data', '"cache"')
      .clearCookie(ACCESS_COOKIE, { ...COOKIE_DEFAULTS })
      .clearCookie(REFRESH_COOKIE, {
        ...COOKIE_DEFAULTS,
        path: REFRESH_COOKIE_PATH,
      })
      .clearCookie(REFRESH_COOKIE, {
        ...COOKIE_DEFAULTS,
        path: LEGACY_REFRESH_COOKIE_PATH,
      })
      .send({ success: true })
  }

  @Post('forgot-password')
  @Throttle({
    default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.forgotPassword },
  })
  @HttpCode(200)
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ schema: { example: { success: true } } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto)
    return { success: true }
  }

  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Set a new password from an emailed link',
    description:
      'Ends every session; also revokes the personal access tokens with `revokeAccessTokens`.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ schema: { example: { success: true } } })
  @ApiBadRequestResponse({
    description: 'Invalid, expired or used link; invalid new password.',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password, {
      revokeAccessTokens: dto.revokeAccessTokens,
    })
    return { success: true }
  }

  @Post('change-password')
  @HttpCode(200)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.login } })
  @UseGuards(JwtGuard, FreshAuthGuard)
  @TokenAccess('none')
  @ApiCookieAuth('token')
  @ApiOperation({
    summary: 'Change the password of the signed-in user',
    description:
      'Needs the current password and a fresh session (a password or passkey sign-in within the last 5 minutes). Ends every other session; this one stays signed in. Also revokes the personal access tokens with `revokeAccessTokens`.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ schema: { example: { success: true } } })
  @ApiBadRequestResponse({
    description:
      'Wrong current password, invalid new password, or the same password.',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({
    description:
      'Recent authentication required, or called with an access token.',
  })
  @ApiTooManyRequestsResponse()
  async changePassword(
    @Req() req: FastifyRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    const { sub } = (req as FastifyRequest & { user: { sub: string } }).user
    await this.authService.changePassword(
      sub,
      dto,
      req.cookies?.[REFRESH_COOKIE],
    )
    return { success: true }
  }

  @Post('verify-email')
  @HttpCode(200)
  @ApiBody({ type: VerifyEmailDto })
  @ApiOkResponse({ schema: { example: { success: true } } })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto.token)
    return { success: true }
  }

  @Post('resend-verification')
  @Throttle({
    default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.resendVerification },
  })
  @HttpCode(200)
  @UseGuards(JwtGuard)
  @ApiCookieAuth('token')
  @ApiOkResponse({ schema: { example: { success: true } } })
  async resendVerification(@Req() req: FastifyRequest) {
    const { sub } = (req as FastifyRequest & { user: { sub: string } }).user
    await this.authService.resendVerification(sub)
    return { success: true }
  }
}
