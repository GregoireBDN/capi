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
  ApiConflictResponse,
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
import {
  UpdateWalletKeyDto,
  WalletKeyDto,
  WalletKeyInputDto,
} from './wallet-keys.dto'
import { WalletKeysService } from './wallet-keys.service'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const
const KEY_PARAM = { name: 'keyId', type: String, format: 'uuid' } as const

/**
 * Public keys of a wallet crypto account. Session only: a public key reveals
 * the whole wallet, so personal access tokens (MCP, scripts) never see them.
 */
@ApiTags('Crypto')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@TokenAccess('none')
@Controller('accounts/:id/wallet-keys')
export class WalletKeysController {
  constructor(private readonly walletKeys: WalletKeysService) {}

  @Get()
  @ApiOperation({
    summary: 'Public keys of a wallet crypto account',
    description: 'Session only (never reachable with an access token).',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: [WalletKeyDto] })
  @ApiBadRequestResponse({ description: 'Not a wallet crypto account.' })
  @ApiNotFoundResponse()
  list(@Param('id', ParseUUIDPipe) id: string): Promise<WalletKeyDto[]> {
    return this.walletKeys.list(id)
  }

  @Post()
  @ApiOperation({
    summary: 'Add a public key to a wallet crypto account',
    description:
      'The key is validated (format and checksum) before it is saved; private keys and recovery phrases are refused.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: WalletKeyInputDto })
  @ApiCreatedResponse({ type: WalletKeyDto })
  @ApiBadRequestResponse({
    description:
      'Invalid key, chains not of the key family, not a wallet account, archived account.',
  })
  @ApiConflictResponse({ description: 'Key already tracked by an account.' })
  @ApiNotFoundResponse()
  add(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WalletKeyInputDto,
  ): Promise<WalletKeyDto> {
    return this.walletKeys.add(id, dto)
  }

  @Patch(':keyId')
  @ApiOperation({
    summary: 'Change the address type of an xpub',
    description:
      'Ledger exports `xpub` for every account type: the owner sets the type to derive, or `detect` to find it on the next sync.',
  })
  @ApiParam(ID_PARAM)
  @ApiParam(KEY_PARAM)
  @ApiBody({ type: UpdateWalletKeyDto })
  @ApiOkResponse({ type: WalletKeyDto })
  @ApiBadRequestResponse({
    description: 'Not an xpub, not a wallet account, archived account.',
  })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
    @Body() dto: UpdateWalletKeyDto,
  ): Promise<WalletKeyDto> {
    return this.walletKeys.update(id, keyId, dto)
  }

  @Delete(':keyId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Remove a public key',
    description: 'A wallet account keeps at least one key.',
  })
  @ApiParam(ID_PARAM)
  @ApiParam(KEY_PARAM)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({
    description: 'Last key, not a wallet account, archived account.',
  })
  @ApiNotFoundResponse()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ): Promise<void> {
    await this.walletKeys.remove(id, keyId)
  }
}
