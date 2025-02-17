
import { z } from "zod"
import { validatePathFormat } from "../utils/pathUtils.js"

const PathValidationOptionsSchema = z.object({
  requireAbsolute: z.boolean().default(true),
  rootDirectory: z.string().optional(),
  maxLength: z.number().default(260),
  allowedExtensions: z.array(z.string()).optional(),
  checkSymlinks: z.boolean().default(true),
  validateMarkdown: z.boolean().default(false),
  requireHeader: z.boolean().default(false),
  cacheStats: z.boolean().default(false)
})

export const AbsolutePathSchema = z.string().min(1).refine(
  (p) => {
    try {
      validatePathFormat(p)
      return true
    } catch {
      return false
    }
  },
  { message: "Invalid path format" }
)

export const PathValidationSchema = z.object({
  path: AbsolutePathSchema,
  options: PathValidationOptionsSchema.optional()
})

export const MemoryBankPathSchema = PathValidationSchema.extend({
  options: PathValidationOptionsSchema.extend({
    validateMarkdown: z.boolean().default(true),
    requireHeader: z.boolean().default(true),
    allowedExtensions: z.array(z.string()).default(['.md'])
  })
})

export const FileSystemConfigSchema = z.object({
  rootDirectory: AbsolutePathSchema,
  provider: z.enum(["batchit-internal", "external"]),
  pathValidation: PathValidationOptionsSchema.optional()
})
