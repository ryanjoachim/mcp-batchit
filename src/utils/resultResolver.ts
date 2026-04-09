import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { resultsCache } from "./resultsCache.js"
import {
  FileSystemResult,
  ReadResult,
  WriteResult,
  UpdateResult,
  MoveResult,
  CopyResult,
} from "../types/filesystem/results.js"

const RESULT_REFERENCE_REGEX = /\$\{results\.([^}]+)}/g

/**
 * Safely access a property on an unknown result object.
 * Isolates the `any` cast to a single location rather than scattering it
 * throughout the resolver.
 */
function getProperty(obj: unknown, key: string): unknown {
  if (
    obj !== null &&
    typeof obj === "object" &&
    key in (obj as Record<string, unknown>)
  ) {
    return (obj as Record<string, unknown>)[key]
  }
  return undefined
}

/**
 * Type guard to check if a result is a FileSystemResult
 *
 * @param result The result to check
 * @returns True if the result is a FileSystemResult
 */
export function isFileSystemResult(
  result: unknown
): result is FileSystemResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "path" in result &&
    "success" in result &&
    "operation" in result &&
    typeof (result as FileSystemResult).operation === "string"
  )
}

/**
 * Type guard to check if a result is a ReadResult
 *
 * @param result The result to check
 * @returns True if the result is a ReadResult
 */
export function isReadResult(result: unknown): result is ReadResult {
  return (
    isFileSystemResult(result) &&
    (result as FileSystemResult).operation === "read"
  )
}

/**
 * Type guard to check if a result is a WriteResult
 *
 * @param result The result to check
 * @returns True if the result is a WriteResult
 */
export function isWriteResult(result: unknown): result is WriteResult {
  return (
    isFileSystemResult(result) &&
    (result as FileSystemResult).operation === "write"
  )
}

/**
 * Type guard to check if a result is an UpdateResult
 *
 * @param result The result to check
 * @returns True if the result is an UpdateResult
 */
export function isUpdateResult(result: unknown): result is UpdateResult {
  return (
    isFileSystemResult(result) &&
    (result as FileSystemResult).operation === "update"
  )
}

/**
 * Resolves result references in operation arguments
 * Handles both direct value replacements and nested object properties
 * Supports both old and new result types
 *
 * @param args The arguments to resolve references in
 * @returns The resolved arguments
 */
export function resolveResultReferences(
  args: Record<string, unknown>
): Record<string, unknown> {
  const resolved = { ...args }

  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string") {
      resolved[key] = resolveStringReferences(value)
    } else if (typeof value === "object" && value !== null) {
      resolved[key] = resolveResultReferences(value as Record<string, unknown>)
    }
  }

  return resolved
}

/**
 * Gets a specific property from a result based on its type
 *
 * @param result The result to get the property from
 * @param propertyName The name of the property to get
 * @returns The property value
 */
export function getResultProperty(
  result: unknown,
  propertyName: string
): unknown {
  if (!result) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Cannot get property ${propertyName} from undefined result`
    )
  }

  // Handle FileSystemResult types
  if (isFileSystemResult(result)) {
    // Common properties that exist on all FileSystemResult types
    if (
      propertyName === "path" ||
      propertyName === "success" ||
      propertyName === "operation"
    ) {
      return getProperty(result, propertyName)
    }

    // Handle operation-specific properties
    switch (result.operation) {
      case "read":
        if (
          propertyName === "content" ||
          propertyName === "binary" ||
          propertyName === "mimeType"
        ) {
          return (result as ReadResult)[propertyName]
        }
        break
      case "write":
        if (
          propertyName === "content" ||
          propertyName === "size" ||
          propertyName === "contentTracking"
        ) {
          return (result as WriteResult)[propertyName]
        }
        break
      case "update":
        if (propertyName === "summary" || propertyName === "contentTracking") {
          return (result as UpdateResult)[propertyName]
        }
        break
      case "move":
        if (propertyName === "destination") {
          return (result as MoveResult)[propertyName]
        }
        break
      case "copy":
        if (propertyName === "destination") {
          return (result as CopyResult)[propertyName]
        }
        break
      case "delete":
        // DeleteResult doesn't have any additional properties
        break
    }

    // If property not found, throw an error
    throw new McpError(
      ErrorCode.InvalidParams,
      `Property ${propertyName} not found on ${result.operation} result`
    )
  }

  // For other object types, try to get the property directly
  if (
    typeof result === "object" &&
    result !== null &&
    propertyName in (result as any)
  ) {
    return (result as any)[propertyName]
  }

  throw new McpError(
    ErrorCode.InvalidParams,
    `Property ${propertyName} not found on result`
  )
}

/**
 * Resolves a property path on a result object
 *
 * @param result The result object to resolve the property path on
 * @param path The property path to resolve
 * @returns The resolved property value
 */
function resolvePropertyPath(result: unknown, path: string[]): unknown {
  let resolved = result

  // Handle different result types
  if (isFileSystemResult(resolved)) {
    // For FileSystemResult types, we need to handle the operation-specific properties
    if (path.length > 1) {
      const propertyName = path[1]

      // Map common properties that might have different names in different result types
      const propertyMap: Record<string, string> = {
        content: "content",
        error: "error",
        path: "path",
        success: "success",
        size: "size",
        binary: "binary",
        mimeType: "mimeType",
        contentTracking: "contentTracking",
        destination: "destination",
      }

      // Use mapped property name if available
      const mappedProp = propertyMap[propertyName] || propertyName

      // Check if the property exists on the result
      if (!(mappedProp in resolved)) {
        // Handle operation-specific properties
        if (isReadResult(resolved) && propertyName === "content") {
          resolved = resolved.content
        } else if (isWriteResult(resolved) && propertyName === "content") {
          resolved = resolved.content
        } else if (isUpdateResult(resolved) && propertyName === "summary") {
          resolved = resolved.summary
        } else {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Property not found on ${resolved.operation} result: ${propertyName}`
          )
        }
      } else {
        resolved = getProperty(resolved, mappedProp)
      }

      // Continue with remaining path segments
      for (let i = 2; i < path.length; i++) {
        if (typeof resolved !== "object" || resolved === null) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Cannot access property ${path[i]} of non-object value`
          )
        }
        resolved = getProperty(resolved, path[i])
        if (resolved === undefined) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Property not found: ${path.slice(0, i + 1).join(".")}`
          )
        }
      }
    }
  } else {
    // For non-FileSystemResult types, use standard property access
    for (let i = 1; i < path.length; i++) {
      if (typeof resolved !== "object" || resolved === null) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Cannot access property ${path[i]} of non-object value`
        )
      }
      resolved = (resolved as any)[path[i]]
      if (resolved === undefined) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Property not found: ${path.slice(0, i + 1).join(".")}`
        )
      }
    }
  }

  return resolved
}

/**
 * Resolves result references in a string value
 *
 * @param value The string value to resolve references in
 * @returns The resolved value
 */
function resolveStringReferences(value: string): unknown {
  // If already resolved (not a string), return as is
  if (typeof value !== "string") {
    return value
  }

  // If the value is a complete reference — use [^}]+ to avoid
  // matching across closing braces in strings with multiple references
  const match = value.match(/^\$\{results\.([^}]+)}$/)
  if (match) {
    const path = match[1].split(".")
    const resultId = path[0]
    const result = resultsCache.getResult(resultId)

    if (result === undefined) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Result reference not found: ${resultId}`
      )
    }

    // Handle nested property access
    const resolved = resolvePropertyPath(result, path)

    // Recursively resolve if result is another reference string
    return typeof resolved === "string" && resolved.includes("${results.")
      ? resolveStringReferences(resolved)
      : resolved
  }

  // Handle embedded references
  const resolved = value.replace(
    RESULT_REFERENCE_REGEX,
    (_match, reference) => {
      const path = reference.split(".")
      const resultId = path[0]
      const result = resultsCache.getResult(resultId)

      if (result === undefined) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Result reference not found: ${resultId}`
        )
      }

      // Handle nested property access
      const resolved = resolvePropertyPath(result, path)
      return String(resolved)
    }
  )

  // If resolved value is itself a reference, resolve it too
  return resolved !== value ? resolveStringReferences(resolved) : resolved
}
