import { z } from "zod"
import { ServerTypeSchema } from "./serverType.js"
import { TransportConfigSchema } from "./transport.js"

/**
 * Schema for operation within a batch
 */
export const OperationSchema = z.object({
  tool: z.string().describe(`Name of the tool to execute. For file operations:
      - write_file: Create or overwrite files with optional templates
      - update_file: Modify existing files with overwrite/append/diff modes`),
  arguments: z
    .record(z.unknown())
    .default({})
    .describe(
      "Tool-specific arguments. May include 'template' property for Handlebars template support"
    ),
  id: z
    .string()
    .optional()
    .describe("Unique identifier for referencing operation results"),
  dependsOn: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("IDs of operations this one depends on"),
})

/**
 * Schema for batch execution options
 */
export const BatchOptionsSchema = z
  .object({
    maxConcurrent: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10)
      .describe("Maximum number of concurrent operations"),
    timeoutMs: z
      .number()
      .int()
      .min(100)
      .max(3600000)
      .default(30000)
      .describe("Operation timeout in milliseconds"),
    stopOnError: z.boolean().default(false).describe("Stop on first error"),
    keepAlive: z
      .boolean()
      .default(false)
      .describe("Keep connection alive after batch completion"),
    progressToken: z
      .string()
      .optional()
      .describe("Token for tracking operation progress"),
  })
  .default({
    maxConcurrent: 10,
    timeoutMs: 30000,
    stopOnError: false,
    keepAlive: false,
  })
  .describe("Batch execution options")

/**
 * Operation definition type
 */
export interface Operation {
  tool: string
  arguments: Record<string, unknown>
  id?: string
  dependsOn?: string | string[]
}

/**
 * Operation result type
 */
export interface OperationResult {
  id?: string
  tool: string
  success: boolean
  result?: unknown
  error?: string
  errorCode?: number
  durationMs?: number
}

/**
 * Schema for target server configuration
 */
export const TargetServerSchema = z
  .object({
    name: z.string().describe("Server identifier"),
    serverType: ServerTypeSchema,
    transport: TransportConfigSchema.optional().describe(
      "Transport configuration (required for external providers)"
    ),
    maxIdleTimeMs: z
      .number()
      .optional()
      .describe("Maximum idle time before connection close (ms)"),
  })
  .describe("Target server configuration")

/**
 * Schema for complete batch execution request
 */
export const BatchArgsSchema = z.object({
  targetServer: TargetServerSchema,
  operations: z
    .array(OperationSchema)
    .max(1000)
    .describe("Array of operations to execute (max 1000)"),
  options: BatchOptionsSchema,
})

export type BatchOptions = Partial<z.infer<typeof BatchOptionsSchema>>
export type TargetServer = z.infer<typeof TargetServerSchema>
export type BatchArgs = z.infer<typeof BatchArgsSchema>

/**
 * Schema shape for batch execute tool registration
 */
export const BatchExecuteToolSchema = {
  targetServer: BatchArgsSchema.shape.targetServer,
  operations: BatchArgsSchema.shape.operations,
  options: BatchArgsSchema.shape.options,
}
