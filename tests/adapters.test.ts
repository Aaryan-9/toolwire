import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toAnthropic } from '../src/adapters/anthropic.js';
import { toGemini } from '../src/adapters/gemini.js';
import { toOpenAI } from '../src/adapters/openai.js';
import { toVercelAI } from '../src/adapters/vercel-ai.js';
import { tool } from '../src/tool.js';

const weatherTool = tool({
  name: 'get_weather',
  description: 'Get current weather for a location',
  input: z.object({
    location: z.string().describe('City name'),
    units: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  handler: async () => ({ temperature: 22, conditions: 'sunny' }),
});

const searchTool = tool({
  name: 'search_web',
  description: 'Search the web for current information',
  input: z.object({ query: z.string() }),
  handler: async () => [],
});

const tools = [weatherTool, searchTool];

// ---------------------------------------------------------------------------

describe('toOpenAI()', () => {
  it('produces one entry per tool', () => {
    expect(toOpenAI(tools)).toHaveLength(2);
  });

  it('has type "function" wrapper', () => {
    toOpenAI(tools).forEach((t) => expect(t.type).toBe('function'));
  });

  it('contains name, description, parameters', () => {
    const [first] = toOpenAI([weatherTool]);
    expect(first?.function.name).toBe('get_weather');
    expect(first?.function.description).toBe('Get current weather for a location');
    expect(first?.function.parameters).toMatchObject({ type: 'object' });
  });

  it('omits strict when not specified', () => {
    expect(toOpenAI(tools)[0]?.function.strict).toBeUndefined();
  });

  it('includes strict when specified', () => {
    toOpenAI(tools, { strict: true }).forEach((t) =>
      expect(t.function.strict).toBe(true),
    );
  });

  it('handles empty array', () => {
    expect(toOpenAI([])).toEqual([]);
  });
});

describe('toAnthropic()', () => {
  it('produces one entry per tool', () => {
    expect(toAnthropic(tools)).toHaveLength(2);
  });

  it('uses input_schema key (not parameters)', () => {
    const [first] = toAnthropic([weatherTool]);
    expect(first).toHaveProperty('input_schema');
    expect(first).not.toHaveProperty('parameters');
    expect(first?.input_schema).toMatchObject({ type: 'object' });
  });

  it('has name and description', () => {
    const [first] = toAnthropic([weatherTool]);
    expect(first?.name).toBe('get_weather');
    expect(first?.description).toBeDefined();
  });
});

describe('toGemini()', () => {
  it('wraps in functionDeclarations array', () => {
    const result = toGemini(tools);
    expect(result).toHaveProperty('functionDeclarations');
    expect(result.functionDeclarations).toHaveLength(2);
  });

  it('uses parametersJsonSchema key (not parameters)', () => {
    const [first] = toGemini([weatherTool]).functionDeclarations;
    expect(first).toHaveProperty('parametersJsonSchema');
    expect(first).not.toHaveProperty('parameters');
  });

  it('handles empty array', () => {
    expect(toGemini([]).functionDeclarations).toHaveLength(0);
  });
});

describe('toVercelAI()', () => {
  it('keys result by tool name', () => {
    const result = toVercelAI(tools);
    expect(result).toHaveProperty('get_weather');
    expect(result).toHaveProperty('search_web');
  });

  it('passes the original Zod schema as parameters', () => {
    const result = toVercelAI([weatherTool]);
    const t = result['get_weather'];
    // Zod schemas have a .parse method
    expect(typeof t?.parameters?.parse).toBe('function');
  });

  it('includes description', () => {
    const t = toVercelAI([weatherTool])['get_weather'];
    expect(t?.description).toBe('Get current weather for a location');
  });
});
