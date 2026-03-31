import { z } from "zod"

/**
 * Schema for filesystem server configuration
 */
export const FilesystemServerConfigSchema = z.object({
  rootDirectory: z
    .string()
    .describe("Base directory for all filesystem operations"),
  permissions: z
    .string()
    .optional()
    .describe("Permissions for filesystem access"),
  watchMode: z
    .boolean()
    .optional()
    .describe("Enable watch mode for file changes"),
  provider: z
    .enum(["batchit-internal", "external"])
    .default("external")
    .describe("Provider type - internal or external filesystem"),
})

/**
 * Schema for database server configuration
 */
export const DatabaseServerConfigSchema = z.object({
  database: z.string().describe("Database connection string"),
  readOnly: z.boolean().optional().describe("Read-only mode"),
  poolSize: z.number().optional().describe("Connection pool size"),
})

/**
 * Schema for generic server configuration
 */
export const GenericServerConfigSchema = z
  .record(z.unknown())
  .describe("Generic server configuration")

/**
 * Schema for server type discriminated union
 */
export const ServerTypeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("filesystem").describe("Filesystem server type"),
    config: FilesystemServerConfigSchema,
  }),
  z.object({
    type: z.literal("database").describe("Database server type"),
    config: DatabaseServerConfigSchema,
  }),
  z.object({
    type: z.literal("generic").describe("Generic server type"),
    config: GenericServerConfigSchema,
  }),
])

export type ServerType = z.infer<typeof ServerTypeSchema>
