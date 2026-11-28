import { accountsOverviewTool } from './accounts.js'
import { setBudgetTargetsTool } from './budget-writes.js'
import { budgetHistoryTool, budgetStatusTool } from './budgets.js'
import { listCategoriesTool } from './categories.js'
import {
  addInvestmentSnapshotsTool,
  createInvestmentAccountTool,
  setInvestedAmountTool,
  syncCryptoHoldingsTool,
} from './investment-writes.js'
import { listInvestmentAccountsTool } from './investments.js'
import { syncSecurityPositionsTool } from './position-writes.js'
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
import { integrityChecksTool } from './integrity.js'
import { monthReviewTool } from './review.js'
import { owedToMeTool } from './owed.js'
import { linkRepaymentTool, shareExpenseTool } from './owed-writes.js'
import { cancelSubscriptionTool, forgiveDebtTool } from './sensitive-writes.js'
import { createRuleTool } from './rule-writes.js'
import { addToEnvelopeTool, createEnvelopeTool } from './envelope-writes.js'
import { listRulesTool, updateRuleTool } from './rules.js'
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
  // #427: the review's « Cohérence des chiffres ».
  integrityChecksTool,
  reviewQueueTool,
  listImportsTool,
  // #104: investments, before importing statement values.
  listInvestmentAccountsTool,
  createInvestmentAccountTool,
  // #359: money owed, both ways.
  owedToMeTool,
  // #531: the rules, their matches and conflicts, before create_rule.
  listRulesTool,
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
  // #531: pattern, category, enabled (deleting stays in the app).
  updateRuleTool,
  setBudgetTargetsTool,
  // Bank CSV imports (#103): preview, then commit with `confirm: true`.
  previewBankImportTool,
  commitBankImportTool,
  // #104
  addInvestmentSnapshotsTool,
  syncCryptoHoldingsTool,
  syncSecurityPositionsTool,
  setInvestedAmountTool,
  // #342: close past months (reopening stays in the app).
  closeMonthsTool,
  // #357: split a transaction, refund parts included (undo in the app).
  splitTransactionTool,
  // #359: share an expense, link a repayment (letting go stays in the app).
  shareExpenseTool,
  linkRepaymentTool,
  // #597: cancel a subscription, let a debt go; re-approved by the owner on
  // every call (destructiveHint), undone in the app.
  cancelSubscriptionTool,
  forgiveDebtTool,
  // #518: create an envelope, add to one from « libre » (the rest in the app).
  createEnvelopeTool,
  addToEnvelopeTool,
]

export const tools = [...readTools, ...writeTools]
