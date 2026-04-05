# tool-validate

Framework-agnostic tool registry for LLM agents.

Define tools **once** with Zod schemas. Get input validation, structured error messages the LLM can act on, and one-line schema export to OpenAI, Anthropic, Gemini, or Vercel AI — with zero runtime dependencies.

```bash
npm install tool-validate zod
```

---

## The problem

Every team building an LLM agent writes the same three pieces of boilerplate:

1. A JSON schema for each tool
2. Validation of the LLM's arguments before calling the function
3. An error message the LLM can understand and retry

And they do it differently every time, for every framework, in every project. `tool-validate` is the standard.

---

## Quick start

```typescript
import { tool, registry } from 'tool-validate';
import { z } from 'zod';

// 1. Define a tool
const searchWeb = tool({
  name: 'search_web',
  description: 'Search the web for current information',
  input: z.object({
    query: z.string().min(1).describe('The search query'),
    maxResults: z.number().int().min(1).max(20).default(5),
  }),
  handler: async ({ query, maxResults }) => {
    return await mySearchAPI(query, maxResults);
  },
  timeout: 10_000,
  retries: 2,
});

// 2. Create a registry
const reg = registry([searchWeb, readFile, writeFile]);

// 3. Use with any LLM provider
const openaiTools = reg.toOpenAI();
const anthropicTools = reg.toAnthropic();

// 4. Execute a tool call — always resolves, never throws
const result = await reg.call(llmToolCall);

if (result.success) {
  // result.data is the validated return value
  messages.push({ role: 'tool', content: JSON.stringify(result.data) });
} else {
  // result.error.llmMessage is pre-formatted for the LLM to retry
  messages.push({ role: 'tool', content: result.error.llmMessage });
}
```

---

## Features

- **Type-safe** — Zod schemas infer TypeScript types end-to-end
- **Input + output validation** — validate arguments in, validate results out
- **LLM-readable errors** — every failure includes a `llmMessage` ready to append to messages
- **Four provider adapters** — OpenAI, Anthropic, Gemini, Vercel AI SDK
- **Middleware** — hook into beforeCall / afterCall / onError for logging, auth, caching
- **Hot-swap** — replace a tool at runtime without restarting the agent
- **Timeout + retries** — configurable per-tool, with exponential backoff
- **Runtime discovery** — load tools from a directory or remote manifest
- **Zero runtime dependencies** — only Zod (peer dep) required

---

## API

### `tool(config)`

Define a tool. Returns a frozen `ToolDefinition` with pre-computed JSON Schema.

```typescript
const myTool = tool({
  name: 'my_tool',         // 1–64 chars: letters, digits, _ or -
  description: string,     // shown to the LLM — explain when to use this tool
  input: ZodSchema,        // validates LLM arguments
  output?: ZodSchema,      // optional — validates handler return value
  handler: async (input, context) => { ... },
  timeout?: number,        // ms, default 30_000
  retries?: number,        // additional attempts on execution failure, default 0
  annotations?: {          // informational hints (not enforced)
    readOnly?: boolean,
    destructive?: boolean,
    expensive?: boolean,
    requiresConfirmation?: boolean,
  },
});
```

The `context` object passed to the handler:

```typescript
interface ToolContext {
  signal: AbortSignal; // tied to the timeout — honour this for cooperative cancellation
  attempt: number;     // 0 = first try, 1 = first retry, …
}
```

---

### `registry(tools, options?)`

Create a registry from an array of tool definitions.

```typescript
const reg = registry([searchWeb, readFile, writeFile], {
  defaultTimeout: 15_000, // fallback timeout for tools that don't set their own
});
```

---

### `reg.call(request)`

Execute a tool call from an LLM. Always resolves — **never throws**.

```typescript
const result = await reg.call({
  name: 'search_web',
  arguments: { query: 'TypeScript tips', maxResults: 5 },
});

// ToolResult is a discriminated union
if (result.success) {
  console.log(result.data);       // validated return value
  console.log(result.durationMs); // wall time in ms
} else {
  console.log(result.error.code);       // error category
  console.log(result.error.message);    // developer-readable message
  console.log(result.error.llmMessage); // ready to send back to the LLM
  console.log(result.error.retryable);  // should the LLM retry?
}
```

**Error codes:**

| Code | When | Retryable |
|------|------|-----------|
| `NOT_FOUND` | Tool name not registered | ✓ |
| `DISABLED` | Tool is currently disabled | ✗ |
| `VALIDATION_INPUT` | Arguments fail Zod schema | ✓ |
| `VALIDATION_OUTPUT` | Return value fails output schema | ✗ |
| `TIMEOUT` | Handler exceeded timeout | ✓ |
| `EXECUTION` | Handler threw (all retries exhausted) | ✗ |

---

### Provider adapters

Export tool schemas in whatever format your LLM provider expects. All adapters exclude disabled tools.

```typescript
// OpenAI function-calling
await openai.chat.completions.create({
  model: 'gpt-4o',
  tools: reg.toOpenAI(),
  // or with strict mode:
  tools: reg.toOpenAI({ strict: true }),
  messages,
});

// Anthropic tool-use
await anthropic.messages.create({
  model: 'claude-opus-4-6',
  tools: reg.toAnthropic(),  // uses input_schema key
  messages,
});

// Google Gemini
await model.generateContent({
  tools: [reg.toGemini()],   // wraps in functionDeclarations
  contents,
});

// Vercel AI SDK
const { text } = await generateText({
  model: openai('gpt-4o'),
  tools: reg.toVercelAI(),   // passes Zod schemas directly
  prompt,
});
```

Standalone adapter functions are also exported for use outside a registry:

```typescript
import { toOpenAI, toAnthropic, toGemini, toVercelAI } from 'tool-validate';

const schemas = toOpenAI([searchWeb, readFile]);
```

---

### Middleware

Add hooks for logging, authentication, caching, or tracing.

```typescript
reg.use({
  name: 'logger', // optional — used in error messages

  // Runs before execution, in registration order
  // Return a value to transform the arguments, or void to keep them
  beforeCall: (toolName, args) => {
    console.log(`→ ${toolName}`, args);
  },

  // Runs after success, in reverse registration order
  // Return a ToolSuccess to transform the result, or void to keep it
  afterCall: (toolName, args, result) => {
    console.log(`← ${toolName} (${result.durationMs}ms)`);
    tracer.record(toolName, result.data);
  },

  // Runs on any failure
  // Return a ToolResult to recover from the error, or void to propagate it
  onError: (toolName, args, failure) => {
    alerting.send(toolName, failure.error);
    // return a ToolResult here to recover, or return nothing to propagate
  },
});
```

Multiple middleware are chained — `beforeCall` runs in order, `afterCall` in reverse (stack-style):

```typescript
reg
  .use({ name: 'auth', beforeCall: checkAuth })
  .use({ name: 'cache', beforeCall: checkCache, afterCall: writeCache })
  .use({ name: 'metrics', afterCall: recordMetrics });
```

---

### Hot-swapping tools

Replace a registered tool in-place without restarting the agent:

```typescript
// Start with the live implementation
const reg = registry([searchWeb]);

// Mid-run: swap to a cached version
reg.swap('search_web', cachedSearchWeb);

// Disable a tool temporarily (returns DISABLED error if called)
reg.disable('send_email');
reg.enable('send_email');

// Add new tools at any time
reg.register(newTool);
```

---

### `reg.describe()`

Generate a human-readable tool list for injecting into a system prompt:

```typescript
const systemPrompt = `You have access to the following tools:\n${reg.describe()}`;
// → "- search_web: Search the web for current information"
//   "- calculate: Evaluate a mathematical expression"
```

---

### `ToolRegistry.fromDir(path)`

Load tools from a directory of compiled JavaScript files:

```typescript
const reg = await ToolRegistry.fromDir('./tools/');
```

Each file may export:

```javascript
// Option A: default export
export default tool({ name: 'my_tool', ... });

// Option B: named `tools` array
export const tools = [tool({ ... }), tool({ ... })];

// Option C: any named export that is a ToolDefinition
export const myTool = tool({ ... });
```

Only `.js`, `.mjs`, and `.cjs` files are scanned. Files that fail to import are skipped with a warning.

---

### `ToolRegistry.fromManifest(url)`

Load tools from a remote JSON manifest and proxy calls over HTTP:

```typescript
const reg = await ToolRegistry.fromManifest('https://tools.mycompany.com/manifest.json');
```

Manifest format:

```json
{
  "version": "1.0",
  "tools": [
    {
      "name": "search_web",
      "description": "Search the web",
      "inputSchema": { "type": "object", "properties": { ... } },
      "endpoint": "https://api.mycompany.com/tools/search"
    }
  ]
}
```

---

## TypeScript

`tool()` infers input and output types from your Zod schemas — no explicit generics needed:

```typescript
const greet = tool({
  name: 'greet',
  description: 'Greet someone',
  input: z.object({ name: z.string() }),
  output: z.object({ message: z.string() }),
  handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
  //                ^^^^ typed as { name: string }
  //                                              ^^^^ typed as { message: string }
});
```

Use the inference helpers to extract types from definitions:

```typescript
import type { InferInput, InferOutput } from 'tool-validate';

type GreetInput = InferInput<typeof greet>;   // { name: string }
type GreetOutput = InferOutput<typeof greet>; // { message: string }
```

---

## Provider format reference

| Field | OpenAI | Anthropic | Gemini | Vercel AI |
|-------|--------|-----------|--------|-----------|
| Schema key | `parameters` | `input_schema` | `parametersJsonSchema` | Zod schema |
| Wrapper | `{ type: "function", function: {...} }` | direct object | `{ functionDeclarations: [...] }` | Record by name |
| Strict mode | `strict?: boolean` | — | — | — |

---

## Zod v3 support

Zod v4 (the default) has built-in JSON Schema generation. For Zod v3 support, install the optional peer:

```bash
npm install zod-to-json-schema
```

`tool-validate` detects the Zod version automatically and uses the right conversion path.

---

## Complete agent loop example

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { registry, tool } from 'tool-validate';
import { z } from 'zod';

const searchTool = tool({
  name: 'search_web',
  description: 'Search the web for current information',
  input: z.object({ query: z.string().min(1) }),
  handler: async ({ query }) => ({ results: await mySearch(query) }),
});

const reg = registry([searchTool]).use({
  beforeCall: (name, args) => console.log(`→ ${name}`, args),
  afterCall: (name, _, r) => console.log(`← ${name} ${r.durationMs}ms`),
});

const client = new Anthropic();
const messages: Anthropic.MessageParam[] = [
  { role: 'user', content: 'What are the latest TypeScript features?' },
];

while (true) {
  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    tools: reg.toAnthropic(),
    messages,
  });

  messages.push({ role: 'assistant', content: response.content });

  if (response.stop_reason === 'end_turn') break;

  // Process tool calls
  const toolResults: Anthropic.ToolResultBlockParam[] = [];
  for (const block of response.content) {
    if (block.type !== 'tool_use') continue;

    const result = await reg.call({ name: block.name, arguments: block.input });

    toolResults.push({
      type: 'tool_result',
      tool_use_id: block.id,
      content: result.success
        ? JSON.stringify(result.data)
        : result.error.llmMessage,
      is_error: !result.success,
    });
  }

  messages.push({ role: 'user', content: toolResults });
}
```

---

## License

MIT
