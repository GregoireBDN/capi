import { Controller, Get, UseGuards } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { CategoriesService } from './categories.service'
import { CategoryDto } from './dto/category.dto'

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
    description: 'Every category, ordered by kind then name.',
  })
  list(): Promise<CategoryDto[]> {
    return this.categoriesService.list()
  }
}
