import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ToolRegistry } from './registry.js';
import { tool } from './tool.js';
import type { ToolDefinition, ToolManifest } from './types.js';

/**
 * Load tools from a directory of compiled JavaScript files.
 * Each file may export:
 *   - `export default tool(...)` — a single tool as the default export
 *   - `export const tools = [tool(...), ...]` — an array under the `tools` named export
 *   - `export const myTool = tool(...)` — any named export that is a ToolDefinition
 *
 * Only `.js`, `.mjs`, and `.cjs` files are scanned.
 * Files that fail to import are skipped with a warning.
 */
export async function fromDir(dirPath: string): Promise<ToolRegistry> {
  const absPath = resolve(dirPath);

  let files: string[];
  try {
    files = await readdir(absPath);
  } catch (err) {
    throw new Error(
      `tool-validate: Cannot read directory "${absPath}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const toolFiles = files.filter((f) => /\.(js|mjs|cjs)$/.test(f));
  const discovered: ToolDefinition[] = [];

  for (const file of toolFiles) {
    const fileUrl = pathToFileURL(join(absPath, file)).href;
    try {
      const mod = (await import(fileUrl)) as Record<string, unknown>;
      discovered.push(...extractTools(mod));
    } catch (err) {
      console.warn(
        `tool-validate: Skipping "${file}" (failed to import):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return new ToolRegistry(discovered);
}

/**
 * Load tools from a remote JSON manifest.
 * The manifest must conform to the ToolManifest schema:
 * ```json
 * {
 *   "version": "1.0",
 *   "tools": [
 *     { "name": "...", "description": "...", "inputSchema": {...}, "endpoint": "https://..." }
 *   ]
 * }
 * ```
 * Each tool is proxied as an HTTP POST to its `endpoint`.
 */
export async function fromManifest(url: string): Promise<ToolRegistry> {
  let manifest: ToolManifest;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    manifest = (await response.json()) as ToolManifest;
  } catch (err) {
    throw new Error(
      `tool-validate: Failed to fetch manifest from "${url}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (manifest.version !== '1.0' || !Array.isArray(manifest.tools)) {
    throw new Error(
      'tool-validate: Invalid manifest. Expected { version: "1.0", tools: [...] }',
    );
  }

  // Lazy import of zod to avoid making it a static import in this module
  const { z } = await import('zod');

  const tools = manifest.tools.map((entry) =>
    tool({
      name: entry.name,
      description: entry.description,
      input: z.record(z.string(), z.unknown()),
      _jsonSchema: entry.inputSchema,
      handler: async (input) => {
        const res = await fetch(entry.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json() as Promise<unknown>;
      },
    }),
  );

  return new ToolRegistry(tools);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isToolDefinition(value: unknown): value is ToolDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)['name'] === 'string' &&
    typeof (value as Record<string, unknown>)['description'] === 'string' &&
    typeof (value as Record<string, unknown>)['handler'] === 'function'
  );
}

function extractTools(mod: Record<string, unknown>): ToolDefinition[] {
  // Priority 1: default export is a tool
  if (isToolDefinition(mod['default'])) {
    return [mod['default']];
  }

  // Priority 2: named `tools` export is an array
  if (Array.isArray(mod['tools'])) {
    const found = (mod['tools'] as unknown[]).filter(isToolDefinition);
    if (found.length > 0) return found;
  }

  // Priority 3: any named export that looks like a tool
  return Object.entries(mod)
    .filter(([key]) => key !== 'default' && key !== 'tools')
    .map(([, value]) => value)
    .filter(isToolDefinition);
}
