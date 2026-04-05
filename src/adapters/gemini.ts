import type { GeminiToolConfig, ToolDefinition } from '../types.js';

/**
 * Convert tool definitions to Google Gemini format.
 * Uses `parametersJsonSchema` (not `parameters`) and wraps in `functionDeclarations`.
 *
 * @example
 * ```ts
 * const response = await model.generateContent({
 *   tools: [reg.toGemini()],
 *   contents,
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toGemini(tools: ToolDefinition<any, any>[]): GeminiToolConfig {
  return {
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parametersJsonSchema: t.inputSchema,
    })),
  };
}
