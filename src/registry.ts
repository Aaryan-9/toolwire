import {
  makeDisabledError,
  makeExecutionError,
  makeFailure,
  makeNotFoundError,
  makeTimeoutError,
  makeValidationInputError,
  makeValidationOutputError,
} from './errors.js';
import { runAfter, runBefore, runOnError } from './middleware.js';
import type {
  AnthropicTool,
  GeminiToolConfig,
  Middleware,
  OpenAITool,
  RegistryOptions,
  ToolCallRequest,
  ToolDefinition,
  ToolResult,
  ToolSuccess,
  VercelAIToolSet,
} from './types.js';
import { toAnthropic } from './adapters/anthropic.js';
import { toGemini } from './adapters/gemini.js';
import { toOpenAI } from './adapters/openai.js';
import { toVercelAI } from './adapters/vercel-ai.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = ToolDefinition<any, any>;

export class ToolRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly tools = new Map<string, ToolDefinition<any, any>>();
  private readonly disabledTools = new Set<string>();
  private readonly _middleware: Middleware[] = [];
  private readonly options: RegistryOptions;

  constructor(tools: AnyTool[] = [], options: RegistryOptions = {}) {
    this.options = options;
    for (const t of tools) {
      this.tools.set(t.name, t);
    }
  }

  // ---------------------------------------------------------------------------
  // Tool management
  // ---------------------------------------------------------------------------

  /** Add one or more tools. Returns `this` for chaining. */
  register(tools: AnyTool | AnyTool[]): this {
    const list = Array.isArray(tools) ? tools : [tools];
    for (const t of list) this.tools.set(t.name, t);
    return this;
  }

  /**
   * Replace a registered tool in-place (hot-swap).
   * Useful for swapping slow tools with cached versions mid-run.
   */
  swap(name: string, newTool: AnyTool): this {
    if (!this.tools.has(name)) {
      throw new Error(`tool-validate: Cannot swap "${name}" — it is not registered.`);
    }
    this.tools.set(name, newTool);
    return this;
  }

  /** Temporarily prevent a tool from being called. */
  disable(name: string): this {
    if (!this.tools.has(name)) {
      throw new Error(`tool-validate: Cannot disable "${name}" — it is not registered.`);
    }
    this.disabledTools.add(name);
    return this;
  }

  /** Re-enable a previously disabled tool. */
  enable(name: string): this {
    if (!this.tools.has(name)) {
      throw new Error(`tool-validate: Cannot enable "${name}" — it is not registered.`);
    }
    this.disabledTools.delete(name);
    return this;
  }

  /** Add middleware. Returns `this` for chaining. */
  use(middleware: Middleware | Middleware[]): this {
    const list = Array.isArray(middleware) ? middleware : [middleware];
    this._middleware.push(...list);
    return this;
  }

  /** Return the names of all registered tools (including disabled ones). */
  list(): string[] {
    return [...this.tools.keys()];
  }

  /** Return a tool definition by name, or undefined if not found. */
  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Return a human-readable list of enabled tools.
   * Handy for injecting into a system prompt.
   */
  describe(): string {
    const enabled = [...this.tools.values()].filter(
      (t) => !this.disabledTools.has(t.name),
    );
    if (enabled.length === 0) return 'No tools are currently available.';
    return enabled.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  /**
   * Execute a tool call from an LLM.
   * Always resolves (never throws) — check `result.success` to distinguish outcomes.
   */
  async call(request: ToolCallRequest): Promise<ToolResult> {
    const start = Date.now();
    const { name: toolName, arguments: rawArgs } = request;

    // 1. Tool exists?
    const toolDef = this.tools.get(toolName);
    if (!toolDef) {
      return runOnError(
        this._middleware,
        toolName,
        rawArgs,
        makeFailure(toolName, makeNotFoundError(toolName, this.list()), Date.now() - start),
      );
    }

    // 2. Tool enabled?
    if (this.disabledTools.has(toolName)) {
      return runOnError(
        this._middleware,
        toolName,
        rawArgs,
        makeFailure(toolName, makeDisabledError(toolName), Date.now() - start),
      );
    }

    // 3. Validate input
    const parsed = toolDef.input.safeParse(rawArgs);
    if (!parsed.success) {
      return runOnError(
        this._middleware,
        toolName,
        rawArgs,
        makeFailure(
          toolName,
          makeValidationInputError(toolName, parsed.error.issues),
          Date.now() - start,
        ),
      );
    }

    // 4. beforeCall middleware (can transform args)
    let args: unknown = parsed.data;
    try {
      args = await runBefore(this._middleware, toolName, args);
    } catch (err) {
      return runOnError(
        this._middleware,
        toolName,
        rawArgs,
        makeFailure(toolName, makeExecutionError(toolName, err, 1), Date.now() - start),
      );
    }

    // 5. Execute with timeout + retries
    const timeout =
      toolDef.timeout ?? this.options.defaultTimeout ?? 30_000;
    const maxAttempts = toolDef.retries + 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await withTimeout(
          (signal) => (toolDef.handler as (i: unknown, c: { signal: AbortSignal; attempt: number }) => unknown)(args, { signal, attempt }),
          timeout,
          toolName,
        );

        // 6. Validate output (if schema provided)
        let output: unknown = data;
        if (toolDef.output) {
          const outParsed = toolDef.output.safeParse(data);
          if (!outParsed.success) {
            return runOnError(
              this._middleware,
              toolName,
              rawArgs,
              makeFailure(
                toolName,
                makeValidationOutputError(toolName, outParsed.error.issues),
                Date.now() - start,
              ),
            );
          }
          output = outParsed.data;
        }

        // 7. Build success & run afterCall middleware
        const raw: ToolSuccess = {
          success: true,
          data: output,
          toolName,
          durationMs: Date.now() - start,
        };
        return await runAfter(this._middleware, toolName, rawArgs, raw);

      } catch (err) {
        lastError = err;

        if (isAbortError(err)) {
          return runOnError(
            this._middleware,
            toolName,
            rawArgs,
            makeFailure(toolName, makeTimeoutError(toolName, timeout), Date.now() - start),
          );
        }

        if (attempt < maxAttempts - 1) {
          await sleep(100 * 2 ** attempt);
        }
      }
    }

    // All retries exhausted
    return runOnError(
      this._middleware,
      toolName,
      rawArgs,
      makeFailure(
        toolName,
        makeExecutionError(toolName, lastError, maxAttempts),
        Date.now() - start,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Provider adapters
  // ---------------------------------------------------------------------------

  /** Export tool schemas in OpenAI function-calling format. */
  toOpenAI(options?: { strict?: boolean }): OpenAITool[] {
    return toOpenAI(this.enabledTools(), options);
  }

  /** Export tool schemas in Anthropic tool-use format. */
  toAnthropic(): AnthropicTool[] {
    return toAnthropic(this.enabledTools());
  }

  /** Export tool schemas in Google Gemini format. */
  toGemini(): GeminiToolConfig {
    return toGemini(this.enabledTools());
  }

  /** Export tool schemas in Vercel AI SDK format (passes Zod schemas directly). */
  toVercelAI(): VercelAIToolSet {
    return toVercelAI(this.enabledTools());
  }

  // ---------------------------------------------------------------------------
  // Static factory methods
  // ---------------------------------------------------------------------------

  /** Load tools from a directory of compiled JS/MJS files. */
  static async fromDir(dirPath: string): Promise<ToolRegistry> {
    const { fromDir } = await import('./discovery.js');
    return fromDir(dirPath);
  }

  /** Load tools from a remote JSON manifest. */
  static async fromManifest(url: string): Promise<ToolRegistry> {
    const { fromManifest } = await import('./discovery.js');
    return fromManifest(url);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private enabledTools(): AnyTool[] {
    return [...this.tools.values()].filter((t) => !this.disabledTools.has(t.name));
  }
}

/** Convenience factory — same as `new ToolRegistry(tools, options)`. */
export function registry(tools: AnyTool[] = [], options: RegistryOptions = {}): ToolRegistry {
  return new ToolRegistry(tools, options);
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

async function withTimeout<T>(
  fn: (signal: AbortSignal) => T | Promise<T>,
  ms: number,
  toolName: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      new DOMException(`Tool "${toolName}" timed out after ${ms}ms`, 'AbortError'),
    );
  }, ms);

  const execution = Promise.resolve().then(() => fn(controller.signal));
  const timeoutRace = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {
      once: true,
    });
  });

  try {
    return await Promise.race([execution, timeoutRace]);
  } finally {
    clearTimeout(timer);
    // Suppress any later rejection from the execution promise if timeout won
    execution.catch(() => undefined);
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || (err instanceof DOMException && err.name === 'AbortError'))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
