import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { PathValidationError, PathErrorType } from "../validation/pathValidationError.js"

/**
 * Wraps a function with standardized error handling
 * @param fn The function to wrap
 * @param errorPrefix A prefix for error messages
 * @returns A wrapped function with standardized error handling
 */
export async function withErrorHandling<T>(
    fn: () => Promise<T>,
    errorPrefix: string
): Promise<T> {
    try {
        return await fn()
    } catch (error) {
        if (error instanceof McpError) {
            throw error
        }

        if (error instanceof PathValidationError) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `${errorPrefix}: ${error.message}`
            )
        }

        throw new McpError(
            ErrorCode.InternalError,
            `${errorPrefix}: ${error instanceof Error ? error.message : String(error)}`
        )
    }
}

/**
 * Maps common error types to appropriate MCP error codes
 * @param error The error to map
 * @returns An MCP error with appropriate error code
 */
export function mapToMcpError(error: unknown): McpError {
    if (error instanceof McpError) {
        return error
    }

    if (error instanceof PathValidationError) {
        switch (error.subType) {
            case PathErrorType.NotAbsolute:
            case PathErrorType.InvalidFormat:
            case PathErrorType.OutsideRoot:
            case PathErrorType.SecurityViolation:
            case PathErrorType.MarkdownValidation:
            case PathErrorType.ContentStructure:
            case PathErrorType.MemoryBankOperation:
                return new McpError(ErrorCode.InvalidParams, error.message)
            default:
                return new McpError(ErrorCode.InternalError, error.message)
        }
    }

    if (error instanceof Error) {
        const isPermissionError = error.message.includes('permission denied') ||
            error.message.includes('EACCES') ||
            error.message.includes('EPERM')

        const isNotFoundError = error.message.includes('ENOENT') ||
            error.message.includes('not found') ||
            error.message.includes('no such file')

        if (isPermissionError) {
            return new McpError(ErrorCode.InvalidParams, error.message)
        }

        if (isNotFoundError) {
            return new McpError(ErrorCode.InvalidParams, error.message)
        }
    }

    return new McpError(
        ErrorCode.InternalError,
        error instanceof Error ? error.message : String(error)
    )
}

/**
 * Utility for handling validation errors in paths
 * @param filePath The path that caused the error
 * @param error The error object
 * @returns A standardized MCP error
 */
export function handlePathValidationError(filePath: string, error: unknown): McpError {
    if (error instanceof PathValidationError) {
        return new McpError(
            ErrorCode.InvalidParams,
            `Invalid path '${filePath}': ${error.message}`
        )
    }

    return mapToMcpError(error)
}
