export interface PathValidationConfig {
    rootDirectory: string
    excludedDirs?: string[]
    bypassRootCheck?: boolean
}

/**
 * Result of a single operation execution including timing, context and error details
 */
export interface OperationResult {
    /** The tool that was executed */
    tool: string
    /** Whether the operation succeeded */
    success: boolean
    /** Result data if operation succeeded */
    result?: unknown
    /** Error message if operation failed */
    error?: string
    /** Time taken to execute in milliseconds */
    durationMs: number
    /** Optional operation identifier */
    operationId?: string
    /** Operation start timestamp */
    startTime?: Date
    /** Operation completion timestamp */
    endTime?: Date
    /** Detailed error information if operation failed */
    errorDetails?: Record<string, unknown>
    /** Operation-specific context data */
    context?: Record<string, unknown>
}
