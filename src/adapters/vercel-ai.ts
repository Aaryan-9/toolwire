import type { ToolDefinition, VercelAIToolSet } from '../types.js';

/**
 * Convert tool definitions to Vercel AI SDK format.
 * Unlike other adapters, this passes the original Zod schema directly
 * (Vercel AI SDK handles JSON Schema conversion internally).
 *
 * @example
 * ```ts
 * const { text } = await generateText({
 *   model: openai('gpt-4o'),
 *   tools: reg.toVercelAI(),
 *   prompt,
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toVercelAI(tools: ToolDefinition<any, any>[]): VercelAIToolSet {
  return Object.fromEntries(
    tools.map((t) => [
      t.name,
      {
        description: t.description,
        parameters: t.input,
      },
    ]),
  );
}
