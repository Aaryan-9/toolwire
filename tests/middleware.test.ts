import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { registry } from '../src/registry.js';
import { tool } from '../src/tool.js';
import type { Middleware, ToolSuccess } from '../src/types.js';

const addTool = tool({
  name: 'add',
  description: 'Add two numbers',
  input: z.object({ a: z.number(), b: z.number() }),
  handler: async ({ a, b }) => ({ sum: a + b }),
});

describe('Middleware', () => {
  it('beforeCall can observe calls', async () => {
    const log: string[] = [];
    const reg = registry([addTool]).use({
      beforeCall: (name) => { log.push(name); },
    });
    await reg.call({ name: 'add', arguments: { a: 1, b: 2 } });
    expect(log).toEqual(['add']);
  });

  it('afterCall can observe results', async () => {
    const log: unknown[] = [];
    const reg = registry([addTool]).use({
      afterCall: (name, args, result) => { log.push(result.data); },
    });
    await reg.call({ name: 'add', arguments: { a: 1, b: 2 } });
    expect(log).toEqual([{ sum: 3 }]);
  });

  it('onError can observe failures', async () => {
    const codes: string[] = [];
    const reg = registry([addTool]).use({
      onError: (name, args, failure) => { codes.push(failure.error.code); },
    });
    await reg.call({ name: 'nope', arguments: {} });
    expect(codes).toEqual(['NOT_FOUND']);
  });

  it('onError can recover from failures', async () => {
    const reg = registry([addTool]).use({
      onError: (name): ToolSuccess => ({
        success: true,
        data: { sum: 999 },
        toolName: name,
        durationMs: 0,
      }),
    });
    const result = await reg.call({ name: 'nonexistent', arguments: {} });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ sum: 999 });
  });

  it('beforeCall runs in registration order', async () => {
    const order: number[] = [];
    const reg = registry([addTool])
      .use({ beforeCall: () => { order.push(1); } })
      .use({ beforeCall: () => { order.push(2); } })
      .use({ beforeCall: () => { order.push(3); } });
    await reg.call({ name: 'add', arguments: { a: 1, b: 2 } });
    expect(order).toEqual([1, 2, 3]);
  });

  it('afterCall runs in reverse registration order', async () => {
    const order: number[] = [];
    const reg = registry([addTool])
      .use({ afterCall: () => { order.push(1); } })
      .use({ afterCall: () => { order.push(2); } })
      .use({ afterCall: () => { order.push(3); } });
    await reg.call({ name: 'add', arguments: { a: 1, b: 2 } });
    expect(order).toEqual([3, 2, 1]);
  });

  it('accepts array of middleware in one call', async () => {
    const log: string[] = [];
    const mw1: Middleware = { beforeCall: () => { log.push('mw1'); } };
    const mw2: Middleware = { beforeCall: () => { log.push('mw2'); } };
    await registry([addTool]).use([mw1, mw2]).call({ name: 'add', arguments: { a: 1, b: 2 } });
    expect(log).toEqual(['mw1', 'mw2']);
  });

  it('returns this from use() for chaining', () => {
    const reg = registry([addTool]);
    expect(reg.use({ name: 'logger' })).toBe(reg);
  });

  it('async middleware is awaited', async () => {
    let done = false;
    const reg = registry([addTool]).use({
      beforeCall: async () => {
        await new Promise((r) => setTimeout(r, 10));
        done = true;
      },
    });
    await reg.call({ name: 'add', arguments: { a: 1, b: 2 } });
    expect(done).toBe(true);
  });
});
