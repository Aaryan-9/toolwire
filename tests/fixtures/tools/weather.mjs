/**
 * Fixture: weather tools loaded by discovery tests.
 * Demonstrates the `export const tools = [...]` pattern.
 */

function makeSchema(validate) {
  return {
    safeParse(data) {
      const issues = validate(data);
      if (issues.length === 0) return { success: true, data };
      return { success: false, error: { issues } };
    },
  };
}

export const tools = [
  {
    name: 'get_weather',
    description: 'Get current weather for a location',
    input: makeSchema((v) => {
      const issues = [];
      if (typeof v?.location !== 'string' || v.location.length === 0) {
        issues.push({ path: ['location'], message: 'Expected non-empty string' });
      }
      return issues;
    }),
    output: undefined,
    handler: async ({ location }) => ({
      location,
      temperature: 22,
      conditions: 'sunny',
    }),
    timeout: 5000,
    retries: 0,
    annotations: { readOnly: true },
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' },
      },
      required: ['location'],
    },
    outputSchema: undefined,
  },
];
