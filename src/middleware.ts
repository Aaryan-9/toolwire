import type { Middleware, ToolFailure, ToolResult, ToolSuccess } from './types.js';

/**
 * Run all beforeCall hooks in registration order.
 * Each hook may return a transformed argument list (or nothing to keep the current value).
 */
export async function runBefore(
  middleware: Middleware[],
  toolName: string,
  args: unknown,
): Promise<unknown> {
  let current = args;
  for (const mw of middleware) {
    if (mw.beforeCall) {
      const next = await mw.beforeCall(toolName, current);
      if (next !== undefined) current = next;
    }
  }
  return current;
}

/**
 * Run all afterCall hooks in reverse registration order (outermost wraps first).
 * Each hook may return a transformed ToolSuccess (or nothing to keep the current value).
 */
export async function runAfter(
  middleware: Middleware[],
  toolName: string,
  args: unknown,
  result: ToolSuccess,
): Promise<ToolSuccess> {
  let current = result;
  for (let i = middleware.length - 1; i >= 0; i--) {
    const mw = middleware[i];
    if (mw?.afterCall) {
      const next = await mw.afterCall(toolName, args, current);
      if (next !== undefined) current = next;
    }
  }
  return current;
}

/**
 * Run all onError hooks in registration order.
 * The first hook that returns a ToolResult short-circuits the chain (recovery).
 */
export async function runOnError(
  middleware: Middleware[],
  toolName: string,
  args: unknown,
  failure: ToolFailure,
): Promise<ToolResult> {
  for (const mw of middleware) {
    if (mw.onError) {
      const recovery = await mw.onError(toolName, args, failure);
      if (recovery !== undefined) return recovery;
    }
  }
  return failure;
}
