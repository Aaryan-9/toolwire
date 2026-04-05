import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromDir } from '../src/discovery.js';

const FIXTURES = resolve('./tests/fixtures/tools');

describe('fromDir()', () => {
  it('loads tools from a directory', async () => {
    const reg = await fromDir(FIXTURES);
    expect(reg.list()).toContain('calculator');
    expect(reg.list()).toContain('get_weather');
  });

  it('creates a working registry — can call loaded tools', async () => {
    const reg = await fromDir(FIXTURES);
    const result = await reg.call({
      name: 'calculator',
      arguments: { a: 10, b: 5, op: 'add' },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(15);
  });

  it('validates arguments via the tool schema', async () => {
    const reg = await fromDir(FIXTURES);
    const result = await reg.call({
      name: 'calculator',
      arguments: { a: 'NaN', b: 5, op: 'add' }, // invalid — a must be number
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_INPUT');
  });

  it('throws for a non-existent directory', async () => {
    await expect(fromDir('./definitely/not/there')).rejects.toThrow();
  });
});
