import type { OpenAITool, ToolDefinition } from '../types.js';

/**
 * Convert tool definitions to OpenAI function-calling format.
 *
 * @example
 * ```ts
 * const response = await openai.chat.completions.create({
 *   model: 'gpt-4o',
 *   tools: reg.toOpenAI({ strict: true }),
 *   messages,
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toOpenAI(
  tools: ToolDefinition<any, any>[],
  options?: { strict?: boolean },
): OpenAITool[] {
  return tools.map((t) => {
    const fn: OpenAITool['function'] = {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    };
    if (options?.strict !== undefined) {
      fn.strict = options.strict;
    }
    return { type: 'function' as const, function: fn };
  });
}
