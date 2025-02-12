import { z } from "zod"
import { AbsolutePathSchema } from "./paths.js"

export interface MemoryBankRequest extends Record<string, unknown> {
  _meta?: {
    progressToken?: string | number;
  };
}

const BaseRequestParamsSchema = z.object({
    _meta: z.optional(
        z.object({
            progressToken: z.optional(z.union([z.string(), z.number().int()]))
        }).passthrough()
    )
}).passthrough()

export interface MemoryBankUpdate extends Record<string, unknown> {
  file: string;
  mode: "overwrite" | "append" | "diff" | "edit";
  newContent?: string;
  diff?: Array<{
    line: number;
    operation: "insert" | "replace" | "delete";
    text?: string;
    preserveIndent?: boolean;
  }>;
  edits?: Array<{
    oldText: string;
    newText: string;
    matchCase?: boolean;
    wholeWord?: boolean;
  }>;
  validation?: {
    markdown?: boolean;
    requireHeader?: boolean;
    validateContent?: boolean;
  };
}

const markdownContentValidator = z.string().refine(
    (content) => {
        if (!content.trim().startsWith("#")) return false
        if (!content.includes("\n\n")) return false
        return true
    },
    {
        message: "Memory Bank files must start with a heading and contain at least one content section"
    }
)

export const MemoryBankUpdateSchema = z.object({
    file: AbsolutePathSchema,
    mode: z.enum(["overwrite", "append", "diff", "edit"]).default("overwrite"),
    newContent: z.string()
        .optional()
        .refine(
            (content) => {
                if (!content) return true
                return markdownContentValidator.safeParse(content).success
            },
            { message: "Invalid markdown content structure" }
        ),
    diff: z.array(
        z.object({
            line: z.number().positive(),
            operation: z.enum(["insert", "replace", "delete"]),
            text: z.string().optional(),
            preserveIndent: z.boolean().default(true)
        })
    ).optional(),
    edits: z.array(
        z.object({
            oldText: z.string().min(1, "Search text cannot be empty"),
            newText: z.string(),
            matchCase: z.boolean().default(false),
            wholeWord: z.boolean().default(false)
        })
    ).optional(),
    validation: z
        .object({
            markdown: z.boolean().default(true),
            requireHeader: z.boolean().default(true),
            validateContent: z.boolean().default(true)
        })
        .default({})
})

export const MemoryBankToolSchema = BaseRequestParamsSchema.extend({
    operation: z.enum([
        "initialize",
        "verify_and_read",
        "just_read",
        "list",
        "update"
    ]),
    directory: AbsolutePathSchema,
    options: z.object({
        backup: z.boolean().default(false),
        rollback: z.boolean().default(false),
        atomic: z.boolean().default(false)
    }).optional(),
    files: z.array(AbsolutePathSchema).optional(),
    updates: z.array(MemoryBankUpdateSchema).optional()
})
