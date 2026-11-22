import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
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
import { DividendsService } from './dividends.service'
import { DividendsDto, SaveDividendDto } from './dto/dividends.dto'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const
const DIVIDEND_PARAM = {
  name: 'dividendId',
  type: String,
  format: 'uuid',
} as const

/** A compte-titres' dividends (#414), typed in the app, session only. */
@ApiTags('Positions')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('accounts/:id/dividends')
export class DividendsController {
  constructor(
    @Inject(DividendsService) private readonly dividends: DividendsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "A compte-titres' dividends (#414)",
    description:
      'Information only: they change neither the value nor what was invested. Newest first, with the total and the last twelve months.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: DividendsDto })
  @ApiBadRequestResponse({ description: 'Not a compte-titres.' })
  @ApiNotFoundResponse()
  list(@Param('id', ParseUUIDPipe) id: string): Promise<DividendsDto> {
    return this.dividends.list(id)
  }

  @Post()
  @TokenAccess('none')
  @ApiOperation({ summary: 'Record a dividend', description: 'Session only.' })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: SaveDividendDto })
  @ApiOkResponse({ type: DividendsDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, future day, unknown security, archived account, not a compte-titres.',
  })
  @ApiNotFoundResponse()
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveDividendDto,
  ): Promise<DividendsDto> {
    return this.dividends.create(id, dto)
  }

  @Put(':dividendId')
  @TokenAccess('none')
  @ApiOperation({ summary: 'Change a dividend', description: 'Session only.' })
  @ApiParam(ID_PARAM)
  @ApiParam(DIVIDEND_PARAM)
  @ApiBody({ type: SaveDividendDto })
  @ApiOkResponse({ type: DividendsDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse({ description: 'Unknown account, or no such dividend.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('dividendId', ParseUUIDPipe) dividendId: string,
    @Body() dto: SaveDividendDto,
  ): Promise<DividendsDto> {
    return this.dividends.update(id, dividendId, dto)
  }

  @Delete(':dividendId')
  @TokenAccess('none')
  @ApiOperation({ summary: 'Delete a dividend', description: 'Session only.' })
  @ApiParam(ID_PARAM)
  @ApiParam(DIVIDEND_PARAM)
  @ApiOkResponse({ type: DividendsDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse({ description: 'Unknown account, or no such dividend.' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('dividendId', ParseUUIDPipe) dividendId: string,
  ): Promise<DividendsDto> {
    return this.dividends.remove(id, dividendId)
  }
}
