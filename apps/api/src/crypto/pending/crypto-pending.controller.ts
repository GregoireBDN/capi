import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { AnswerCryptoMovementDto, CryptoPendingDto } from './crypto-pending.dto'
import { CryptoPendingService } from './crypto-pending.service'

@ApiTags('Crypto')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller()
export class CryptoPendingController {
  constructor(private readonly pending: CryptoPendingService) {}

  @Get('accounts/:id/crypto-pending')
  @ApiOperation({
    summary: 'The coins of a crypto account to answer for (« À préciser »)',
    description:
      'Arrivals and departures the cost replay could not explain (#373), with what could be their other side, and the answers given.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: CryptoPendingDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  list(@Param('id', ParseUUIDPipe) id: string): Promise<CryptoPendingDto> {
    return this.pending.list(id)
  }

  @Post('crypto-movements/:id/answer')
  @TokenAccess('none')
  @ApiOperation({
    summary: 'Answer a crypto movement of « À préciser »',
    description:
      'A transfer with another account’s movement, coins bought elsewhere at a cost, received for free, or sold or given. Session only (#373).',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: AnswerCryptoMovementDto })
  @ApiOkResponse({ type: CryptoPendingDto })
  @ApiBadRequestResponse()
  @ApiConflictResponse()
  @ApiNotFoundResponse()
  answer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AnswerCryptoMovementDto,
  ): Promise<CryptoPendingDto> {
    return this.pending.answer(id, body)
  }

  @Delete('crypto-movements/:id/answer')
  @TokenAccess('none')
  @ApiOperation({
    summary: 'Take back the answer of a crypto movement',
    description: 'It is asked again in « À préciser ». Session only.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: CryptoPendingDto })
  @ApiNotFoundResponse()
  clear(@Param('id', ParseUUIDPipe) id: string): Promise<CryptoPendingDto> {
    return this.pending.clear(id)
  }

  @Delete('crypto-movements/:id/link')
  @TokenAccess('none')
  @ApiOperation({
    summary: 'Unlink the two sides of a crypto transfer',
    description:
      'Both are asked again in « À préciser » and never linked again automatically. Session only.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: CryptoPendingDto })
  @ApiNotFoundResponse()
  unlink(@Param('id', ParseUUIDPipe) id: string): Promise<CryptoPendingDto> {
    return this.pending.unlink(id)
  }
}
