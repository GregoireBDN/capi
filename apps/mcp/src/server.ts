import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { z } from 'zod'
import { ApiError } from './api/client.js'
import {
  investmentsImportPrompt,
  investmentsImportPromptArgs,
} from './investments-prompt.js'
import { monthReviewPrompt, monthReviewPromptArgs } from './prompts.js'
import { tools } from './tools/index.js'
import {
  type ToolContext,
  type ToolDefinition,
  ToolInputError,
} from './tools/tool.js'

export const SERVER_NAME = 'finances'
export const SERVER_VERSION = '0.0.1'

const INSTRUCTIONS = `Access to the owner's personal finances (single user, EUR, Europe/Paris).
Amounts are euros; negative = money out. Internal transfers between the owner's accounts are never income or expenses.
Statements are imported by hand, so the current month is often partial: tools say how far the data goes and compare partial months like for like.
Start with accounts_overview or list_categories to learn the names that filters accept.
Write tools (add_transaction, categorize_transactions, mark_one_off, set_transaction_note, create_rule, set_budget_targets, add_investment_snapshots, sync_crypto_holdings, set_invested_amount, close_months, split_transaction, share_expense, link_repayment) never change anything without confirm: true. Call them without confirm first, show the owner the preview, and only call again with confirm: true after the owner explicitly agrees. They need a write token; nothing can be deleted or reopened through them.
Bank statements (CIC CSV) are imported in two steps: preview_bank_import uploads the file and writes nothing; commit_bank_import with confirm: true writes the new rows, only after the owner agreed to the preview. list_imports tells what was imported up to when.`

/**
 * Runs a tool and turns failures into an error result the model can read. Only
 * the tool name and the HTTP status go to stderr: never arguments or outputs,
 * which carry amounts, labels and searches.
 */
export async function runTool<Shape extends z.ZodRawShape>(
  tool: ToolDefinition<Shape>,
  context: ToolContext,
  args: z.infer<z.ZodObject<Shape>>,
): Promise<CallToolResult> {
  try {
    const text = await tool.run(context, args)
    return { content: [{ type: 'text', text }] }
  } catch (error) {
    let message: string
    if (error instanceof ToolInputError) {
      message = error.message
    } else if (error instanceof ApiError) {
      message = error.message
      console.error(
        `[finances-mcp] ${tool.name}: API error ${error.status || 'unreachable'}`,
      )
    } else {
      message = 'Erreur inattendue du serveur MCP Finances.'
      console.error(
        `[finances-mcp] ${tool.name}: unexpected ${error instanceof Error ? error.name : 'error'}`,
      )
    }
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}

const REMOTE_INSTRUCTIONS = `
This is the remote connection: the server does not run on the owner's machine, so preview_bank_import takes the CSV text (content), never a filePath. Write tools need the connection to have been approved with "Autoriser les modifications".`

export function createServer(context: ToolContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: context.remote
        ? INSTRUCTIONS + REMOTE_INSTRUCTIONS
        : INSTRUCTIONS,
    },
  )
  for (const tool of tools as ToolDefinition<z.ZodRawShape>[]) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.write
          ? {
              readOnlyHint: false,
              destructiveHint: false,
              idempotentHint: tool.write.idempotent,
              openWorldHint: false,
            }
          : { readOnlyHint: true, openWorldHint: false },
      },
      (args) => runTool(tool, context, args),
    )
  }
  server.registerPrompt(
    'revue_du_mois',
    {
      title: 'Revue du mois',
      description:
        'Walks through the month-end review with the tools: imports, review queue, recurring items, budget, savings, investments, next month’s budget, close.',
      argsSchema: monthReviewPromptArgs,
    },
    ({ month }) => monthReviewPrompt(context.now(), month),
  )
  server.registerPrompt(
    'importer_mes_investissements',
    {
      title: 'Importer mes investissements',
      description:
        'Reads the investment statements of a Google Drive folder (with the client’s Drive connector) and records the new values with list_investment_accounts, add_investment_snapshots and sync_crypto_holdings, after a summary and previews.',
      argsSchema: investmentsImportPromptArgs,
    },
    ({ folder }) => investmentsImportPrompt(context.now(), folder),
  )
  return server
}
