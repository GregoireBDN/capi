import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
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
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import '#/auth/request-user'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { CryptoPricesService } from './crypto-prices.service'
import { CryptoService, type LiveRefreshMode } from './crypto.service'
import {
  AccountHoldingsDto,
  ASSET_ID_PATTERN,
  CryptoAssetDto,
  CryptoPortfolioDto,
  CryptoPriceDto,
  CryptoSettingsDto,
  CryptoSummaryDto,
  HoldingDto,
  ManualPriceDto,
  SaveHoldingDto,
} from './dto/crypto.dto'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const
const HOLDING_PARAM = {
  name: 'holdingId',
  type: String,
  format: 'uuid',
} as const
const SEARCH_MAX = 50
const MODE_QUERY = {
  name: 'mode',
  enum: ['auto', 'force'],
  required: false,
  description:
    '`force` (default, « Actualiser »): everything now. `auto` (#381): what is due only, the live step a page fires after showing the stored values.',
} as const

function refreshMode(mode: unknown): LiveRefreshMode {
  if (mode === undefined || mode === 'force') return 'force'
  if (mode === 'auto') return 'auto'
  throw new BadRequestException('mode must be auto or force')
}
const TOKEN_FORBIDDEN =
  'Personal access token (#104) on an exchange or wallet account, or on an imported or synced line: tokens only change hand-entered lines of manual crypto accounts.'

@ApiTags('Crypto')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('accounts/:id/holdings')
export class AccountHoldingsController {
  constructor(private readonly crypto: CryptoService) {}

  @Get()
  @ApiOperation({
    summary: 'Holdings of a crypto account, valued at the last known prices',
    description:
      'From the database only (#381): no price request, no chain read. Prices older than the cache TTL are flagged stale; `refreshDue` says whether `POST .../valuate?mode=auto` would refresh something.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: AccountHoldingsDto })
  @ApiBadRequestResponse({ description: 'Not a crypto account.' })
  @ApiNotFoundResponse()
  list(@Param('id', ParseUUIDPipe) id: string): Promise<AccountHoldingsDto> {
    return this.crypto.holdings(id)
  }

  @Post()
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Add a holding',
    description:
      'One asset at one location (wallet, exchange) per account. The account is valued again.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: SaveHoldingDto })
  @ApiCreatedResponse({ type: HoldingDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, not a crypto account, archived account, wallet account (its holdings come from the chain).',
  })
  @ApiConflictResponse({ description: 'Same asset and location already held.' })
  @ApiForbiddenResponse({ description: TOKEN_FORBIDDEN })
  @ApiNotFoundResponse()
  async create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveHoldingDto,
    @Req() req: FastifyRequest,
  ): Promise<HoldingDto> {
    if (req.accessToken) await this.crypto.assertTokenMayWrite(id)
    return this.crypto.create(id, dto)
  }

  @Post('valuate')
  @HttpCode(200)
  @ApiOperation({
    summary: "Refresh prices, then today's live value",
    description:
      "`force`: asks the price API for every held asset (each at most every 15 s). `auto` (#381): reads the wallet when its sync is due and asks the prices older than the TTL only. Then values the holdings (today's live value, never stored, #366). A failing price API or chain never fails the request.",
  })
  @ApiParam(ID_PARAM)
  @ApiQuery(MODE_QUERY)
  @ApiOkResponse({ type: AccountHoldingsDto })
  @ApiBadRequestResponse({
    description: 'Not a crypto account, archived account.',
  })
  @ApiNotFoundResponse()
  valuate(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('mode') mode?: unknown,
  ): Promise<AccountHoldingsDto> {
    return this.crypto.refresh(id, new Date(), refreshMode(mode))
  }

  @Post('sync')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sync a wallet account from its public keys ("Synchroniser")',
    description:
      "Reads the balances of the wallet's public keys on their chains (Bitcoin through Esplora, EVM chains through JSON-RPC: only public addresses and token contracts are sent), replaces the account's synced holdings (manual lines are kept), then values the account. Asks the chains at most every 30 s per wallet. A failing chain endpoint never fails the request: that chain keeps its last synced holdings, the others are updated, `sync.failedAt` is set and `sync.failedChains` names it. A rate-limited endpoint (HTTP 429) is not asked again before `sync.retryAt`. Session only.",
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: AccountHoldingsDto })
  @ApiBadRequestResponse({
    description:
      'Not a wallet crypto account, archived account, wallet sync disabled on this server.',
  })
  @ApiNotFoundResponse()
  @TokenAccess('none')
  sync(@Param('id', ParseUUIDPipe) id: string): Promise<AccountHoldingsDto> {
    return this.crypto.sync(id)
  }

  @Put(':holdingId')
  @TokenAccess('write')
  @ApiOperation({
    summary: 'Replace a holding',
    description: 'Omitted optional fields are cleared.',
  })
  @ApiParam(ID_PARAM)
  @ApiParam(HOLDING_PARAM)
  @ApiBody({ type: SaveHoldingDto })
  @ApiOkResponse({ type: HoldingDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, not a crypto account, archived account, wallet account (its holdings come from the chain).',
  })
  @ApiConflictResponse({ description: 'Same asset and location already held.' })
  @ApiForbiddenResponse({ description: TOKEN_FORBIDDEN })
  @ApiNotFoundResponse()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('holdingId', ParseUUIDPipe) holdingId: string,
    @Body() dto: SaveHoldingDto,
    @Req() req: FastifyRequest,
  ): Promise<HoldingDto> {
    if (req.accessToken) {
      await this.crypto.assertTokenMayWrite(id, holdingId)
    }
    return this.crypto.update(id, holdingId, dto)
  }

  @Delete(':holdingId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a holding' })
  @ApiParam(ID_PARAM)
  @ApiParam(HOLDING_PARAM)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({
    description: 'Not a crypto account, archived account.',
  })
  @ApiNotFoundResponse()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('holdingId', ParseUUIDPipe) holdingId: string,
  ): Promise<void> {
    await this.crypto.remove(id, holdingId)
  }
}

@ApiTags('Crypto')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('crypto')
export class CryptoController {
  constructor(
    private readonly crypto: CryptoService,
    private readonly prices: CryptoPricesService,
  ) {}

  @Get('settings')
  @ApiOperation({
    summary: 'What this server reads by itself',
    description:
      'Whether prices come from the price API and whether wallet accounts are synced on chain. Nothing is valued or fetched.',
  })
  @ApiOkResponse({ type: CryptoSettingsDto })
  settings(): CryptoSettingsDto {
    return this.crypto.settings()
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Holdings, prices, values and gains of every crypto account',
    description:
      'Non-archived crypto accounts, valued at the stored prices (database only, #381).',
  })
  @ApiOkResponse({ type: CryptoSummaryDto })
  summary(): Promise<CryptoSummaryDto> {
    return this.crypto.summary()
  }

  @Post('valuate')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Refresh prices of every crypto account and write today's snapshots",
    description:
      "One batched price API request for every held asset (each at most every 15 s), then each non-archived crypto account whose holdings all have a price gets today's balance snapshot. A failing price API never fails the request: the last known prices are used and flagged stale.",
  })
  @ApiOkResponse({ type: CryptoSummaryDto })
  valuate(): Promise<CryptoSummaryDto> {
    return this.crypto.refreshAll()
  }

  @Get('portfolio')
  @ApiOperation({
    summary: 'The crypto portfolio: holdings summed per asset across accounts',
    description:
      'From the database only (#381): no price request, no chain read. Every open crypto account valued at the last known prices (flagged stale after the cache TTL), its holdings summed per price id with exact quantities, value, change over 24 hours, invested and gain where known (fiat lines left out), then the accounts with when their holdings were last fed. `refreshDue` says whether `POST /crypto/portfolio/refresh?mode=auto` would refresh something.',
  })
  @ApiOkResponse({ type: CryptoPortfolioDto })
  portfolio(): Promise<CryptoPortfolioDto> {
    return this.crypto.portfolio()
  }

  @Post('portfolio/refresh')
  @HttpCode(200)
  @TokenAccess('none')
  @ApiOperation({
    summary: 'Refresh the whole crypto section ("Actualiser")',
    description:
      "`force` (default): reads every open wallet account on chain when this server syncs wallets (each at most every 30 s; a failing chain keeps its last lines and is reported in the account's `sync`), then asks fresh prices for every held asset in one request. `auto` (#381, fired by the page after it shows the stored portfolio): only the wallets due a sync (waiting 5 s at most, the rest going on in the background with `sync.syncing`) and the prices older than the TTL. Then today's live values, never stored. Never fails because of a chain or the price API. Session only; the price API only receives asset ids.",
  })
  @ApiQuery(MODE_QUERY)
  @ApiOkResponse({ type: CryptoPortfolioDto })
  refreshPortfolio(@Query('mode') mode?: unknown): Promise<CryptoPortfolioDto> {
    return this.crypto.refreshPortfolio(new Date(), refreshMode(mode))
  }

  @Get('assets')
  @ApiOperation({
    summary: 'Search assets to hold',
    description:
      'Proxied to the price API search (only the search text is sent), or a built-in list of common assets when it is disabled or unreachable.',
  })
  @ApiQuery({
    name: 'q',
    type: String,
    required: true,
    description: 'Name, ticker or id (1 to 50 characters).',
    example: 'bitcoin',
  })
  @ApiOkResponse({ type: [CryptoAssetDto] })
  @ApiBadRequestResponse()
  search(@Query('q') q: unknown): Promise<CryptoAssetDto[]> {
    const query = typeof q === 'string' ? q.trim() : ''
    if (query.length === 0 || query.length > SEARCH_MAX) {
      throw new BadRequestException(`q must be 1 to ${SEARCH_MAX} characters`)
    }
    return this.prices.search(query)
  }

  @Put('prices/:assetId')
  @ApiOperation({
    summary: 'Set the EUR price of an asset by hand',
    description:
      'Used when the price API is disabled or does not know the asset; a later price API refresh replaces it. The accounts holding the asset are valued again.',
  })
  @ApiParam({ name: 'assetId', type: String, example: 'bitcoin' })
  @ApiBody({ type: ManualPriceDto })
  @ApiOkResponse({ type: CryptoPriceDto })
  @ApiBadRequestResponse()
  setPrice(
    @Param('assetId') assetId: string,
    @Body() dto: ManualPriceDto,
  ): Promise<CryptoPriceDto> {
    if (!ASSET_ID_PATTERN.test(assetId)) {
      throw new BadRequestException('assetId must be a provider asset id')
    }
    return this.crypto.setManualPrice(assetId, dto.priceEur)
  }
}
