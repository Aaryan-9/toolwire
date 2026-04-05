import { createRequire } from 'node:module';
import * as zodNs from 'zod';
import type { ZodType } from 'zod';
import type { JsonSchema } from './types.js';

const _require = createRequire(import.meta.url);

const cache = new WeakMap<ZodType, JsonSchema>();

/**
 * Convert a Zod schema to JSON Schema (Draft 7 compatible).
 * Supports Zod v4 natively; Zod v3 requires the `zod-to-json-schema` package.
 * Results are cached per schema instance.
 */
export function resolveJsonSchema(schema: ZodType): JsonSchema {
  const hit = cache.get(schema);
  if (hit !== undefined) return hit;
  const result = compute(schema);
  cache.set(schema, result);
  return result;
}

function compute(schema: ZodType): JsonSchema {
  // Zod v4 exports `toJsonSchema` as a named function on the module namespace
  // Zod v4 exports `toJSONSchema` (note capital JSON)
  const toJSONSchemaV4 = (zodNs as Record<string, unknown>)['toJSONSchema'] as
    | ((s: ZodType) => Record<string, unknown>)
    | undefined;

  if (typeof toJSONSchemaV4 === 'function') {
    const { $schema: _$schema, ...clean } = toJSONSchemaV4(schema);
    return clean as JsonSchema;
  }

  // Zod v3 fallback — requires the optional `zod-to-json-schema` peer
  try {
    const pkg = _require('zod-to-json-schema') as {
      zodToJsonSchema: (
        s: ZodType,
        opts?: Record<string, unknown>,
      ) => Record<string, unknown>;
    };
    const { $schema: _$schema, ...clean } = pkg.zodToJsonSchema(schema, {
      $refStrategy: 'none',
    });
    return clean as JsonSchema;
  } catch {
    throw new Error(
      'tool-validator: Cannot convert Zod schema to JSON Schema.\n' +
        '  • Zod v4: ensure zod@^4.0.0 is installed.\n' +
        '  • Zod v3: run `npm install zod-to-json-schema`.\n' +
        '  • Or supply a pre-computed schema via the `_jsonSchema` option in tool().',
    );
  }
}
