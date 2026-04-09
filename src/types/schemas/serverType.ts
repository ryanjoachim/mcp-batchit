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
 * Schema for server type discriminated union
 */
export const ServerTypeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("filesystem").describe("Filesystem server type"),
    config: FilesystemServerConfigSchema,
  }),
])

export type ServerType = z.infer<typeof ServerTypeSchema>
