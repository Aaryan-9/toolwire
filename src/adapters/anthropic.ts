import type { AnthropicTool, ToolDefinition } from '../types.js';

/**
 * Convert tool definitions to Anthropic tool-use format.
 * Note: uses `input_schema` (not `parameters`).
 *
 * @example
 * ```ts
 * const response = await anthropic.messages.create({
 *   model: 'claude-opus-4-6',
 *   tools: reg.toAnthropic(),
 *   messages,
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toAnthropic(tools: ToolDefinition<any, any>[]): AnthropicTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}
