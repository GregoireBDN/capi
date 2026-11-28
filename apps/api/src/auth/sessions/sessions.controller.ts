import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { CurrentUser } from '#/auth/decorators/current-user.decorator'
import { FreshAuthGuard } from '#/auth/guards/fresh-auth.guard'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import type { RequestUser } from '#/auth/request-user'
import { readRefreshCookie } from '#/auth/session-cookies'
import { SessionDto } from './session.dto'
import { SessionsService } from './sessions.service'
import { WithoutOwnerScope } from '#/database/request-scope/owner-scope.interceptor'

/** The owner's sessions (#217): session only, never reachable with a token. */
@ApiTags('Auth')
@WithoutOwnerScope()
@Controller('auth/sessions')
@UseGuards(JwtGuard)
@TokenAccess('none')
@ApiCookieAuth('token')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List the active sessions of the signed-in user',
    description:
      'One row per signed-in browser or device (refresh-token family), the current one first.',
  })
  @ApiOkResponse({ type: [SessionDto] })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'Called with an access token.' })
  list(
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<SessionDto[]> {
    return this.sessions.list(user.sub, readRefreshCookie(req))
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(FreshAuthGuard)
  @ApiOperation({
    summary: 'End a session',
    description:
      'Revokes its refresh tokens: that device is signed out at its next refresh (within 15 minutes). Needs a fresh session: a password or passkey sign-in within the last 5 minutes.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({
    description:
      'Recent authentication required, or called with an access token.',
  })
  async revoke(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.sessions.revoke(user.sub, id)
  }
}
