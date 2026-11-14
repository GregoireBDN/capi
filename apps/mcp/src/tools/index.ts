import { accountsOverviewTool } from './accounts.js'
import { setBudgetTargetsTool } from './budget-writes.js'
import { budgetHistoryTool, budgetStatusTool } from './budgets.js'
import { listCategoriesTool } from './categories.js'
import { monthEndForecastTool } from './forecast.js'
import {
  budgetSuggestionsTool,
  monthCloseStatusTool,
  reviewQueueTool,
} from './month-close.js'
import { monthReviewTool } from './review.js'
import { createRuleTool } from './rule-writes.js'
import { savingsTool } from './savings.js'
import { spendingByCategoryTool, spendingHistoryTool } from './spending.js'
import { subscriptionsTool } from './subscriptions.js'
import {
  addTransactionTool,
  categorizeTransactionsTool,
  markOneOffTool,
  setTransactionNoteTool,
} from './transaction-writes.js'
import { searchTransactionsTool } from './transactions.js'

export const readTools = [
  accountsOverviewTool,
  searchTransactionsTool,
  listCategoriesTool,
  spendingByCategoryTool,
  spendingHistoryTool,
  budgetStatusTool,
  budgetHistoryTool,
  budgetSuggestionsTool,
  subscriptionsTool,
  monthEndForecastTool,
  savingsTool,
  monthReviewTool,
  monthCloseStatusTool,
  reviewQueueTool,
]

/**
 * Write tools (#77): preview first, apply only with `confirm: true`, need a
 * `write` token. None deletes anything.
 */
export const writeTools = [
  addTransactionTool,
  categorizeTransactionsTool,
  markOneOffTool,
  setTransactionNoteTool,
  createRuleTool,
  setBudgetTargetsTool,
]

export const tools = [...readTools, ...writeTools]
