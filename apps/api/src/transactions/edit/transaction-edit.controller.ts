import {
  Body,
  Controller,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { TransactionDto } from '../dto/transaction.dto'
import { SaveTransactionEditDto } from './transaction-edit.dto'
import { TransactionEditService } from './transaction-edit.service'

@ApiTags('Transactions')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('transactions')
export class TransactionEditController {
  constructor(private readonly edits: TransactionEditService) {}

  // Session only (no `@TokenAccess`): it can unlink, unsplit and restore,
  // which the tokens never do; the MCP keeps its own routes.
  @Post(':id/edit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Save every change of the transaction editor at once',
    description:
      'Fields, kind, flags, note, a transfer’s other account, split, shares, prepaid term, repayments and the bank values of an old correction, each with the rules of its own route, applied in one database transaction: a refusal anywhere leaves the transaction as it was.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: SaveTransactionEditDto })
  @ApiOkResponse({ type: TransactionDto })
  @ApiBadRequestResponse({
    description:
      'Nothing to update, or a change one of the routes would refuse; nothing is saved.',
  })
  @ApiConflictResponse({
    description:
      'A share repaid or let go removed, or a prepaid declaration on a payment that already pays one; nothing is saved.',
  })
  @ApiNotFoundResponse()
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveTransactionEditDto,
  ): Promise<TransactionDto> {
    return this.edits.save(id, dto)
  }
}
