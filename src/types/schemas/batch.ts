import { z } from "zod"
import { ServerTypeSchema } from "./serverType.js"
import { TransportConfigSchema } from "./transport.js"

/**
 * Schema for operation within a batch
 */
export const OperationSchema = z.object({
  tool: z.string()
    .describe("Name of the tool to execute"),
  arguments: z.record(z.unknown()).default({})
    .describe("Tool-specific arguments. May include 'template' property for Handlebars template support"),
  id: z.string().optional()
    .describe("Unique identifier for referencing operation results"),
  dependsOn: z.union([z.string(), z.array(z.string())]).optional()
    .describe("IDs of operations this one depends on")
})

/**
 * Schema for batch execution options
 */
export const BatchOptionsSchema = z.object({
  maxConcurrent: z.number().default(10)
    .describe("Maximum number of concurrent operations"),
  timeoutMs: z.number().default(30000)
    .describe("Operation timeout in milliseconds"),
  stopOnError: z.boolean().default(false)
    .describe("Stop on first error"),
  keepAlive: z.boolean().default(false)
    .describe("Keep connection alive after batch completion")
}).default({
  maxConcurrent: 10,
  timeoutMs: 30000,
  stopOnError: false,
  keepAlive: false
}).describe("Batch execution options")

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
  tool: string
  success: boolean
  result?: unknown
  error?: string
  durationMs: number
}

/**
 * Schema for target server configuration
 */
export const TargetServerSchema = z.object({
  name: z.string()
    .describe("Server identifier"),
  serverType: ServerTypeSchema,
  transport: TransportConfigSchema.optional()
    .describe("Transport configuration (required for external providers)"),
  maxIdleTimeMs: z.number().optional()
    .describe("Maximum idle time before connection close (ms)")
}).describe("Target server configuration")

/**
 * Schema for complete batch execution request
 */
export const BatchArgsSchema = z.object({
  targetServer: TargetServerSchema,
  operations: z.array(OperationSchema)
    .describe("Array of operations to execute"),
  options: BatchOptionsSchema
})

export type BatchOptions = z.infer<typeof BatchOptionsSchema>
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
