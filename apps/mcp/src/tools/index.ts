import { accountsOverviewTool } from './accounts.js'
import { budgetHistoryTool, budgetStatusTool } from './budgets.js'
import { listCategoriesTool } from './categories.js'
import { monthEndForecastTool } from './forecast.js'
import { monthReviewTool } from './review.js'
import { savingsTool } from './savings.js'
import { spendingByCategoryTool, spendingHistoryTool } from './spending.js'
import { subscriptionsTool } from './subscriptions.js'
import { searchTransactionsTool } from './transactions.js'

export const tools = [
  accountsOverviewTool,
  searchTransactionsTool,
  listCategoriesTool,
  spendingByCategoryTool,
  spendingHistoryTool,
  budgetStatusTool,
  budgetHistoryTool,
  subscriptionsTool,
  monthEndForecastTool,
  savingsTool,
  monthReviewTool,
]
