import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { z } from 'zod'
import { ApiError } from './api/client.js'
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
Write tools (add_transaction, categorize_transactions, mark_one_off, set_transaction_note, create_rule, set_budget_targets) never change anything without confirm: true. Call them without confirm first, show the owner the preview, and only call again with confirm: true after the owner explicitly agrees. They need a write token; nothing can be deleted through them.`

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

export function createServer(context: ToolContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
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
  return server
}
