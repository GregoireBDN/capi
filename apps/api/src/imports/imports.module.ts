import { Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { CategoriesModule } from '#/categories/categories.module'
import { RecurringModule } from '#/recurring/recurring.module'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'

@Module({
  // AuthModule provides JwtGuard; CategoriesModule the categorization rules;
  // RecurringModule the detection run after a commit or an undo.
  imports: [AuthModule, CategoriesModule, RecurringModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
