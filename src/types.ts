import type { ZodIssue, ZodType } from 'zod';

export type JsonSchema = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Tool config & definition
// ---------------------------------------------------------------------------

export interface ToolConfig<TInput = unknown, TOutput = unknown> {
  /** Unique name. 1–64 chars: letters, digits, underscores, hyphens. */
  name: string;
  /** Human description — explain when and how to call this tool. */
  description: string;
  /** Zod schema for input arguments. */
  input: ZodType<TInput>;
  /** Optional Zod schema for the return value. Validates handler output. */
  output?: ZodType<TOutput>;
  /** The implementation. Receives validated input and a ToolContext. */
  handler: (input: TInput, context: ToolContext) => TOutput | Promise<TOutput>;
  /** Timeout in milliseconds. Default: 30_000 */
  timeout?: number;
  /** Extra retry attempts on execution failure (not validation/timeout). Default: 0 */
  retries?: number;
  /** MCP-style behavioural hints (informational only — not enforced). */
  annotations?: ToolAnnotations;
  /**
   * Override the auto-computed JSON Schema for the input.
   * Useful when loading tools from remote manifests.
   */
  _jsonSchema?: JsonSchema;
}

export interface ToolContext {
  /** AbortSignal tied to the timeout. Handlers should honour this for cooperative cancellation. */
  signal: AbortSignal;
  /** Current attempt index (0 = first try, 1 = first retry, …). */
  attempt: number;
}

export interface ToolAnnotations {
  /** Human-readable display title. */
  title?: string;
  /** Hint: tool only reads data, no side-effects. */
  readOnly?: boolean;
  /** Hint: tool modifies or deletes data. */
  destructive?: boolean;
  /** Hint: tool makes expensive external calls — consider caching. */
  expensive?: boolean;
  /** Hint: prompt user for confirmation before calling. */
  requiresConfirmation?: boolean;
  [key: string]: unknown;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly input: ZodType<TInput>;
  readonly output: ZodType<TOutput> | undefined;
  readonly handler: (input: TInput, context: ToolContext) => TOutput | Promise<TOutput>;
  readonly timeout: number;
  readonly retries: number;
  readonly annotations: ToolAnnotations;
  /** Pre-computed JSON Schema for the input. Used by provider adapters. */
  readonly inputSchema: JsonSchema;
  /** Pre-computed JSON Schema for the output, if an output schema was provided. */
  readonly outputSchema: JsonSchema | undefined;
}

// ---------------------------------------------------------------------------
// ToolResult — discriminated union
// ---------------------------------------------------------------------------

export type ToolResult<T = unknown> = ToolSuccess<T> | ToolFailure;

export interface ToolSuccess<T = unknown> {
  readonly success: true;
  readonly data: T;
  readonly toolName: string;
  readonly durationMs: number;
}

export interface ToolFailure {
  readonly success: false;
  readonly error: ToolError;
  readonly toolName: string;
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// ToolError
// ---------------------------------------------------------------------------

export type ToolErrorCode =
  | 'VALIDATION_INPUT'
  | 'VALIDATION_OUTPUT'
  | 'EXECUTION'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'DISABLED';

export interface ToolError {
  readonly code: ToolErrorCode;
  /** Developer-readable message (suitable for logs). */
  readonly message: string;
  /** LLM-readable message formatted to help the model understand and retry. */
  readonly llmMessage: string;
  readonly toolName: string;
  /** Whether the LLM should retry the call. */
  readonly retryable: boolean;
  /** Suggested wait before retrying (ms). */
  readonly retryAfterMs?: number;
  /** Full Zod issue list — only present for VALIDATION_* errors. */
  readonly issues?: ReadonlyArray<ZodIssue>;
  /** Original thrown value — only present for EXECUTION errors. */
  readonly cause?: unknown;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export interface Middleware {
  /** Optional name for logging / debugging. */
  name?: string;
  /**
   * Runs before execution, in registration order.
   * Return a value to replace the tool arguments; return void/undefined to keep them.
   */
  beforeCall?: (toolName: string, args: unknown) => unknown | Promise<unknown> | void | Promise<void>;
  /**
   * Runs after a successful execution, in reverse registration order.
   * Return a ToolSuccess to replace the result; return void/undefined to keep it.
   */
  afterCall?: (
    toolName: string,
    args: unknown,
    result: ToolSuccess,
  ) => ToolSuccess | Promise<ToolSuccess> | void | Promise<void>;
  /**
   * Runs on any failure (validation, execution, timeout, not-found, disabled).
   * Return a ToolResult to recover from the error; return void/undefined to propagate the failure.
   */
  onError?: (
    toolName: string,
    args: unknown,
    failure: ToolFailure,
  ) => ToolResult | Promise<ToolResult> | void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface ToolCallRequest {
  /** Name of the tool to call. */
  name: string;
  /** Raw arguments from the LLM (validated against the input schema at runtime). */
  arguments: unknown;
}

export interface RegistryOptions {
  /** Default timeout for tools that don't specify their own (ms). */
  defaultTimeout?: number;
}

// ---------------------------------------------------------------------------
// Provider adapter output types
// ---------------------------------------------------------------------------

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
    strict?: boolean;
  };
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: JsonSchema;
}

export interface GeminiToolConfig {
  functionDeclarations: GeminiFunctionDeclaration[];
}

export interface VercelAIToolDef {
  description: string;
  parameters: ZodType;
}

export type VercelAIToolSet = Record<string, VercelAIToolDef>;

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface ToolManifestEntry {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  endpoint: string;
}

export interface ToolManifest {
  version: '1.0';
  tools: ToolManifestEntry[];
}

// ---------------------------------------------------------------------------
// Type inference helpers
// ---------------------------------------------------------------------------

/** Extract the input type from a ToolDefinition. */
export type InferInput<T> = T extends ToolDefinition<infer I, unknown> ? I : never;

/** Extract the output type from a ToolDefinition. */
export type InferOutput<T> = T extends ToolDefinition<unknown, infer O> ? O : never;
