
import { z } from "zod"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { validatePathFormat } from "../utils/pathUtils.js"

const PathBaseSchema = z.string().min(1, "Path cannot be empty")

/**
 * Schema for absolute paths with basic validation
 */
export const AbsolutePathSchema = PathBaseSchema.refine(
    (p) => {
        try {
            validatePathFormat(p)
            return true
        } catch (error) {
            return false
        }
    },
    {
        message: "Invalid path format"
    }
)

/**
 * Schema for filesystem server configuration
 */
export const FileSystemConfigSchema = z.object({
    rootDirectory: AbsolutePathSchema,
    provider: z.enum(['batchit-internal', 'external']),
    maxPathLength: z.number().optional().default(260),
    allowedExtensions: z.array(z.string()).optional(),
    disallowedCharacters: z.instanceof(RegExp).optional()
})

/**
 * Schema for server transport configuration
 */
export const TransportConfigSchema = z.object({
    type: z.enum(['stdio', 'websocket']),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().optional(),
    options: z.record(z.unknown()).optional()
}).optional()

/**
 * Complete server configuration schema
 */
export const ServerConfigSchema = z.object({
    name: z.string(),
    serverType: z.object({
        type: z.literal('filesystem'),
        config: FileSystemConfigSchema
    }),
    transport: TransportConfigSchema
})

/**
 * Validates a path string against operation-specific rules
 */
export function validatePath(filePath: string, operation: string): string {
    const result = AbsolutePathSchema.safeParse(filePath)
    if (!result.success) {
        throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid path for ${operation}: ${result.error.errors.map(e => e.message).join(", ")}`
        )
    }
    return result.data
}

/**
 * Validates an array of paths against operation-specific rules
 */
export function validatePaths(paths: string[], operation: string): string[] {
    return paths.map(p => validatePath(p, operation))
}
