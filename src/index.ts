// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
export { tool } from './tool.js';
export { registry, ToolRegistry } from './registry.js';

// ---------------------------------------------------------------------------
// Provider adapters (standalone, tree-shakeable)
// ---------------------------------------------------------------------------
export { toOpenAI } from './adapters/openai.js';
export { toAnthropic } from './adapters/anthropic.js';
export { toGemini } from './adapters/gemini.js';
export { toVercelAI } from './adapters/vercel-ai.js';

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------
export { fromDir, fromManifest } from './discovery.js';

// ---------------------------------------------------------------------------
// Error constructors (useful for middleware authors)
// ---------------------------------------------------------------------------
export {
  makeDisabledError,
  makeExecutionError,
  makeFailure,
  makeNotFoundError,
  makeTimeoutError,
  makeValidationInputError,
  makeValidationOutputError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type {
  // Config & definition
  ToolConfig,
  ToolContext,
  ToolAnnotations,
  ToolDefinition,

  // Results
  ToolResult,
  ToolSuccess,
  ToolFailure,

  // Errors
  ToolError,
  ToolErrorCode,

  // Middleware
  Middleware,

  // Registry
  ToolCallRequest,
  RegistryOptions,

  // Provider adapter types
  OpenAITool,
  AnthropicTool,
  GeminiFunctionDeclaration,
  GeminiToolConfig,
  VercelAIToolDef,
  VercelAIToolSet,

  // Discovery
  ToolManifest,
  ToolManifestEntry,

  // Schema
  JsonSchema,

  // Type inference
  InferInput,
  InferOutput,
} from './types.js';
