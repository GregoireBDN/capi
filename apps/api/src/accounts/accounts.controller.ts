import {
  Body,
  Controller,
  Get,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { AccountsService } from './accounts.service'
import {
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
      'Rename, reorder, archive or restore. Accounts are never deleted: archive them instead.',
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
}
