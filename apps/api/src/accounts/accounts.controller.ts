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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { FreshAuthGuard } from '#/auth/guards/fresh-auth.guard'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { AccountsService } from './accounts.service'
import {
  AccountDeletionPreviewDto,
  AccountDto,
  ChangeCryptoSourceDto,
  CreateAccountDto,
  ListAccountsQueryDto,
  UpdateAccountDto,
} from './dto/account.dto'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const

@ApiTags('Accounts')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @ApiOperation({
    summary: 'List accounts with their current balance',
    description:
      'Ordered by position. Archived accounts are left out unless `includeArchived=true`.',
  })
  @ApiQuery({ type: ListAccountsQueryDto })
  @ApiOkResponse({ type: [AccountDto] })
  list(@Query() query: ListAccountsQueryDto): Promise<AccountDto[]> {
    return this.accountsService.list({
      includeArchived: query.includeArchived ?? false,
    })
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an account with its current balance',
    description: 'Archived accounts included.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: AccountDto })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AccountDto> {
    return this.accountsService.findOne(id)
  }

  @Post()
  @ApiOperation({
    summary: 'Create an account',
    description: 'The account is appended last in the display order.',
  })
  @ApiBody({ type: CreateAccountDto })
  @ApiCreatedResponse({ type: AccountDto })
  @ApiBadRequestResponse({ description: 'Invalid body.' })
  create(@Body() dto: CreateAccountDto): Promise<AccountDto> {
    return this.accountsService.create(dto)
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an account',
    description:
      'Rename, reorder, archive or restore. Archiving keeps the history; `DELETE` removes the account and its data.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: UpdateAccountDto })
  @ApiOkResponse({ type: AccountDto })
  @ApiBadRequestResponse({ description: 'Invalid body.' })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountDto> {
    return this.accountsService.update(id, dto)
  }

  @Put(':id/crypto-source')
  @TokenAccess('none')
  @ApiOperation({
    summary: 'Turn a manual crypto account into an exchange or a wallet',
    description:
      'Only a non-archived `manual` crypto account holding nothing changes source (409 otherwise). A wallet gets its public keys (validated, unique across accounts: 409 when one is already tracked). 0 € values recorded while the account held nothing are dropped when it never had another value. Session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: ChangeCryptoSourceDto })
  @ApiOkResponse({ type: AccountDto })
  @ApiBadRequestResponse({ description: 'Invalid body or key.' })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description:
      'Not a manual account, holdings typed by hand, or a key already tracked.',
  })
  changeCryptoSource(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeCryptoSourceDto,
  ): Promise<AccountDto> {
    return this.accountsService.changeCryptoSource(id, dto)
  }

  @Get(':id/deletion-preview')
  @TokenAccess('none')
  @ApiOperation({
    summary: 'Count what deleting an account would remove',
    description:
      'For the confirmation of `DELETE /api/accounts/:id`: transactions, imports, snapshots, crypto data, recurring items, account-scoped rules and savings goal links, plus the closed months holding data of the account (their frozen report keeps its figures). Session only.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: AccountDeletionPreviewDto })
  @ApiNotFoundResponse()
  deletionPreview(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountDeletionPreviewDto> {
    return this.accountsService.deletionPreview(id)
  }

  @Delete(':id')
  @HttpCode(204)
  @TokenAccess('none')
  @UseGuards(FreshAuthGuard)
  @ApiOperation({
    summary: 'Delete an account and everything that belongs to it',
    description:
      'In one database transaction: its transactions and splits, imports, recurring items, snapshots, crypto data, account-scoped rules and savings goal links, then the account. Budgets and categories are untouched; closed months keep their frozen report. Cannot be undone. Session only, with a fresh session (a password or passkey sign-in within the last 5 minutes).',
  })
  @ApiParam(ID_PARAM)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({
    description:
      'Recent authentication required, or called with an access token.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.accountsService.remove(id)
  }
}
