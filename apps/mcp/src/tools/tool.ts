import type { z } from 'zod'
import type { ApiClient } from '../api/client.js'

export interface ToolContext {
  api: ApiClient
  /** Current instant (injected for tests); "today" is derived in Europe/Paris. */
  now: () => Date
  /**
   * Remote transport (#78): the server does not run on the owner's machine,
   * so tools never read local files.
   */
  remote?: boolean
}

export interface ToolDefinition<Shape extends z.ZodRawShape> {
  name: string
  title: string
  description: string
  inputSchema: Shape
  /**
   * Set on write tools: they preview without `confirm: true` and need a
   * `write` token to apply. `idempotent`: calling again with the same
   * arguments changes nothing more. `destructive` (#597): the client asks
   * the owner to approve each call (`destructiveHint`), on top of the preview.
   */
  write?: { idempotent: boolean; destructive?: boolean }
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
