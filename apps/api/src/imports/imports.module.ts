import { Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { CategoriesModule } from '#/categories/categories.module'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'

@Module({
  // AuthModule provides JwtGuard; CategoriesModule the categorization rules.
  imports: [AuthModule, CategoriesModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
