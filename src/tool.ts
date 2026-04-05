import { resolveJsonSchema } from './schema.js';
import type { ToolConfig, ToolDefinition } from './types.js';

const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

const DEFAULTS = {
  timeout: 30_000,
  retries: 0,
} as const;

/**
 * Define a tool. Returns a frozen ToolDefinition with pre-computed JSON schemas.
 *
 * @example
 * ```ts
 * const search = tool({
 *   name: 'search_web',
 *   description: 'Search the web for current information',
 *   input: z.object({ query: z.string().min(1) }),
 *   handler: async ({ query }) => mySearchAPI(query),
 *   timeout: 10_000,
 * });
 * ```
 */
export function tool<TInput = unknown, TOutput = unknown>(
  config: ToolConfig<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
  if (!NAME_RE.test(config.name)) {
    throw new Error(
      `tool-validator: Invalid tool name "${config.name}". ` +
        'Names must be 1–64 characters containing only letters, digits, underscores, or hyphens.',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inputSchema = config._jsonSchema ?? resolveJsonSchema(config.input as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outputSchema = config.output ? resolveJsonSchema(config.output as any) : undefined;

  const def: ToolDefinition<TInput, TOutput> = {
    name: config.name,
    description: config.description,
    input: config.input,
    output: config.output,
    handler: config.handler,
    timeout: config.timeout ?? DEFAULTS.timeout,
    retries: config.retries ?? DEFAULTS.retries,
    annotations: config.annotations ?? {},
    inputSchema,
    outputSchema,
  };

  return Object.freeze(def);
}
