
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
  file: AbsolutePathSchema.describe("The absolute path to the file to be updated."),
  mode: z.enum(["overwrite", "append", "diff", "edit"]).default("overwrite").describe("The update mode: overwrite, append, diff, or edit."),
  newContent: z
    .string()
    .optional()
    .describe("The new content to write to the file (used in overwrite and append modes).")
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
        line: z.number().positive().describe("The line number to apply the diff to."),
        operation: z.enum(["insert", "replace", "delete"]).describe("The diff operation: insert, replace, or delete."),
        text: z.string().optional().describe("The text to insert or replace (used in insert and replace operations)."),
        preserveIndent: z.boolean().default(true).describe("Whether to preserve the indentation of the line."),
      })
    )
    .optional()
    .describe("An array of diff operations to apply to the file (used in diff mode)."),
  edits: z
    .array(
      z.object({
        oldText: z.string().min(1, "Search text cannot be empty").describe("The text to search for and replace."),
        newText: z.string().describe("The text to replace the old text with."),
        matchCase: z.boolean().default(false).describe("Whether the search should be case-sensitive."),
        wholeWord: z.boolean().default(false).describe("Whether the search should match whole words only."),
      })
    )
    .optional()
    .describe("An array of search and replace edits to apply to the file (used in edit mode)."),
  validation: z
    .object({
      markdown: z.boolean().default(true).describe("Whether to validate the file content as Markdown."),
      requireHeader: z.boolean().default(true).describe("Whether to require a header in the Markdown content."),
      validateContent: z.boolean().default(true).describe("Whether to validate the content of the Markdown file."),
    })
    .default({})
    .describe("Validation options for the file content."),
})

export const MemoryBankToolSchema = BaseRequestParamsSchema.extend({
  operation: z.enum([
    "initialize",
    "verify_and_read",
    "just_read",
    "list",
    "update",
  ]).describe("The memory bank operation to perform."),
  directory: AbsolutePathSchema.describe("The absolute path to the memory bank directory."),
  files: z.array(AbsolutePathSchema).optional().describe("An array of absolute paths to specific files within the memory bank."),
  updates: z.array(MemoryBankUpdateSchema).optional().describe("An array of updates to apply to files within the memory bank."),
  options: z
    .object({
      backup: z.boolean().default(false).describe("Whether to create a backup of the file before updating it."),
      rollback: z.boolean().default(false).describe("Whether to rollback the file to the backup if the update fails."),
      atomic: z.boolean().default(false).describe("Whether to perform the update atomically."),
    })
    .optional()
    .describe("Options for the memory bank operation."),
})

// Re-export types that match the schema
export interface MemoryBankRequest extends Record<string, unknown> {
  _meta?: {
    progressToken?: string | number
  }
}

export interface MemoryBankUpdate extends z.infer<typeof MemoryBankUpdateSchema> {}
