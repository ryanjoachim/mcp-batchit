/**
 * Tests for the new filesystem type system
 *
 * This file tests:
 * 1. Type compatibility between old and new types
 * 2. Type conversions between old and new types
 * 3. Edge cases in type handling
 */

import { describe, it, expect } from "@jest/globals"

// Import new type system
import { PathOptions, PathValidationResult } from "../paths.js"
import {
  ReadOperation,
  WriteOperation,
  UpdateOperation,
  MoveOperation,
  CopyOperation,
  DeleteOperation,
  FileSystemOperation,
  DiffOperation,
} from "../operations.js"
import {
  ReadResult,
  WriteResult,
  UpdateResult,
  FileSystemResult,
} from "../results.js"
import { FileInfo, DirectoryInfo, FSEntryInfo } from "../fileInfo.js"
import {
  ContentTrackingOptions,
  ContentModification,
} from "../contentTracking.js"

// Import old type system
import {
  Operation,
  OperationResult,
  ContentModification as OldContentModification,
  ContentTrackingOptions as OldContentTrackingOptions,
} from "../../operations.js"

describe("Type Compatibility Tests", () => {
  describe("Path Types", () => {
    it("should create valid PathOptions", () => {
      const pathOptions: PathOptions = {
        rootDirectory: "/root",
        excludedDirs: ["/root/node_modules"],
        allowRelative: false,
      }

      expect(pathOptions.rootDirectory).toBe("/root")
      expect(pathOptions.excludedDirs).toContain("/root/node_modules")
      expect(pathOptions.allowRelative).toBe(false)
    })

    it("should create valid PathValidationResult", () => {
      const result: PathValidationResult = {
        normalizedPath: "/root/file.txt",
        isDirectory: false,
        isWithinRoot: true,
      }

      expect(result.normalizedPath).toBe("/root/file.txt")
      expect(result.isDirectory).toBe(false)
      expect(result.isWithinRoot).toBe(true)
    })
  })

  describe("Operation Types", () => {
    it("should create valid ReadOperation", () => {
      const op: ReadOperation = {
        operation: "read",
        path: "/root/file.txt",
        encoding: "utf8",
        startLine: 1,
        endLine: 10,
      }

      expect(op.operation).toBe("read")
      expect(op.path).toBe("/root/file.txt")
      expect(op.encoding).toBe("utf8")
      expect(op.startLine).toBe(1)
      expect(op.endLine).toBe(10)
    })

    it("should create valid WriteOperation", () => {
      const op: WriteOperation = {
        operation: "write",
        path: "/root/file.txt",
        content: "Hello, world!",
        tracking: {
          enabled: true,
          trackDiff: true,
        },
        template: "template-name",
      }

      expect(op.operation).toBe("write")
      expect(op.path).toBe("/root/file.txt")
      expect(op.content).toBe("Hello, world!")
      expect(op.tracking?.enabled).toBe(true)
      expect(op.tracking?.trackDiff).toBe(true)
      expect(op.template).toBe("template-name")
    })

    it("should create valid UpdateOperation with diff mode", () => {
      const diffOp: DiffOperation = {
        line: 5,
        operation: "replace",
        text: "New text",
      }

      const op: UpdateOperation = {
        operation: "update",
        path: "/root/file.txt",
        mode: "diff",
        diff: [diffOp],
        tracking: {
          enabled: true,
          trackDiff: true,
        },
      }

      expect(op.operation).toBe("update")
      expect(op.path).toBe("/root/file.txt")
      expect(op.mode).toBe("diff")
      expect(op.diff?.[0].line).toBe(5)
      expect(op.diff?.[0].operation).toBe("replace")
      expect(op.diff?.[0].text).toBe("New text")
    })

    it("should create valid MoveOperation", () => {
      const op: MoveOperation = {
        operation: "move",
        path: "/root/source.txt",
        destination: "/root/dest.txt",
        overwrite: true,
      }

      expect(op.operation).toBe("move")
      expect(op.path).toBe("/root/source.txt")
      expect(op.destination).toBe("/root/dest.txt")
      expect(op.overwrite).toBe(true)
    })

    it("should create valid CopyOperation", () => {
      const op: CopyOperation = {
        operation: "copy",
        path: "/root/source.txt",
        destination: "/root/dest.txt",
        overwrite: false,
      }

      expect(op.operation).toBe("copy")
      expect(op.path).toBe("/root/source.txt")
      expect(op.destination).toBe("/root/dest.txt")
      expect(op.overwrite).toBe(false)
    })

    it("should create valid DeleteOperation", () => {
      const op: DeleteOperation = {
        operation: "delete",
        path: "/root/file.txt",
        recursive: true,
      }

      expect(op.operation).toBe("delete")
      expect(op.path).toBe("/root/file.txt")
      expect(op.recursive).toBe(true)
    })

    it("should handle FileSystemOperation union type", () => {
      const operations: FileSystemOperation[] = [
        {
          operation: "read",
          path: "/root/file.txt",
        },
        {
          operation: "write",
          path: "/root/file.txt",
          content: "Hello, world!",
        },
        {
          operation: "update",
          path: "/root/file.txt",
          mode: "append",
          content: "Additional content",
        },
      ]

      expect(operations.length).toBe(3)
      expect(operations[0].operation).toBe("read")
      expect(operations[1].operation).toBe("write")
      expect(operations[2].operation).toBe("update")
    })
  })

  describe("Result Types", () => {
    it("should create valid ReadResult", () => {
      const result: ReadResult = {
        operation: "read",
        path: "/root/file.txt",
        success: true,
        content: "Hello, world!",
        binary: false,
        mimeType: "text/plain",
        durationMs: 5,
      }

      expect(result.operation).toBe("read")
      expect(result.path).toBe("/root/file.txt")
      expect(result.success).toBe(true)
      expect(result.content).toBe("Hello, world!")
      expect(result.binary).toBe(false)
      expect(result.mimeType).toBe("text/plain")
      expect(result.durationMs).toBe(5)
    })

    it("should create valid WriteResult", () => {
      const result: WriteResult = {
        operation: "write",
        path: "/root/file.txt",
        success: true,
        content: "Hello, world!",
        size: 13,
        contentTracking: {
          path: "/root/file.txt",
          timestamp: new Date().toISOString(),
          operation: "create",
          size: 13,
          type: "text/plain",
        },
        durationMs: 10,
      }

      expect(result.operation).toBe("write")
      expect(result.path).toBe("/root/file.txt")
      expect(result.success).toBe(true)
      expect(result.content).toBe("Hello, world!")
      expect(result.size).toBe(13)
      expect(result.contentTracking?.operation).toBe("create")
      expect(result.durationMs).toBe(10)
    })

    it("should create valid UpdateResult", () => {
      const result: UpdateResult = {
        operation: "update",
        path: "/root/file.txt",
        success: true,
        summary: "Updated 1 line",
        contentTracking: {
          path: "/root/file.txt",
          timestamp: new Date().toISOString(),
          operation: "update",
          diff: "--- old\n+++ new\n@@ -1,1 +1,1 @@\n-Old line\n+New line",
        },
        durationMs: 15,
      }

      expect(result.operation).toBe("update")
      expect(result.path).toBe("/root/file.txt")
      expect(result.success).toBe(true)
      expect(result.summary).toBe("Updated 1 line")
      expect(result.contentTracking?.operation).toBe("update")
      expect(result.contentTracking?.diff).toContain("Old line")
      expect(result.durationMs).toBe(15)
    })

    it("should handle FileSystemResult union type", () => {
      const results: FileSystemResult[] = [
        {
          operation: "read",
          path: "/root/file.txt",
          success: true,
          content: "Hello, world!",
        },
        {
          operation: "write",
          path: "/root/file.txt",
          success: true,
          content: "Hello, world!",
        },
        {
          operation: "delete",
          path: "/root/file.txt",
          success: true,
        },
      ]

      expect(results.length).toBe(3)
      expect(results[0].operation).toBe("read")
      expect(results[1].operation).toBe("write")
      expect(results[2].operation).toBe("delete")
    })
  })

  describe("FileInfo Types", () => {
    it("should create valid FileInfo", () => {
      const info: FileInfo = {
        path: "/root/file.txt",
        name: "file.txt",
        exists: true,
        type: "file",
        size: 13,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        accessed: new Date().toISOString(),
        permissions: "rw-r--r--",
        metadata: {
          mimeType: "text/plain",
          encoding: "utf8",
        },
      }

      expect(info.path).toBe("/root/file.txt")
      expect(info.name).toBe("file.txt")
      expect(info.exists).toBe(true)
      expect(info.type).toBe("file")
      expect(info.size).toBe(13)
      expect(info.metadata?.mimeType).toBe("text/plain")
    })

    it("should create valid DirectoryInfo", () => {
      const fileInfo: FileInfo = {
        path: "/root/dir/file.txt",
        name: "file.txt",
        exists: true,
        type: "file",
        size: 13,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        accessed: new Date().toISOString(),
        permissions: "rw-r--r--",
      }

      const dirInfo: DirectoryInfo = {
        path: "/root/dir",
        name: "dir",
        exists: true,
        type: "directory",
        size: 4096,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        accessed: new Date().toISOString(),
        permissions: "rwxr-xr-x",
        children: [fileInfo],
      }

      expect(dirInfo.path).toBe("/root/dir")
      expect(dirInfo.name).toBe("dir")
      expect(dirInfo.exists).toBe(true)
      expect(dirInfo.type).toBe("directory")
      expect(dirInfo.children?.length).toBe(1)
      expect(dirInfo.children?.[0].name).toBe("file.txt")
    })

    it("should handle FSEntryInfo union type", () => {
      const entries: FSEntryInfo[] = [
        {
          path: "/root/file.txt",
          name: "file.txt",
          exists: true,
          type: "file",
          size: 13,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          accessed: new Date().toISOString(),
          permissions: "rw-r--r--",
        },
        {
          path: "/root/dir",
          name: "dir",
          exists: true,
          type: "directory",
          size: 4096,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          accessed: new Date().toISOString(),
          permissions: "rwxr-xr-x",
        },
        {
          path: "/root/link",
          name: "link",
          exists: true,
          type: "symlink",
          target: "/root/file.txt",
          size: 8,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          accessed: new Date().toISOString(),
          permissions: "rwxr-xr-x",
        },
      ]

      expect(entries.length).toBe(3)
      expect(entries[0].type).toBe("file")
      expect(entries[1].type).toBe("directory")
      expect(entries[2].type).toBe("symlink")
    })
  })

  describe("ContentTracking Types", () => {
    it("should create valid ContentTrackingOptions", () => {
      const options: ContentTrackingOptions = {
        enabled: true,
        trackSize: true,
        trackType: true,
        trackDiff: true,
        diffContextLines: 3,
      }

      expect(options.enabled).toBe(true)
      expect(options.trackSize).toBe(true)
      expect(options.trackType).toBe(true)
      expect(options.trackDiff).toBe(true)
      expect(options.diffContextLines).toBe(3)
    })

    it("should create valid ContentModification", () => {
      const mod: ContentModification = {
        path: "/root/file.txt",
        timestamp: new Date().toISOString(),
        operation: "update",
        size: 13,
        type: "text/plain",
        diff: "--- old\n+++ new\n@@ -1,1 +1,1 @@\n-Old line\n+New line",
      }

      expect(mod.path).toBe("/root/file.txt")
      expect(mod.operation).toBe("update")
      expect(mod.size).toBe(13)
      expect(mod.type).toBe("text/plain")
      expect(mod.diff).toContain("Old line")
    })
  })
})

describe("Type Conversion Tests", () => {
  describe("ContentTracking Conversion", () => {
    it("should convert between old and new ContentTrackingOptions", () => {
      // Old to new
      const oldOptions: OldContentTrackingOptions = {
        enabled: true,
        trackSize: true,
        trackType: true,
        trackDiff: true,
        diffContextLines: 3,
      }

      const newOptions: ContentTrackingOptions = {
        enabled: oldOptions.enabled ?? true,
        trackSize: oldOptions.trackSize,
        trackType: oldOptions.trackType,
        trackDiff: oldOptions.trackDiff,
        diffContextLines: oldOptions.diffContextLines,
      }

      expect(newOptions.enabled).toBe(true)
      expect(newOptions.trackSize).toBe(true)
      expect(newOptions.trackType).toBe(true)
      expect(newOptions.trackDiff).toBe(true)
      expect(newOptions.diffContextLines).toBe(3)

      // New to old
      const convertedOldOptions: OldContentTrackingOptions = {
        enabled: newOptions.enabled,
        trackSize: newOptions.trackSize,
        trackType: newOptions.trackType,
        trackDiff: newOptions.trackDiff,
        diffContextLines: newOptions.diffContextLines,
      }

      expect(convertedOldOptions.enabled).toBe(true)
      expect(convertedOldOptions.trackSize).toBe(true)
      expect(convertedOldOptions.trackType).toBe(true)
      expect(convertedOldOptions.trackDiff).toBe(true)
      expect(convertedOldOptions.diffContextLines).toBe(3)
    })

    it("should convert between old and new ContentModification", () => {
      // Old to new
      const oldMod: OldContentModification = {
        path: "/root/file.txt",
        timestamp: new Date().toISOString(),
        operation: "update",
        size: 13,
        type: "text/plain",
        diff: "--- old\n+++ new\n@@ -1,1 +1,1 @@\n-Old line\n+New line",
      }

      const newMod: ContentModification = {
        path: oldMod.path,
        timestamp: oldMod.timestamp,
        operation: oldMod.operation,
        size: oldMod.size,
        type: oldMod.type,
        diff: oldMod.diff,
      }

      expect(newMod.path).toBe("/root/file.txt")
      expect(newMod.operation).toBe("update")
      expect(newMod.size).toBe(13)
      expect(newMod.type).toBe("text/plain")
      expect(newMod.diff).toContain("Old line")

      // New to old
      const convertedOldMod: OldContentModification = {
        path: newMod.path,
        timestamp: newMod.timestamp,
        operation: newMod.operation,
        size: newMod.size,
        type: newMod.type,
        diff: newMod.diff,
      }

      expect(convertedOldMod.path).toBe("/root/file.txt")
      expect(convertedOldMod.operation).toBe("update")
      expect(convertedOldMod.size).toBe(13)
      expect(convertedOldMod.type).toBe("text/plain")
      expect(convertedOldMod.diff).toContain("Old line")
    })
  })

  describe("Operation Conversion", () => {
    it("should convert old Operation to new FileSystemOperation", () => {
      // Write operation
      const oldWriteOp: Operation = {
        id: "write1",
        tool: "write_file",
        arguments: {
          path: "/root/file.txt",
          content: "Hello, world!",
          contentTracking: {
            enabled: true,
            trackDiff: true,
          },
        },
      }

      // Convert to new WriteOperation
      const newWriteOp: WriteOperation = {
        operation: "write",
        path: oldWriteOp.arguments?.path as string,
        content: oldWriteOp.arguments?.content,
        tracking: oldWriteOp.arguments
          ?.contentTracking as ContentTrackingOptions,
      }

      expect(newWriteOp.operation).toBe("write")
      expect(newWriteOp.path).toBe("/root/file.txt")
      expect(newWriteOp.content).toBe("Hello, world!")
      expect(newWriteOp.tracking?.enabled).toBe(true)

      // Update operation
      const oldUpdateOp: Operation = {
        id: "update1",
        tool: "update_file",
        arguments: {
          path: "/root/file.txt",
          operation: {
            mode: "append",
            content: "Additional content",
          },
        },
      }

      // Convert to new UpdateOperation
      const newUpdateOp: UpdateOperation = {
        operation: "update",
        path: oldUpdateOp.arguments?.path as string,
        mode: (oldUpdateOp.arguments?.operation as any)?.mode,
        content: (oldUpdateOp.arguments?.operation as any)?.content,
      }

      expect(newUpdateOp.operation).toBe("update")
      expect(newUpdateOp.path).toBe("/root/file.txt")
      expect(newUpdateOp.mode).toBe("append")
      expect(newUpdateOp.content).toBe("Additional content")
    })

    it("should convert new FileSystemOperation to old Operation", () => {
      // New WriteOperation
      const newWriteOp: WriteOperation = {
        operation: "write",
        path: "/root/file.txt",
        content: "Hello, world!",
        tracking: {
          enabled: true,
          trackDiff: true,
        },
      }

      // Convert to old Operation
      const oldWriteOp: Operation = {
        tool: "write_file",
        arguments: {
          path: newWriteOp.path,
          content: newWriteOp.content,
          contentTracking: newWriteOp.tracking,
        },
      }

      expect(oldWriteOp.tool).toBe("write_file")
      expect(oldWriteOp.arguments?.path).toBe("/root/file.txt")
      expect(oldWriteOp.arguments?.content).toBe("Hello, world!")
      expect((oldWriteOp.arguments?.contentTracking as any)?.enabled).toBe(true)

      // New UpdateOperation
      const newUpdateOp: UpdateOperation = {
        operation: "update",
        path: "/root/file.txt",
        mode: "diff",
        diff: [
          {
            line: 1,
            operation: "replace",
            text: "New line",
          },
        ],
      }

      // Convert to old Operation
      const oldUpdateOp: Operation = {
        tool: "update_file",
        arguments: {
          path: newUpdateOp.path,
          operation: {
            mode: newUpdateOp.mode,
            operations: newUpdateOp.diff,
          },
        },
      }

      expect(oldUpdateOp.tool).toBe("update_file")
      expect(oldUpdateOp.arguments?.path).toBe("/root/file.txt")
      expect((oldUpdateOp.arguments?.operation as any)?.mode).toBe("diff")
      expect(
        (oldUpdateOp.arguments?.operation as any)?.operations?.[0].line
      ).toBe(1)
    })
  })

  describe("Result Conversion", () => {
    it("should convert old OperationResult to new FileSystemResult", () => {
      // Old write result
      const oldWriteResult: OperationResult = {
        id: "write1",
        tool: "write_file",
        success: true,
        result: {
          content: "Hello, world!",
          path: "/root/file.txt",
        },
        durationMs: 10,
      }

      // Convert to new WriteResult
      const newWriteResult: WriteResult = {
        operation: "write",
        path: (oldWriteResult.result as any)?.path,
        success: oldWriteResult.success,
        content: (oldWriteResult.result as any)?.content,
        durationMs: oldWriteResult.durationMs,
      }

      expect(newWriteResult.operation).toBe("write")
      expect(newWriteResult.path).toBe("/root/file.txt")
      expect(newWriteResult.success).toBe(true)
      expect(newWriteResult.content).toBe("Hello, world!")
      expect(newWriteResult.durationMs).toBe(10)
    })

    it("should convert new FileSystemResult to old OperationResult", () => {
      // New ReadResult
      const newReadResult: ReadResult = {
        operation: "read",
        path: "/root/file.txt",
        success: true,
        content: "Hello, world!",
        binary: false,
        mimeType: "text/plain",
        durationMs: 5,
      }

      // Convert to old OperationResult
      const oldReadResult: OperationResult = {
        tool: "read_file",
        success: newReadResult.success,
        result: {
          content: newReadResult.content,
          path: newReadResult.path,
          binary: newReadResult.binary,
          mimeType: newReadResult.mimeType,
        },
        durationMs: newReadResult.durationMs,
      }

      expect(oldReadResult.tool).toBe("read_file")
      expect(oldReadResult.success).toBe(true)
      expect((oldReadResult.result as any)?.content).toBe("Hello, world!")
      expect((oldReadResult.result as any)?.path).toBe("/root/file.txt")
      expect(oldReadResult.durationMs).toBe(5)
    })
  })
})

describe("Edge Case Tests", () => {
  it("should handle undefined optional properties", () => {
    const readOp: ReadOperation = {
      operation: "read",
      path: "/root/file.txt",
      // No optional properties
    }

    expect(readOp.operation).toBe("read")
    expect(readOp.path).toBe("/root/file.txt")
    expect(readOp.encoding).toBeUndefined()
    expect(readOp.startLine).toBeUndefined()
    expect(readOp.endLine).toBeUndefined()
  })

  it("should handle empty content", () => {
    const writeOp: WriteOperation = {
      operation: "write",
      path: "/root/file.txt",
      content: "",
    }

    expect(writeOp.operation).toBe("write")
    expect(writeOp.path).toBe("/root/file.txt")
    expect(writeOp.content).toBe("")
  })

  it("should handle non-string content", () => {
    const writeOp: WriteOperation = {
      operation: "write",
      path: "/root/file.json",
      content: { key: "value" },
    }

    expect(writeOp.operation).toBe("write")
    expect(writeOp.path).toBe("/root/file.json")
    expect((writeOp.content as any).key).toBe("value")
  })

  it("should handle failed operation results", () => {
    const readResult: ReadResult = {
      operation: "read",
      path: "/root/nonexistent.txt",
      success: false,
      error: "File not found",
    }

    expect(readResult.operation).toBe("read")
    expect(readResult.path).toBe("/root/nonexistent.txt")
    expect(readResult.success).toBe(false)
    expect(readResult.error).toBe("File not found")
    expect(readResult.content).toBeUndefined()
  })

  it("should handle complex nested structures", () => {
    const dirInfo: DirectoryInfo = {
      path: "/root",
      name: "root",
      exists: true,
      type: "directory",
      size: 4096,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      accessed: new Date().toISOString(),
      permissions: "rwxr-xr-x",
      children: [
        {
          path: "/root/file.txt",
          name: "file.txt",
          exists: true,
          type: "file",
          size: 13,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          accessed: new Date().toISOString(),
          permissions: "rw-r--r--",
        },
        {
          path: "/root/subdir",
          name: "subdir",
          exists: true,
          type: "directory",
          size: 4096,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          accessed: new Date().toISOString(),
          permissions: "rwxr-xr-x",
          children: [
            {
              path: "/root/subdir/nested.txt",
              name: "nested.txt",
              exists: true,
              type: "file",
              size: 10,
              created: new Date().toISOString(),
              modified: new Date().toISOString(),
              accessed: new Date().toISOString(),
              permissions: "rw-r--r--",
            },
          ],
        },
      ],
    }

    expect(dirInfo.path).toBe("/root")
    expect(dirInfo.children?.length).toBe(2)
    expect(dirInfo.children?.[0].type).toBe("file")
    expect(dirInfo.children?.[1].type).toBe("directory")
    expect((dirInfo.children?.[1] as DirectoryInfo).children?.length).toBe(1)
    expect((dirInfo.children?.[1] as DirectoryInfo).children?.[0].name).toBe(
      "nested.txt"
    )
  })

  it("should handle type discrimination in union types", () => {
    const operations: FileSystemOperation[] = [
      {
        operation: "read",
        path: "/root/file.txt",
      },
      {
        operation: "write",
        path: "/root/file.txt",
        content: "Hello, world!",
      },
    ]

    // Type discrimination
    const readOps = operations.filter(
      (op): op is ReadOperation => op.operation === "read"
    )
    const writeOps = operations.filter(
      (op): op is WriteOperation => op.operation === "write"
    )

    expect(readOps.length).toBe(1)
    expect(writeOps.length).toBe(1)
    expect(readOps[0].operation).toBe("read")
    expect(writeOps[0].operation).toBe("write")
    expect(writeOps[0].content).toBe("Hello, world!")
  })
})
