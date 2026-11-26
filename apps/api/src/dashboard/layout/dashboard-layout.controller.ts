import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import {
  DashboardLayoutDto,
  UpdateDashboardLayoutDto,
} from './dashboard-layout.dto'
import { DashboardLayoutService } from './dashboard-layout.service'

/**
 * The dashboard's layout (#495). Tokens read it; saving and resetting are
 * session only (no `@TokenAccess('write')`).
 */
@ApiTags('Dashboard')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('dashboard/layout')
export class DashboardLayoutController {
  constructor(private readonly layout: DashboardLayoutService) {}

  @Get()
  @ApiOperation({
    summary: 'The dashboard’s elements',
    description:
      'The elements in their order, hidden ones included, with their size, accounts, envelopes and settings. While nothing was saved, today’s default layout (`custom: false`).',
  })
  @ApiOkResponse({ type: DashboardLayoutDto })
  get(): Promise<DashboardLayoutDto> {
    return this.layout.get()
  }

  @Put()
  @ApiOperation({
    summary: 'Save the dashboard’s elements',
    description:
      'Replaces the whole layout in one transaction. Each element at most once; accounts only on the elements that show accounts, envelopes only on `envelopes`, each element only its own settings.',
  })
  @ApiBody({ type: UpdateDashboardLayoutDto })
  @ApiOkResponse({ type: DashboardLayoutDto })
  @ApiBadRequestResponse({
    description:
      'An element twice, accounts or envelopes or a setting it does not take, an unknown account or envelope.',
  })
  replace(@Body() body: UpdateDashboardLayoutDto): Promise<DashboardLayoutDto> {
    return this.layout.replace(body.widgets)
  }

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Back to the default dashboard',
    description: 'Deletes the saved layout: the dashboard is today’s again.',
  })
  @ApiOkResponse({ type: DashboardLayoutDto })
  reset(): Promise<DashboardLayoutDto> {
    return this.layout.reset()
  }
}
