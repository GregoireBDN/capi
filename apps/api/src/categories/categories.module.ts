import { Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { CategoriesController } from './categories.controller'
import { CategoriesService } from './categories.service'
import { CategorizationRulesController } from './categorization-rules.controller'
import { CategorizationRulesService } from './categorization-rules.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule],
  controllers: [CategoriesController, CategorizationRulesController],
  providers: [CategoriesService, CategorizationRulesService],
  // The import pipeline categorizes new transactions with the rule set.
  exports: [CategoriesService, CategorizationRulesService],
})
export class CategoriesModule {}
