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
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { THROTTLE_LIMITS, THROTTLE_TTL } from '#/throttle.config'
import { AuthService } from '#/auth/auth.service'
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  RegistrationStatusDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from '#/auth/dto/auth.dto'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '#/auth/auth.constants'
import type { SessionTokens } from '#/auth/auth.service'
import { env } from '#/config/env'
import { UserDto } from '#/user/user.dto'

const COOKIE_DEFAULTS = {
  httpOnly: true,
  path: '/',
  sameSite: 'lax',
  secure: env.isProduction,
} as const

/** Access token cookie — sent on every API request for the JwtGuard. */
const ACCESS_COOKIE = 'token'
/**
 * Refresh token cookie — scoped to /api/auth so it only travels to the refresh
 * and logout endpoints, never to ordinary API routes.
 */
const REFRESH_COOKIE = 'refresh_token'
const REFRESH_COOKIE_PATH = '/api/auth'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Sets the session pair on a JSON reply via the Fastify cookie API. */
  private setSessionCookies(reply: FastifyReply, { accessToken, refreshToken }: SessionTokens) {
    reply
      .cookie(ACCESS_COOKIE, accessToken, { ...COOKIE_DEFAULTS, maxAge: ACCESS_TOKEN_TTL_SECONDS })
      .cookie(REFRESH_COOKIE, refreshToken, {
        ...COOKIE_DEFAULTS,
        path: REFRESH_COOKIE_PATH,
        maxAge: REFRESH_TOKEN_TTL_SECONDS,
      })
  }

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
  @ApiForbiddenResponse({ description: 'Registration is closed: an account already exists.' })
  async register(@Body() dto: RegisterDto, @Res() reply: FastifyReply) {
    const tokens = await this.authService.register(dto)
    this.setSessionCookies(reply, tokens)
    await reply.status(201).send({ success: true })
  }

  @Post('login')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.login } })
  @HttpCode(200)
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ schema: { example: { success: true } } })
  async login(@Body() dto: LoginDto, @Res() reply: FastifyReply) {
    const tokens = await this.authService.login(dto)
    this.setSessionCookies(reply, tokens)
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
    this.setSessionCookies(reply, tokens)
    await reply.send({ success: true })
  }

  @Post('logout')
  @ApiOkResponse({ schema: { example: { success: true } } })
  async logout(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    await this.authService.revokeSession(req.cookies?.[REFRESH_COOKIE])
    await reply
      .clearCookie(ACCESS_COOKIE, { path: '/' })
      .clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH })
      .send({ success: true })
  }

  @Post('forgot-password')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.forgotPassword } })
  @HttpCode(200)
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ schema: { example: { success: true } } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto)
    return { success: true }
  }

  @Post('reset-password')
  @HttpCode(200)
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ schema: { example: { success: true } } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password)
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
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.resendVerification } })
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
