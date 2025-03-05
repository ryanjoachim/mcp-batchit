import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { OperationResult } from '../types/config.js'

// Standard metadata fields included in all responses
interface ResponseMetadata {
  timestamp: string
  duration: number
  operationName: string
  context?: Record<string, unknown>
}

/**
 * Creates standardized response metadata
 * @param operationName Name of the operation being performed
 * @param startTime Operation start time in milliseconds
 * @param context Optional context data
 */
function createResponseMetadata(
  operationName: string,
  startTime: number,
  context?: Record<string, unknown>
): ResponseMetadata {
  return {
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    operationName,
    context
  }
}

/**
 * Creates a standardized success response format with metadata
 * @param result The result data to include in the response
 * @param operationName Name of the operation being performed
 * @param startTime Operation start time in milliseconds
 * @param context Optional context data
 * @returns Formatted MCP response object with metadata
 */
export function formatSuccessResponse(
  result: unknown,
  operationName: string,
  startTime: number,
  context?: Record<string, unknown>
) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        status: "success",
        metadata: createResponseMetadata(operationName, startTime, context),
        result
      }, null, 2)
    }]
  }
}

/**
 * Creates a standardized error response format with enhanced context
 * @param error The error object or message
 * @param operationName Name of the operation that failed
 * @param startTime Operation start time in milliseconds
 * @param context Optional context data
 * @returns Formatted MCP error response object with metadata
 */
export function formatErrorResponse(
  error: unknown,
  operationName: string,
  startTime: number,
  context?: Record<string, unknown>
) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorType = error instanceof McpError ? error.code : ErrorCode.InternalError
  const stackTrace = error instanceof Error ? error.stack : undefined

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        status: "error",
        metadata: createResponseMetadata(operationName, startTime, context),
        error: {
          code: errorType,
          message: errorMessage,
          stack: stackTrace
        }
      }, null, 2)
    }],
    isError: true
  }
}

/**
 * Creates a formatted batch execution summary with enhanced metadata
 * @param results Array of operation results from batch execution
 * @param serverName The name of the server that executed the operations
 * @param startTime Batch operation start time in milliseconds
 * @param context Optional context data
 * @returns Formatted MCP response object with detailed metadata
 */
export function formatBatchResults(
  results: OperationResult[],
  serverName: string,
  startTime: number,
  context?: Record<string, unknown>
) {
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0)

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        status: "batch_complete",
        metadata: createResponseMetadata("batch_execute", startTime, {
          serverName,
          operationCount: results.length,
          ...context
        }),
        summary: {
          successCount: successful.length,
          failCount: failed.length,
          totalDurationMs: totalDuration,
          averageDurationMs: Math.round(totalDuration / results.length),
          successRate: `${Math.round((successful.length / results.length) * 100)}%`
        },
        operations: results.map(r => ({
          id: r.operationId || '',
          tool: r.tool,
          status: r.success ? 'success' : 'error',
          duration: `${r.durationMs}ms`,
          startedAt: r.startTime?.toISOString(),
          completedAt: r.endTime?.toISOString(),
          result: r.success ? r.result : {
            error: r.error,
            details: r.errorDetails
          },
          context: r.context
        }))
      }, null, 2)
    }]
  }
}

/**
 * Creates a standardized response for memory bank operations with enhanced metadata
 * @param result Memory bank operation result
 * @param operation The memory bank operation being performed
 * @param startTime Operation start time in milliseconds
 * @param context Optional context data about the memory bank operation
 * @returns Formatted MCP response with memory bank specific metadata
 */
export function formatMemoryBankResponse(
  result: unknown,
  operation: string,
  startTime: number,
  context?: Record<string, unknown>
) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        status: "memory_bank_complete",
        metadata: createResponseMetadata(`memory_bank_${operation}`, startTime, {
          operation,
          memoryBankVersion: "1.0",
          ...context
        }),
        result
      }, null, 2)
    }]
  }
}
