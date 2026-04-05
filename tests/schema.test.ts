import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { resolveJsonSchema } from '../src/schema.js';

describe('resolveJsonSchema()', () => {
  it('converts a simple object schema', () => {
    const schema = z.object({ name: z.string() });
    const result = resolveJsonSchema(schema);
    expect(result).toMatchObject({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
  });

  it('handles nested objects', () => {
    const schema = z.object({
      user: z.object({ id: z.number(), name: z.string() }),
    });
    const result = resolveJsonSchema(schema);
    expect(result).toMatchObject({
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' },
          },
        },
      },
    });
  });

  it('handles arrays', () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const result = resolveJsonSchema(schema);
    expect(result).toMatchObject({
      properties: { tags: { type: 'array', items: { type: 'string' } } },
    });
  });

  it('handles optional fields', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    });
    expect(resolveJsonSchema(schema)).toMatchObject({ type: 'object' });
  });

  it('handles enums', () => {
    const schema = z.object({ color: z.enum(['red', 'green', 'blue']) });
    const result = resolveJsonSchema(schema);
    expect(result.properties).toBeDefined();
  });

  it('caches results for the same schema instance', () => {
    const schema = z.object({ x: z.number() });
    const r1 = resolveJsonSchema(schema);
    const r2 = resolveJsonSchema(schema);
    expect(r1).toBe(r2);
  });

  it('does not include $schema in output', () => {
    const schema = z.object({ x: z.string() });
    const result = resolveJsonSchema(schema);
    expect(result).not.toHaveProperty('$schema');
  });
});
