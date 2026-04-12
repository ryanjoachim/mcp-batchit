import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { mapToMcpError } from "./errorMapper.js"

/**
 * Provides utilities for standardizing error messages and handling across BatchIt
 */
export class ErrorManager {
  /**
   * Formats a standardized error message for validation failures
   */
  static formatValidationError(context: string, reason: string): string {
    return `Invalid ${context}: ${reason}`
  }

  /**
   * Creates a standardized "not found" error
   */
  static createNotFoundError(type: string, identifier: string): McpError {
    return new McpError(
      ErrorCode.InvalidParams,
      `${type} not found: ${identifier}`
    )
  }

  /**
   * Creates a standardized "already exists" error
   */
  static createAlreadyExistsError(type: string, identifier: string): McpError {
    return new McpError(
      ErrorCode.InvalidParams,
      `${type} already exists: ${identifier}`
    )
  }

  /**
   * Creates a standardized "invalid format" error
   */
  static createInvalidFormatError(type: string, details: string): McpError {
    return new McpError(
      ErrorCode.InvalidParams,
      `Invalid ${type} format: ${details}`
    )
  }

  /**
   * Creates a standardized permission denied error
   */
  static createPermissionError(operation: string, target: string): McpError {
    return new McpError(
      ErrorCode.InvalidParams,
      `Permission denied: Cannot ${operation} ${target}`
    )
  }

  /**
   * Enhances an existing McpError with additional context
   */
  static enhanceError(
    error: McpError,
    additionalContext: string,
    metadata?: Record<string, unknown>
  ): McpError {
    return new McpError(
      error.code,
      `${error.message} (${additionalContext})`,
      metadata
    )
  }

  /**
   * Safely converts an unknown error to an MCP error with consistent formatting
   * while preserving existing MCP errors
   */
  static normalizeError(error: unknown, context: string): McpError {
    // If it's already an MCP error, add context if needed
    if (error instanceof McpError) {
      return context ? this.enhanceError(error, context) : error
    }

    // Try mapping known error types
    return mapToMcpError(error)
  }

  /**
   * Creates a standardized validation error for path-related issues
   */
  static createPathValidationError(path: string, reason: string): McpError {
    return new McpError(
      ErrorCode.InvalidParams,
      this.formatValidationError("path", `${path} (${reason})`)
    )
  }

  /**
   * Creates a standardized error for missing required parameters
   */
  static createMissingParamError(
    paramName: string,
    context?: string
  ): McpError {
    const message = context
      ? `Missing required parameter '${paramName}' for ${context}`
      : `Missing required parameter: ${paramName}`
    return new McpError(ErrorCode.InvalidParams, message)
  }

  /**
   * Extracts a safe error message from an unknown error value.
   * Centralizes the `error instanceof Error ? error.message : String(error)` pattern.
   */
  static getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
