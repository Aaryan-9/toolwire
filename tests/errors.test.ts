import { describe, expect, it } from 'vitest';
import type { ZodIssue } from 'zod';
import {
  makeDisabledError,
  makeExecutionError,
  makeNotFoundError,
  makeTimeoutError,
  makeValidationInputError,
  makeValidationOutputError,
} from '../src/errors.js';

const mockIssues: ZodIssue[] = [
  {
    code: 'too_small',
    minimum: 1,
    type: 'string',
    inclusive: true,
    path: ['query'],
    message: 'String must contain at least 1 character(s)',
    origin: 'string',
  } as ZodIssue,
];

describe('makeNotFoundError()', () => {
  it('is retryable', () => {
    expect(makeNotFoundError('bad', ['a']).retryable).toBe(true);
  });

  it('lists available tools in llmMessage', () => {
    const err = makeNotFoundError('bad_tool', ['tool_a', 'tool_b']);
    expect(err.llmMessage).toContain('tool_a');
    expect(err.llmMessage).toContain('tool_b');
  });

  it('handles empty tool list gracefully', () => {
    const err = makeNotFoundError('bad', []);
    expect(err.llmMessage).toContain('No tools are currently registered');
  });

  it('has NOT_FOUND code', () => {
    expect(makeNotFoundError('x', []).code).toBe('NOT_FOUND');
  });
});

describe('makeDisabledError()', () => {
  it('is not retryable', () => {
    expect(makeDisabledError('t').retryable).toBe(false);
  });

  it('has DISABLED code', () => {
    expect(makeDisabledError('t').code).toBe('DISABLED');
  });
});

describe('makeValidationInputError()', () => {
  it('is retryable', () => {
    expect(makeValidationInputError('t', mockIssues).retryable).toBe(true);
  });

  it('has VALIDATION_INPUT code', () => {
    expect(makeValidationInputError('t', mockIssues).code).toBe('VALIDATION_INPUT');
  });

  it('attaches the issues array', () => {
    expect(makeValidationInputError('t', mockIssues).issues).toEqual(mockIssues);
  });

  it('includes field path in llmMessage', () => {
    const err = makeValidationInputError('t', mockIssues);
    expect(err.llmMessage).toContain('query');
  });
});

describe('makeValidationOutputError()', () => {
  it('is not retryable', () => {
    expect(makeValidationOutputError('t', mockIssues).retryable).toBe(false);
  });

  it('has VALIDATION_OUTPUT code', () => {
    expect(makeValidationOutputError('t', mockIssues).code).toBe('VALIDATION_OUTPUT');
  });
});

describe('makeTimeoutError()', () => {
  it('is retryable', () => {
    expect(makeTimeoutError('t', 5000).retryable).toBe(true);
  });

  it('includes duration in message', () => {
    expect(makeTimeoutError('t', 5000).message).toContain('5000ms');
  });

  it('provides retryAfterMs', () => {
    expect(makeTimeoutError('t', 5000).retryAfterMs).toBeDefined();
  });

  it('caps retryAfterMs at 5000', () => {
    expect(makeTimeoutError('t', 60_000).retryAfterMs).toBe(5000);
  });

  it('has TIMEOUT code', () => {
    expect(makeTimeoutError('t', 5000).code).toBe('TIMEOUT');
  });
});

describe('makeExecutionError()', () => {
  it('is not retryable', () => {
    expect(makeExecutionError('t', new Error('fail'), 1).retryable).toBe(false);
  });

  it('has EXECUTION code', () => {
    expect(makeExecutionError('t', new Error('fail'), 1).code).toBe('EXECUTION');
  });

  it('attaches cause', () => {
    const cause = new Error('root cause');
    expect(makeExecutionError('t', cause, 1).cause).toBe(cause);
  });

  it('includes attempt count in message', () => {
    expect(makeExecutionError('t', new Error('x'), 3).message).toContain('3 attempt(s)');
  });

  it('handles non-Error cause', () => {
    const err = makeExecutionError('t', 'string error', 1);
    expect(err.message).toContain('string error');
  });
});
