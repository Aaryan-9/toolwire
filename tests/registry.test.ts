import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { registry, ToolRegistry } from '../src/registry.js';
import { tool } from '../src/tool.js';

// ---------------------------------------------------------------------------
// Shared tool fixtures
// ---------------------------------------------------------------------------

const addTool = tool({
  name: 'add',
  description: 'Add two numbers',
  input: z.object({ a: z.number(), b: z.number() }),
  output: z.object({ sum: z.number() }),
  handler: async ({ a, b }) => ({ sum: a + b }),
});

const echoTool = tool({
  name: 'echo',
  description: 'Echo the input message',
  input: z.object({ message: z.string() }),
  handler: async ({ message }) => message,
});

// ---------------------------------------------------------------------------

describe('ToolRegistry', () => {
  describe('creation', () => {
    it('creates registry with tools', () => {
      const reg = registry([addTool, echoTool]);
      expect(reg.list()).toEqual(['add', 'echo']);
    });

    it('creates empty registry', () => {
      expect(registry().list()).toEqual([]);
    });
  });

  // ---- call() --------------------------------------------------------------

  describe('call()', () => {
    it('executes a tool and returns success', async () => {
      const reg = registry([addTool]);
      const result = await reg.call({ name: 'add', arguments: { a: 2, b: 3 } });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ sum: 5 });
        expect(result.toolName).toBe('add');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns NOT_FOUND for unknown tool', async () => {
      const reg = registry([addTool]);
      const result = await reg.call({ name: 'nope', arguments: {} });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.retryable).toBe(true);
        expect(result.error.llmMessage).toContain('add'); // lists available tools
      }
    });

    it('returns VALIDATION_INPUT for bad arguments', async () => {
      const reg = registry([addTool]);
      const result = await reg.call({ name: 'add', arguments: { a: 'oops', b: 3 } });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_INPUT');
        expect(result.error.retryable).toBe(true);
        expect(result.error.issues).toBeDefined();
        expect(result.error.llmMessage).toContain('add');
      }
    });

    it('returns DISABLED for a disabled tool', async () => {
      const reg = registry([addTool]);
      reg.disable('add');
      const result = await reg.call({ name: 'add', arguments: { a: 1, b: 2 } });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DISABLED');
    });

    it('returns EXECUTION error when handler throws', async () => {
      const failTool = tool({
        name: 'fail',
        description: 'Always fails',
        input: z.object({}),
        handler: async () => { throw new Error('boom'); },
      });
      const result = await registry([failTool]).call({ name: 'fail', arguments: {} });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EXECUTION');
        expect(result.error.cause).toBeInstanceOf(Error);
      }
    });

    it('retries on execution failure and succeeds', async () => {
      let calls = 0;
      const retryTool = tool({
        name: 'flaky',
        description: 'Fails twice then succeeds',
        input: z.object({}),
        retries: 2,
        handler: async () => {
          calls++;
          if (calls < 3) throw new Error(`attempt ${calls}`);
          return 'ok';
        },
      });
      const result = await registry([retryTool]).call({ name: 'flaky', arguments: {} });

      expect(result.success).toBe(true);
      expect(calls).toBe(3);
    });

    it('exhausts retries and returns EXECUTION error', async () => {
      const alwaysFails = tool({
        name: 'always_fails',
        description: 'Never works',
        input: z.object({}),
        retries: 1,
        handler: async () => { throw new Error('nope'); },
      });
      const result = await registry([alwaysFails]).call({ name: 'always_fails', arguments: {} });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EXECUTION');
        expect(result.error.message).toContain('2 attempt(s)');
      }
    });

    it('times out when handler is too slow', async () => {
      const slowTool = tool({
        name: 'slow',
        description: 'Sleeps forever',
        input: z.object({}),
        timeout: 50,
        handler: () => new Promise<never>(() => {/* never resolves */}),
      });
      const result = await registry([slowTool]).call({ name: 'slow', arguments: {} });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('TIMEOUT');
    }, 2000);

    it('validates output when output schema is provided', async () => {
      const badOutput = tool({
        name: 'bad_output',
        description: 'Wrong return shape',
        input: z.object({}),
        output: z.object({ count: z.number() }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: async () => ({ count: 'not a number' } as any),
      });
      const result = await registry([badOutput]).call({ name: 'bad_output', arguments: {} });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_OUTPUT');
    });

    it('never throws — always resolves', async () => {
      const reg = registry([addTool]);
      await expect(
        reg.call({ name: 'anything', arguments: null }),
      ).resolves.toBeDefined();
    });
  });

  // ---- register() ----------------------------------------------------------

  describe('register()', () => {
    it('adds a single tool', () => {
      const reg = registry([addTool]);
      reg.register(echoTool);
      expect(reg.list()).toContain('echo');
    });

    it('adds multiple tools at once', () => {
      const reg = registry();
      reg.register([addTool, echoTool]);
      expect(reg.list()).toHaveLength(2);
    });

    it('returns this for chaining', () => {
      const reg = registry();
      expect(reg.register(addTool)).toBe(reg);
    });
  });

  // ---- swap() --------------------------------------------------------------

  describe('swap()', () => {
    it('replaces a tool', async () => {
      const reg = registry([addTool]);
      const newAdd = tool({
        name: 'add',
        description: 'New add',
        input: z.object({ a: z.number(), b: z.number() }),
        handler: async ({ a, b }) => ({ sum: a + b + 100 }),
      });
      reg.swap('add', newAdd);

      const result = await reg.call({ name: 'add', arguments: { a: 1, b: 2 } });
      expect(result.success).toBe(true);
      if (result.success) expect((result.data as { sum: number }).sum).toBe(103);
    });

    it('throws for unregistered tool', () => {
      expect(() => registry().swap('nope', addTool)).toThrow(/not registered/);
    });

    it('returns this for chaining', () => {
      const reg = registry([addTool]);
      expect(reg.swap('add', addTool)).toBe(reg);
    });
  });

  // ---- enable / disable ----------------------------------------------------

  describe('enable() / disable()', () => {
    it('can re-enable a disabled tool', async () => {
      const reg = registry([addTool]);
      reg.disable('add');
      reg.enable('add');
      const result = await reg.call({ name: 'add', arguments: { a: 1, b: 2 } });
      expect(result.success).toBe(true);
    });

    it('throws when enabling unknown tool', () => {
      expect(() => registry().enable('nope')).toThrow(/not registered/);
    });

    it('throws when disabling unknown tool', () => {
      expect(() => registry().disable('nope')).toThrow(/not registered/);
    });
  });

  // ---- get() ---------------------------------------------------------------

  describe('get()', () => {
    it('returns the tool definition', () => {
      const reg = registry([addTool]);
      expect(reg.get('add')).toBe(addTool);
    });

    it('returns undefined for unknown tool', () => {
      expect(registry([addTool]).get('nope')).toBeUndefined();
    });
  });

  // ---- describe() ----------------------------------------------------------

  describe('describe()', () => {
    it('includes tool names and descriptions', () => {
      const text = registry([addTool, echoTool]).describe();
      expect(text).toContain('add');
      expect(text).toContain('Add two numbers');
      expect(text).toContain('echo');
    });

    it('excludes disabled tools', () => {
      const reg = registry([addTool, echoTool]);
      reg.disable('echo');
      expect(reg.describe()).not.toContain('echo');
    });

    it('returns fallback message for empty registry', () => {
      expect(registry().describe()).toContain('No tools');
    });
  });

  // ---- provider adapters ---------------------------------------------------

  describe('provider adapters', () => {
    it('toOpenAI() produces correct shape', () => {
      const tools = registry([addTool]).toOpenAI();
      expect(tools).toHaveLength(1);
      expect(tools[0]).toMatchObject({
        type: 'function',
        function: {
          name: 'add',
          description: 'Add two numbers',
          parameters: expect.objectContaining({ type: 'object' }),
        },
      });
    });

    it('toAnthropic() uses input_schema key', () => {
      const tools = registry([addTool]).toAnthropic();
      expect(tools[0]).toHaveProperty('input_schema');
    });

    it('toGemini() wraps in functionDeclarations', () => {
      const config = registry([addTool]).toGemini();
      expect(config.functionDeclarations).toHaveLength(1);
      expect(config.functionDeclarations[0]).toHaveProperty('parametersJsonSchema');
    });

    it('toVercelAI() is keyed by name', () => {
      const tools = registry([addTool]).toVercelAI();
      expect(tools['add']).toBeDefined();
      expect(typeof tools['add']?.parameters?.parse).toBe('function');
    });

    it('adapters exclude disabled tools', () => {
      const reg = registry([addTool, echoTool]);
      reg.disable('echo');
      expect(reg.toOpenAI()).toHaveLength(1);
      expect(reg.toAnthropic()).toHaveLength(1);
    });
  });
});
