import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { resultsCache } from "./resultsCache.js";

const RESULT_REFERENCE_REGEX = /\${results\.(.*?)}/g;

/**
 * Resolves result references in operation arguments
 * Handles both direct value replacements and nested object properties
 */
export function resolveResultReferences(args: Record<string, unknown>): Record<string, unknown> {
  const resolved = { ...args };

  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string') {
      resolved[key] = resolveStringReferences(value);
    } else if (typeof value === 'object' && value !== null) {
      resolved[key] = resolveResultReferences(value as Record<string, unknown>);
    }
  }

  return resolved;
}

/**
 * Resolves result references in a string value
 */
function resolveStringReferences(value: string): unknown {
  // If already resolved (not a string), return as is
  if (typeof value !== 'string') {
    return value;
  }

  // If the value is a complete reference
  const match = value.match(/^\${results\.(.*?)}$/);
  if (match) {
    const path = match[1].split('.');
    const resultId = path[0];
    const result = resultsCache.getResult(resultId);

    if (result === undefined) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Result reference not found: ${resultId}`
      );
    }

    // Handle nested property access
    let resolved = result;
    for (let i = 1; i < path.length; i++) {
      if (typeof resolved !== 'object' || resolved === null) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Cannot access property ${path[i]} of non-object value`
        );
      }
      resolved = (resolved as any)[path[i]];
      if (resolved === undefined) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Property not found: ${path.slice(0, i + 1).join('.')}`
        );
      }
    }

    // Recursively resolve if result is another reference string
    return typeof resolved === 'string' && resolved.includes("${results.")
      ? resolveStringReferences(resolved)
      : resolved;
  }

  // Handle embedded references
  const resolved = value.replace(RESULT_REFERENCE_REGEX, (_match, reference) => {
    const path = reference.split('.');
    const resultId = path[0];
    const result = resultsCache.getResult(resultId);

    if (result === undefined) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Result reference not found: ${resultId}`
      );
    }

    // Handle nested property access
    let resolved = result;
    for (let i = 1; i < path.length; i++) {
      if (typeof resolved !== 'object' || resolved === null) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Cannot access property ${path[i]} of non-object value`
        );
      }
      resolved = (resolved as any)[path[i]];
      if (resolved === undefined) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Property not found: ${path.slice(0, i + 1).join('.')}`
        );
      }
    }

    return String(resolved);
  });

  // If resolved value is itself a reference, resolve it too
  return resolved !== value ? resolveStringReferences(resolved) : resolved;
}
