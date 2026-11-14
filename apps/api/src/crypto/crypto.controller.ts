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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { CryptoPricesService } from './crypto-prices.service'
import { CryptoService } from './crypto.service'
import {
  AccountHoldingsDto,
  ASSET_ID_PATTERN,
  CryptoAssetDto,
  CryptoPriceDto,
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
      "When the last valuation is older than the price cache TTL, prices are refreshed first (if the price API is enabled) and today's balance snapshot is written. A failing price API never fails the request: the last known prices are used and flagged stale.",
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: AccountHoldingsDto })
  @ApiBadRequestResponse({ description: 'Not a crypto account.' })
  @ApiNotFoundResponse()
  list(@Param('id', ParseUUIDPipe) id: string): Promise<AccountHoldingsDto> {
    return this.crypto.holdings(id)
  }

  @Post()
  @ApiOperation({
    summary: 'Add a holding',
    description:
      'One asset at one location (wallet, exchange) per account. The account is valued again.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: SaveHoldingDto })
  @ApiCreatedResponse({ type: HoldingDto })
  @ApiBadRequestResponse({
    description: 'Invalid body, not a crypto account, archived account.',
  })
  @ApiConflictResponse({ description: 'Same asset and location already held.' })
  @ApiNotFoundResponse()
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveHoldingDto,
  ): Promise<HoldingDto> {
    return this.crypto.create(id, dto)
  }

  @Post('valuate')
  @HttpCode(200)
  @ApiOperation({
    summary: "Refresh prices and write today's snapshot",
    description:
      "Asks the price API for every held asset (each at most every 15 s), values the holdings and upserts today's balance snapshot when every holding has a price. Contributions are the sum of the invested amounts when every holding has one, null otherwise.",
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: AccountHoldingsDto })
  @ApiBadRequestResponse({
    description: 'Not a crypto account, archived account.',
  })
  @ApiNotFoundResponse()
  valuate(@Param('id', ParseUUIDPipe) id: string): Promise<AccountHoldingsDto> {
    return this.crypto.refresh(id)
  }

  @Put(':holdingId')
  @ApiOperation({
    summary: 'Replace a holding',
    description: 'Omitted optional fields are cleared.',
  })
  @ApiParam(ID_PARAM)
  @ApiParam(HOLDING_PARAM)
  @ApiBody({ type: SaveHoldingDto })
  @ApiOkResponse({ type: HoldingDto })
  @ApiBadRequestResponse({
    description: 'Invalid body, not a crypto account, archived account.',
  })
  @ApiConflictResponse({ description: 'Same asset and location already held.' })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('holdingId', ParseUUIDPipe) holdingId: string,
    @Body() dto: SaveHoldingDto,
  ): Promise<HoldingDto> {
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

  @Get('summary')
  @ApiOperation({
    summary: 'Holdings, prices, values and gains of every crypto account',
    description:
      'Non-archived crypto accounts, valued with one batched price request (refreshed when the last valuation is older than the TTL).',
  })
  @ApiOkResponse({ type: CryptoSummaryDto })
  summary(): Promise<CryptoSummaryDto> {
    return this.crypto.summary()
  }

  @Post('valuate')
  @HttpCode(200)
  @ApiOperation({
    summary: "Refresh prices of every crypto account and write today's snapshots",
    description:
      "One batched price API request for every held asset (each at most every 15 s), then each non-archived crypto account whose holdings all have a price gets today's balance snapshot. A failing price API never fails the request: the last known prices are used and flagged stale.",
  })
  @ApiOkResponse({ type: CryptoSummaryDto })
  valuate(): Promise<CryptoSummaryDto> {
    return this.crypto.refreshAll()
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
