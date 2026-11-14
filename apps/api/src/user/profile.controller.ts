import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Patch,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { CurrentUser } from '#/auth/decorators/current-user.decorator'
import { FreshAuthGuard } from '#/auth/guards/fresh-auth.guard'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { UpdateProfileDto, UserDto } from '#/user/user.dto'
import { type PublicUser } from '#/user/user.schema'
import { UserService } from '#/user/user.service'

/**
 * The signed-in owner's own account (read it with `GET /api/auth/me`). There is deliberately no route taking a
 * user id: every action applies to the session's user only.
 */
@ApiTags('Profile')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly userService: UserService) {}

  @Patch()
  @ApiOperation({ summary: 'Update the name or theme of the signed-in user' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({ type: UserDto })
  @ApiBadRequestResponse({ description: 'Invalid body.' })
  update(
    @CurrentUser() { sub }: { sub: string },
    @Body() dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    return this.userService.update(sub, dto)
  }

  @Delete()
  @HttpCode(204)
  @UseGuards(FreshAuthGuard)
  @ApiOperation({
    summary: 'Delete the signed-in user account',
    description:
      'Needs a fresh session: a password or passkey sign-in within the last 5 minutes.',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({
    description:
      'Recent authentication required, or called with an access token.',
  })
  remove(@CurrentUser() { sub }: { sub: string }): Promise<void> {
    return this.userService.remove(sub)
  }
}
