
import { validatePath, type PathValidationOptions } from "../../utils/pathUtils.js"
import type { PathValidationConfig } from "../../types/config.js"
import type { MemoryBankConfig, MemoryBankResult, MemoryBankUpdate } from "../types/memory-bank.types.js"
import { readFileOp, writeFileOp, createDirectoryOp, listDirectoryOp, directoryTreeOp, editFileOp } from "../../batchit-filesystem/index.js"
import * as path from "path"
import { MemoryBankValidationError } from "../errors/memory-bank-error.js"

const REQUIRED_MEMORY_BANK_FILES = [
  "/productContext.md",
  "/activeContext.md",
  "/systemPatterns.md",
  "/techContext.md",
  "/progress.md"
]

export class MemoryBankService {
  constructor(private config?: MemoryBankConfig) { }

  private async validateMemoryBankPath(
    filePath: string,
    validation: PathValidationConfig,
    isTemplate: boolean = false
  ) {
    const options: PathValidationOptions = {
      requireAbsolute: true,
      rootDirectory: validation.rootDirectory,
      checkSymlinks: true,
      validateMarkdown: true,
      requireHeader: true,
      allowedExtensions: ['.md'],
      cacheStats: true,
      bypassRootCheck: isTemplate
    }

    return validatePath(filePath, options)
  }

  private async processTemplate(
    templateFile: string,
    validation: PathValidationConfig
  ): Promise<string> {
    const basename = path.basename(templateFile)

    if (this.config?.templates?.[basename]) {
      return this.config.templates[basename].replace(
        /\$\{new Date\(\)\.toISOString\(\)\}/g,
        new Date().toISOString()
      )
    }

    // Use the validation config's rootDirectory instead of process.cwd()
    const templatePath = path.resolve(validation.rootDirectory, "src", "templates", basename)
    try {
      const validatedPath = await this.validateMemoryBankPath(templatePath, validation, true)
      // Create template validation config
      const templateValidation = {
        ...validation,
        bypassRootCheck: true
      }
      const content = await readFileOp(validatedPath.normalized, templateValidation)
      return content.replace(
        /\$\{new Date\(\)\.toISOString\(\)\}/g,
        new Date().toISOString()
      )
    } catch (error) {
      // Log a non-exiting but clear error for template processing failures
      console.error(`Template processing error for ${basename} at path ${templatePath}: ${error instanceof Error ? error.message : String(error)}`)

      return [
        `# ${path.basename(basename, ".md")}`,
        "",
        "> NOTE: This is a default template. The original template file could not be loaded.",
        "",
        "## Overview",
        "",
        "[Add content here]",
        "",
        `Last Updated: ${new Date().toISOString()}`,
        "Version: 1.0",
        ""
      ].join("\n")
    }
  }

  async initialize(
    directory: string,
    validation: PathValidationConfig
  ): Promise<MemoryBankResult> {
    const validatedDir = await this.validateMemoryBankPath(directory, validation)

    try {
      await listDirectoryOp(validatedDir.normalized, validation)
    } catch {
      await createDirectoryOp([validatedDir.normalized], validation)
    }

    for (const rf of REQUIRED_MEMORY_BANK_FILES) {
      const filePath = path.join(validatedDir.normalized, rf.slice(1))
      const validatedPath = await this.validateMemoryBankPath(filePath, validation)

      try {
        await readFileOp(validatedPath.normalized, validation)
      } catch {
        const content = await this.processTemplate(rf, validation)
        await writeFileOp(validatedPath.normalized, content, validation)
      }
    }

    return {
      message: "Memory bank initialized with templates. Required files exist.",
      directory: validatedDir.normalized
    }
  }

  async verifyAndRead(
    directory: string,
    files: string[] | undefined,
    validation: PathValidationConfig
  ): Promise<MemoryBankResult> {
    const validatedDir = await this.validateMemoryBankPath(directory, validation)

    try {
      await listDirectoryOp(validatedDir.normalized, validation)
    } catch {
      await createDirectoryOp([validatedDir.normalized], validation)
    }

    const toRead = files ?? REQUIRED_MEMORY_BANK_FILES.map(f =>
      path.join(validatedDir.normalized, f.slice(1))
    )
    const results: Record<string, string> = {}

    for (const f of toRead) {
      const validatedPath = await this.validateMemoryBankPath(f, validation)
      try {
        results[f] = await readFileOp(validatedPath.normalized, validation)
      } catch {
        if (files) {
          const content = await this.processTemplate(path.basename(f), validation)
          await writeFileOp(validatedPath.normalized, content, validation)
          results[f] = content
        } else {
          throw new MemoryBankValidationError(`File "${f}" not found`)
        }
      }
    }

    return {
      message: "verify_and_read success",
      directory: validatedDir.normalized,
      filesRead: Object.keys(results),
      data: results
    }
  }

  async justRead(
    directory: string,
    files: string[] | undefined,
    validation: PathValidationConfig
  ): Promise<MemoryBankResult> {
    const validatedDir = await this.validateMemoryBankPath(directory, validation)
    const toRead = files ?? REQUIRED_MEMORY_BANK_FILES.map(f =>
      path.join(validatedDir.normalized, f.slice(1))
    )
    const results: Record<string, string> = {}

    for (const f of toRead) {
      const validatedPath = await this.validateMemoryBankPath(f, validation)
      try {
        results[f] = await readFileOp(validatedPath.normalized, validation)
      } catch {
        throw new MemoryBankValidationError(`File "${f}" not found in 'just_read' mode.`)
      }
    }

    return {
      message: "just_read success",
      directory: validatedDir.normalized,
      filesRead: Object.keys(results),
      data: results
    }
  }

  async list(
    directory: string,
    validation: PathValidationConfig
  ): Promise<MemoryBankResult> {
    const validatedDir = await this.validateMemoryBankPath(directory, validation)

    try {
      await listDirectoryOp(validatedDir.normalized, validation)
    } catch {
      throw new MemoryBankValidationError(`Directory "${directory}" does not exist.`)
    }

    const treeJson = await directoryTreeOp(validatedDir.normalized, validation)
    const tree = JSON.parse(treeJson)

    return {
      message: "Memory Bank directory tree",
      directory: validatedDir.normalized,
      data: tree
    }
  }

  async update(
    directory: string,
    updates: MemoryBankUpdate[],
    validation: PathValidationConfig
  ): Promise<MemoryBankResult> {
    const validatedDir = await this.validateMemoryBankPath(directory, validation)
    const results: string[] = []

    for (const upd of updates) {
      const validatedPath = await this.validateMemoryBankPath(upd.file, validation)
      let existing = ""
      try {
        existing = await readFileOp(validatedPath.normalized, validation)
      } catch {
        await writeFileOp(validatedPath.normalized, existing, validation)
      }

      switch (upd.mode) {
        case "overwrite": {
          if (!upd.newContent) {
            throw new MemoryBankValidationError(`overwrite mode requires newContent for file '${upd.file}'`)
          }
          await writeFileOp(validatedPath.normalized, upd.newContent, validation)
          results.push(`Overwrote '${upd.file}'`)
          break
        }
        case "append": {
          if (!upd.newContent) {
            throw new MemoryBankValidationError(`append mode requires newContent for file '${upd.file}'`)
          }
          const appended = existing + "\n" + upd.newContent
          await writeFileOp(validatedPath.normalized, appended, validation)
          results.push(`Appended to '${upd.file}'`)
          break
        }
        case "diff": {
          if (!upd.diff) {
            throw new MemoryBankValidationError(`diff mode requires 'diff' array for '${upd.file}'`)
          }
          const finalContent = this.applyLineDiff(existing, upd.diff)
          await writeFileOp(validatedPath.normalized, finalContent, validation)
          results.push(`Applied line-based diff to '${upd.file}'`)
          break
        }
        case "edit": {
          if (!upd.edits?.length) {
            throw new MemoryBankValidationError(`edit mode requires 'edits' for '${upd.file}'`)
          }
          const diffOutput = await editFileOp(validatedPath.normalized, upd.edits, false, validation)
          results.push(`Partial search/replace on '${upd.file}'. Diff:\n${diffOutput}`)
          break
        }
      }
    }

    return {
      message: "Update completed",
      directory: validatedDir.normalized,
      results
    }
  }

  private applyLineDiff(
    existingContent: string,
    ops: Array<{
      line: number
      operation: "insert" | "replace" | "delete"
      text?: string
    }>
  ): string {
    const lines = existingContent.split("\n")
    ops.sort((a, b) => a.line - b.line)

    let offset = 0
    for (const o of ops) {
      const idx = o.line - 1 + offset
      switch (o.operation) {
        case "insert":
          if (!o.text) continue
          if (idx < 0) {
            lines.unshift(o.text)
            offset++
          } else if (idx >= lines.length) {
            lines.push(o.text)
            offset++
          } else {
            lines.splice(idx + 1, 0, o.text)
            offset++
          }
          break
        case "replace":
          if (!o.text) continue
          if (idx < 0 || idx >= lines.length) continue
          lines[idx] = o.text
          break
        case "delete":
          if (idx < 0 || idx >= lines.length) continue
          lines.splice(idx, 1)
          offset--
          break
      }
    }

    return lines.join("\n")
  }
}
