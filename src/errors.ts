import type { ZodIssue } from 'zod';
import type { ToolError, ToolErrorCode, ToolFailure } from './types.js';

function err(
  code: ToolErrorCode,
  toolName: string,
  message: string,
  llmMessage: string,
  retryable: boolean,
  extras?: Partial<Pick<ToolError, 'retryAfterMs' | 'issues' | 'cause'>>,
): ToolError {
  return { code, toolName, message, llmMessage, retryable, ...extras };
}

export function makeNotFoundError(toolName: string, available: string[]): ToolError {
  const list =
    available.length > 0
      ? `Available tools: ${available.join(', ')}.`
      : 'No tools are currently registered.';
  return err(
    'NOT_FOUND',
    toolName,
    `Tool "${toolName}" is not registered`,
    `The tool "${toolName}" does not exist. ${list} Please use one of the available tools.`,
    true,
  );
}

export function makeDisabledError(toolName: string): ToolError {
  return err(
    'DISABLED',
    toolName,
    `Tool "${toolName}" is currently disabled`,
    `The tool "${toolName}" is currently disabled and cannot be called. Please try a different approach or wait until it is re-enabled.`,
    false,
  );
}

export function makeValidationInputError(toolName: string, issues: ZodIssue[]): ToolError {
  const lines = issues
    .map((i) => `  - ${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('\n');
  return err(
    'VALIDATION_INPUT',
    toolName,
    `Invalid input for tool "${toolName}"`,
    `Your call to "${toolName}" had invalid arguments:\n${lines}\n\nPlease fix these and try again.`,
    true,
    { issues },
  );
}

export function makeValidationOutputError(toolName: string, issues: ZodIssue[]): ToolError {
  return err(
    'VALIDATION_OUTPUT',
    toolName,
    `Tool "${toolName}" returned an invalid response format`,
    `The tool "${toolName}" returned an unexpected response and could not be used. This is a bug in the tool implementation, not in your call. Please try a different approach.`,
    false,
    { issues },
  );
}

export function makeTimeoutError(toolName: string, timeoutMs: number): ToolError {
  return err(
    'TIMEOUT',
    toolName,
    `Tool "${toolName}" timed out after ${timeoutMs}ms`,
    `The tool "${toolName}" timed out after ${timeoutMs}ms. This may be a temporary issue — please wait a moment before retrying.`,
    true,
    { retryAfterMs: Math.min(timeoutMs, 5_000) },
  );
}

export function makeExecutionError(
  toolName: string,
  cause: unknown,
  attempts: number,
): ToolError {
  const msg = cause instanceof Error ? cause.message : String(cause);
  const attemptStr = attempts > 1 ? ` after ${attempts} attempt(s)` : '';
  return err(
    'EXECUTION',
    toolName,
    `Tool "${toolName}" failed${attemptStr}: ${msg}`,
    `The tool "${toolName}" encountered an error${attemptStr}: ${msg}. All retries have been exhausted — please try a different approach.`,
    false,
    { cause },
  );
}

export function makeFailure(
  toolName: string,
  error: ToolError,
  durationMs: number,
): ToolFailure {
  return { success: false, toolName, error, durationMs };
}
