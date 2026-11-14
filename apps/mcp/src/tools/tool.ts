import type { z } from 'zod'
import type { ApiClient } from '../api/client.js'

export interface ToolContext {
  api: ApiClient
  /** Current instant (injected for tests); "today" is derived in Europe/Paris. */
  now: () => Date
}

export interface ToolDefinition<Shape extends z.ZodRawShape> {
  name: string
  title: string
  description: string
  inputSchema: Shape
  /**
   * Set on write tools: they preview without `confirm: true` and need a
   * `write` token to apply. `idempotent`: calling again with the same
   * arguments changes nothing more.
   */
  write?: { idempotent: boolean }
  /** Returns the text shown to the model (French, euros, French dates). */
  run(context: ToolContext, args: z.infer<z.ZodObject<Shape>>): Promise<string>
}

/** Keeps each tool's `args` typed from its own schema. */
export function defineTool<Shape extends z.ZodRawShape>(
  tool: ToolDefinition<Shape>,
): ToolDefinition<Shape> {
  return tool
}

/** Input that the tool rejects before calling the API (bad combination of filters...). */
export class ToolInputError extends Error {}
