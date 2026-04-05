import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { tool } from '../src/tool.js';

describe('tool()', () => {
  it('creates a definition with correct defaults', () => {
    const t = tool({
      name: 'my_tool',
      description: 'A test tool',
      input: z.object({ x: z.number() }),
      handler: async ({ x }) => x * 2,
    });

    expect(t.name).toBe('my_tool');
    expect(t.description).toBe('A test tool');
    expect(t.timeout).toBe(30_000);
    expect(t.retries).toBe(0);
    expect(t.annotations).toEqual({});
    expect(t.outputSchema).toBeUndefined();
  });

  it('freezes the returned object', () => {
    const t = tool({
      name: 'frozen',
      description: 'test',
      input: z.object({}),
      handler: async () => null,
    });
    expect(Object.isFrozen(t)).toBe(true);
  });

  it('rejects empty name', () => {
    expect(() =>
      tool({ name: '', description: 'x', input: z.object({}), handler: async () => null }),
    ).toThrow(/Invalid tool name/);
  });

  it('rejects names with spaces', () => {
    expect(() =>
      tool({ name: 'a b', description: 'x', input: z.object({}), handler: async () => null }),
    ).toThrow(/Invalid tool name/);
  });

  it('rejects names longer than 64 chars', () => {
    expect(() =>
      tool({ name: 'a'.repeat(65), description: 'x', input: z.object({}), handler: async () => null }),
    ).toThrow(/Invalid tool name/);
  });

  it('accepts all valid name patterns', () => {
    for (const name of ['my_tool', 'my-tool', 'myTool', 'tool123', 'UPPER', 'a']) {
      expect(() =>
        tool({ name, description: 'x', input: z.object({}), handler: async () => null }),
      ).not.toThrow();
    }
  });

  it('generates inputSchema from Zod type', () => {
    const t = tool({
      name: 'schema_test',
      description: 'test',
      input: z.object({ query: z.string(), limit: z.number() }),
      handler: async () => null,
    });

    expect(t.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    });
  });

  it('generates outputSchema when output schema is provided', () => {
    const t = tool({
      name: 'with_output',
      description: 'test',
      input: z.object({ x: z.number() }),
      output: z.object({ result: z.number() }),
      handler: async ({ x }) => ({ result: x * 2 }),
    });
    expect(t.outputSchema).toBeDefined();
    expect(t.outputSchema).toMatchObject({ type: 'object' });
  });

  it('uses custom timeout and retries', () => {
    const t = tool({
      name: 'custom',
      description: 'test',
      input: z.object({}),
      handler: async () => null,
      timeout: 5_000,
      retries: 3,
    });
    expect(t.timeout).toBe(5_000);
    expect(t.retries).toBe(3);
  });

  it('stores annotations', () => {
    const t = tool({
      name: 'annotated',
      description: 'test',
      input: z.object({}),
      handler: async () => null,
      annotations: { readOnly: true, title: 'My Tool' },
    });
    expect(t.annotations).toMatchObject({ readOnly: true, title: 'My Tool' });
  });

  it('respects _jsonSchema override', () => {
    const custom = { type: 'object', properties: { x: { type: 'integer' } } };
    const t = tool({
      name: 'override',
      description: 'test',
      input: z.object({ x: z.number() }),
      handler: async () => null,
      _jsonSchema: custom,
    });
    expect(t.inputSchema).toEqual(custom);
  });
});
