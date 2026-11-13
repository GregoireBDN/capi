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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { CategoriesService } from './categories.service'
import {
  CategoryDto,
  CategoryUsageDto,
  CreateCategoryDto,
  DeleteCategoryQueryDto,
  UpdateCategoryDto,
} from './dto/category.dto'

const ID_PARAM = { name: 'id', type: String, format: 'uuid' } as const

/**
 * Category management is session only: personal access tokens can read the
 * list, never create, change or delete categories (no `@TokenAccess('write')`).
 */
@ApiTags('Categories')
@ApiCookieAuth('token')
@ApiUnauthorizedResponse()
@UseGuards(JwtGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOkResponse({
    type: [CategoryDto],
    description:
      'Every category, archived ones included (`archivedAt`), ordered by kind then name.',
  })
  list(): Promise<CategoryDto[]> {
    return this.categoriesService.list()
  }

  @Post()
  @ApiOperation({
    summary: 'Create a category',
    description: 'Its slug is generated from the name and never changes.',
  })
  @ApiBody({ type: CreateCategoryDto })
  @ApiCreatedResponse({ type: CategoryDto })
  @ApiBadRequestResponse({ description: 'Invalid body.' })
  @ApiConflictResponse({ description: 'A category has this name already.' })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryDto> {
    return this.categoriesService.create(dto)
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename, recolour, change the kind of, archive or restore',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: UpdateCategoryDto })
  @ApiOkResponse({ type: CategoryDto })
  @ApiBadRequestResponse({ description: 'Invalid body.' })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description:
      'A category has this name already, or the kind of a category used by transactions or budgets was changed.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categoriesService.update(id, dto)
  }

  @Get(':id/usage')
  @ApiOperation({
    summary: 'What uses a category',
    description: 'Counts of what a delete would move to another category.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: CategoryUsageDto })
  @ApiNotFoundResponse()
  usage(@Param('id', ParseUUIDPipe) id: string): Promise<CategoryUsageDto> {
    return this.categoriesService.usage(id)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a category',
    description:
      'A category in use needs `reassignTo`: its transactions, rules and recurring items move to that category, and its budget is added to the target’s, in one transaction.',
  })
  @ApiParam(ID_PARAM)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({
    description:
      'Unknown target, target of another kind, or the category itself.',
  })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: 'The category is in use and no `reassignTo` was given.',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeleteCategoryQueryDto,
  ): Promise<void> {
    await this.categoriesService.remove(id, query.reassignTo)
  }
}
