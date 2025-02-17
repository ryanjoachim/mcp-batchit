
import { z } from "zod"
import { AbsolutePathSchema } from "./paths.js"
// import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { validateMarkdownContent } from "../mem-bank/utils/validation.js"

const BaseRequestParamsSchema = z
  .object({
    _meta: z.optional(
      z
        .object({
          progressToken: z.optional(z.union([z.string(), z.number().int()])),
        })
        .passthrough()
    ),
  })
  .passthrough()

export const MemoryBankUpdateSchema = z.object({
  file: AbsolutePathSchema,
  mode: z.enum(["overwrite", "append", "diff", "edit"]).default("overwrite"),
  newContent: z
    .string()
    .optional()
    .refine(
      (content) => {
        if (!content) return true
        try {
          validateMarkdownContent(content)
          return true
        } catch (error) {
          return false
        }
      },
      { message: "Invalid markdown content structure" }
    ),
  diff: z
    .array(
      z.object({
        line: z.number().positive(),
        operation: z.enum(["insert", "replace", "delete"]),
        text: z.string().optional(),
        preserveIndent: z.boolean().default(true),
      })
    )
    .optional(),
  edits: z
    .array(
      z.object({
        oldText: z.string().min(1, "Search text cannot be empty"),
        newText: z.string(),
        matchCase: z.boolean().default(false),
        wholeWord: z.boolean().default(false),
      })
    )
    .optional(),
  validation: z
    .object({
      markdown: z.boolean().default(true),
      requireHeader: z.boolean().default(true),
      validateContent: z.boolean().default(true),
    })
    .default({}),
})

export const MemoryBankToolSchema = BaseRequestParamsSchema.extend({
  operation: z.enum([
    "initialize",
    "verify_and_read",
    "just_read",
    "list",
    "update",
  ]),
  directory: AbsolutePathSchema,
  files: z.array(AbsolutePathSchema).optional(),
  updates: z.array(MemoryBankUpdateSchema).optional(),
  options: z
    .object({
      backup: z.boolean().default(false),
      rollback: z.boolean().default(false),
      atomic: z.boolean().default(false),
    })
    .optional(),
})

// Re-export types that match the schema
export interface MemoryBankRequest extends Record<string, unknown> {
  _meta?: {
    progressToken?: string | number
  }
}

export interface MemoryBankUpdate extends z.infer<typeof MemoryBankUpdateSchema> {}
