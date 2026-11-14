import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { AddWalletTokenDto, WalletTokenDto } from './wallet-tokens.dto'
import { WalletTokensService } from './wallet-tokens.service'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const
const TOKEN_PARAM = { name: 'tokenId', type: String, format: 'uuid' } as const

@ApiTags('Crypto')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('accounts/:id/wallet-tokens')
export class WalletTokensController {
  constructor(private readonly tokens: WalletTokensService) {}

  @Get()
  @ApiOperation({
    summary: 'Tokens read on the EVM chains of a wallet account',
    description:
      'Added with "Ajouter un jeton", on top of the native coins and the assets the account already holds.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: [WalletTokenDto] })
  @ApiBadRequestResponse({ description: 'Not a wallet crypto account.' })
  @ApiNotFoundResponse()
  list(@Param('id', ParseUUIDPipe) id: string): Promise<WalletTokenDto[]> {
    return this.tokens.list(id)
  }

  @Post()
  @ApiOperation({
    summary: 'Read a token on the wallet\'s EVM chains ("Ajouter un jeton")',
    description:
      'Its contract and decimals per chain come from the price provider (only the asset id is sent). The next sync reads the chains again at once.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: AddWalletTokenDto })
  @ApiCreatedResponse({ type: WalletTokenDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, native coin, not a token of a supported EVM chain, not a wallet account, archived account.',
  })
  @ApiConflictResponse({ description: 'Token already read.' })
  @ApiNotFoundResponse()
  add(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddWalletTokenDto,
  ): Promise<WalletTokenDto> {
    return this.tokens.add(id, dto)
  }

  @Delete(':tokenId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Stop reading a token' })
  @ApiParam(ID_PARAM)
  @ApiParam(TOKEN_PARAM)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({
    description: 'Not a wallet account, archived account.',
  })
  @ApiNotFoundResponse()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ): Promise<void> {
    await this.tokens.remove(id, tokenId)
  }
}
