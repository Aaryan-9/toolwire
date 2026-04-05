/**
 * Fixture: calculator tool loaded by discovery tests.
 * Pure JS — no TypeScript imports needed.
 */

/** Minimal Zod-compatible schema shim for the fixture */
function makeSchema(validate) {
  return {
    safeParse(data) {
      const issues = validate(data);
      if (issues.length === 0) return { success: true, data };
      return { success: false, error: { issues } };
    },
  };
}

const inputSchema = makeSchema((v) => {
  const issues = [];
  if (typeof v !== 'object' || v === null) {
    issues.push({ path: [], message: 'Expected object' });
    return issues;
  }
  if (typeof v.a !== 'number') issues.push({ path: ['a'], message: 'Expected number' });
  if (typeof v.b !== 'number') issues.push({ path: ['b'], message: 'Expected number' });
  if (!['add', 'sub', 'mul', 'div'].includes(v.op)) {
    issues.push({ path: ['op'], message: 'Expected "add" | "sub" | "mul" | "div"' });
  }
  return issues;
});

export default {
  name: 'calculator',
  description: 'Perform basic arithmetic operations',
  input: inputSchema,
  output: undefined,
  handler: async ({ a, b, op }) => {
    if (op === 'add') return a + b;
    if (op === 'sub') return a - b;
    if (op === 'mul') return a * b;
    if (op === 'div') {
      if (b === 0) throw new Error('Division by zero');
      return a / b;
    }
    throw new Error(`Unknown op: ${op}`);
  },
  timeout: 5000,
  retries: 0,
  annotations: {},
  inputSchema: {
    type: 'object',
    properties: {
      a: { type: 'number' },
      b: { type: 'number' },
      op: { type: 'string', enum: ['add', 'sub', 'mul', 'div'] },
    },
    required: ['a', 'b', 'op'],
  },
  outputSchema: undefined,
};
