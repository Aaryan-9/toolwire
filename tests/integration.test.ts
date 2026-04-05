import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { registry, tool } from '../src/index.js';
import type { Middleware } from '../src/types.js';

// ---------------------------------------------------------------------------
// A realistic set of tools
// ---------------------------------------------------------------------------

const searchTool = tool({
  name: 'search_web',
  description: 'Search the web for current information',
  input: z.object({
    query: z.string().min(1).describe('The search query'),
    maxResults: z.number().int().min(1).max(20).default(5),
  }),
  output: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
      }),
    ),
  }),
  handler: async ({ query, maxResults }) => ({
    results: Array.from({ length: Math.min(maxResults, 2) }, (_, i) => ({
      title: `Result ${i + 1} for "${query}"`,
      url: `https://example.com/result-${i}`,
      snippet: `Snippet ${i + 1}`,
    })),
  }),
  timeout: 5_000,
});

const calculatorTool = tool({
  name: 'calculate',
  description: 'Evaluate a mathematical expression',
  input: z.object({ expression: z.string().describe('A simple math expression like "2 + 2"') }),
  handler: async ({ expression }) => {
    // Safe-ish eval — only allow digits and operators
    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      throw new Error(`Unsafe expression: ${expression}`);
    }
    // eslint-disable-next-line no-new-func
    const result = Function(`'use strict'; return (${expression})`)() as number;
    return { result };
  },
});

// ---------------------------------------------------------------------------

describe('Integration', () => {
  it('executes a full tool call cycle with middleware', async () => {
    const log: string[] = [];

    const loggingMiddleware: Middleware = {
      name: 'logger',
      beforeCall: (name) => { log.push(`start:${name}`); },
      afterCall: (name) => { log.push(`end:${name}`); },
      onError: (name) => { log.push(`error:${name}`); },
    };

    const reg = registry([searchTool, calculatorTool]).use(loggingMiddleware);

    const result = await reg.call({
      name: 'search_web',
      arguments: { query: 'TypeScript best practices', maxResults: 2 },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as { results: Array<{ title: string }> };
      expect(data.results).toHaveLength(2);
      expect(data.results[0]?.title).toContain('TypeScript best practices');
    }

    expect(log).toEqual(['start:search_web', 'end:search_web']);
  });

  it('exports to all four provider formats', () => {
    const reg = registry([searchTool, calculatorTool]);

    const openai = reg.toOpenAI();
    expect(openai).toHaveLength(2);
    expect(openai[0]?.type).toBe('function');

    const anthropic = reg.toAnthropic();
    expect(anthropic).toHaveLength(2);
    expect(anthropic[0]).toHaveProperty('input_schema');

    const gemini = reg.toGemini();
    expect(gemini.functionDeclarations).toHaveLength(2);
    expect(gemini.functionDeclarations[0]).toHaveProperty('parametersJsonSchema');

    const vercel = reg.toVercelAI();
    expect(vercel['search_web']).toBeDefined();
    expect(vercel['calculate']).toBeDefined();
  });

  it('normalises LLM validation errors with helpful llmMessage', async () => {
    const reg = registry([searchTool]);

    const result = await reg.call({
      name: 'search_web',
      arguments: { query: '', maxResults: 999 }, // empty query, too many results
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_INPUT');
      expect(result.error.retryable).toBe(true);
      expect(result.error.llmMessage).toContain('search_web');
      // llmMessage should give the LLM enough to retry correctly
      expect(result.error.llmMessage.length).toBeGreaterThan(20);
    }
  });

  it('hot-swaps a tool mid-run', async () => {
    const reg = registry([searchTool]);

    const v1 = await reg.call({
      name: 'search_web',
      arguments: { query: 'hello', maxResults: 1 },
    });
    expect(v1.success).toBe(true);

    // Swap to a cached stub
    const cachedSearch = tool({
      name: 'search_web',
      description: 'Cached search',
      input: z.object({ query: z.string().min(1), maxResults: z.number().default(5) }),
      handler: async () => ({
        results: [{ title: 'Cached', url: 'https://cache.dev', snippet: 'From cache' }],
      }),
    });
    reg.swap('search_web', cachedSearch);

    const v2 = await reg.call({
      name: 'search_web',
      arguments: { query: 'hello', maxResults: 1 },
    });
    expect(v2.success).toBe(true);
    if (v2.success) {
      const data = v2.data as { results: Array<{ title: string }> };
      expect(data.results[0]?.title).toBe('Cached');
    }
  });

  it('describes tools in human-readable format', () => {
    const reg = registry([searchTool, calculatorTool]);
    const description = reg.describe();
    expect(description).toContain('search_web');
    expect(description).toContain('Search the web');
    expect(description).toContain('calculate');
  });

  it('calculator tool rejects unsafe expressions', async () => {
    const reg = registry([calculatorTool]);
    const result = await reg.call({
      name: 'calculate',
      arguments: { expression: 'process.exit(1)' },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('EXECUTION');
  });
});
