import { accountsOverviewTool } from './accounts.js'
import { setBudgetTargetsTool } from './budget-writes.js'
import { budgetHistoryTool, budgetStatusTool } from './budgets.js'
import { listCategoriesTool } from './categories.js'
import {
  addInvestmentSnapshotsTool,
  createInvestmentAccountTool,
  syncCryptoHoldingsTool,
} from './investment-writes.js'
import { listInvestmentAccountsTool } from './investments.js'
import { monthEndForecastTool } from './forecast.js'
import {
  commitBankImportTool,
  listImportsTool,
  previewBankImportTool,
} from './import-writes.js'
import {
  budgetSuggestionsTool,
  monthCloseStatusTool,
  reviewQueueTool,
} from './month-close.js'
import { closeMonthsTool } from './month-close-writes.js'
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
import { splitTransactionTool } from './split-writes.js'
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
  listImportsTool,
  // #104: investments, before importing statement values.
  listInvestmentAccountsTool,
  createInvestmentAccountTool,
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
  // Bank CSV imports (#103): preview, then commit with `confirm: true`.
  previewBankImportTool,
  commitBankImportTool,
  // #104
  addInvestmentSnapshotsTool,
  syncCryptoHoldingsTool,
  // #342: close past months (reopening stays in the app).
  closeMonthsTool,
  // #357: split a transaction, refund parts included (undo in the app).
  splitTransactionTool,
]

export const tools = [...readTools, ...writeTools]
