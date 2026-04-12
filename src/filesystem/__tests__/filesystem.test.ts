import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals"
import { trackContentModification } from "../contentTracking.js"
import { extractFileMetadata } from "../fileTypeHandlers.js"
import { McpError } from "@modelcontextprotocol/sdk/types.js"
import { FileSystem } from "../FileSystem.js"

describe("Filesystem Operations", () => {
  let testDir: string
  let testFilePath1: string

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), `test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })

    // Create test file path
    testFilePath1 = path.join(testDir, "test1.txt")
  })

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe("Content Tracking", () => {
    it("should track file creation", async () => {
      const content = "Test content"
      await fs.writeFile(testFilePath1, content)

      const result = await trackContentModification(
        testFilePath1,
        "create",
        testDir,
        undefined,
        { trackSize: true, trackType: true }
      )

      expect(result.operation).toBe("create")
      expect(result.size).toBe(content.length)
      expect(result.type).toBe("text/plain")
    })

    it("should track file updates with diff", async () => {
      const oldContent = "Old content\nLine to keep\nLine to remove"
      const newContent = "Old content\nLine to keep\nNew line added"

      await fs.writeFile(testFilePath1, oldContent)
      await fs.writeFile(testFilePath1, newContent)

      const result = await trackContentModification(
        testFilePath1,
        "update",
        testDir,
        oldContent,
        { trackDiff: true, diffContextLines: 3 }
      )

      expect(result.operation).toBe("update")
      expect(result.diff).toBeDefined()
      expect(result.diff).toContain("-Line to remove")
      expect(result.diff).toContain("+New line added")
      expect(result.diff).toContain(" Line to keep")
    })
  })

  describe("File Type Handling", () => {
    it("should extract metadata from text files", async () => {
      const content = "Test content"
      const beforeWrite = Date.now()
      await fs.writeFile(testFilePath1, content)

      // Get file metadata and stats separately
      const metadata = await extractFileMetadata(testFilePath1)
      const stats = await fs.stat(testFilePath1)
      const afterWrite = Date.now()

      // Test file stats - verify mtime is a valid recent timestamp
      expect(new Date(stats.mtime)).toBeInstanceOf(Date)
      // On Windows (NTFS), Date.now() and filesystem timestamps can diverge
      // significantly due to different clock sources. Just verify mtime is
      // within a reasonable window around the write operation.
      const mtimeMs = new Date(stats.mtime).getTime()
      expect(mtimeMs).toBeGreaterThanOrEqual(beforeWrite - 2000)
      expect(mtimeMs).toBeLessThanOrEqual(afterWrite + 2000)
      expect(stats.size).toBe(content.length)

      // Test metadata
      expect(metadata.mimeType).toBe("text/plain")
    })
  })
})

describe("FileSystem Class", () => {
  let tmpDir: string
  let filesystem: FileSystem

  beforeEach(async () => {
    // Create unique temp directory for each test
    tmpDir = path.join(os.tmpdir(), `test-${Date.now()}`)
    await fs.mkdir(tmpDir, { recursive: true })

    filesystem = new FileSystem({
      rootDirectory: tmpDir,
      excludedDirs: [path.join(tmpDir, "excluded")],
    })
  })

  afterEach(async () => {
    // Clean up temp directory after each test
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe("readFile", () => {
    it("should read text file content", async () => {
      const testPath = path.join(tmpDir, "test.txt")
      const testContent = "Hello, world!"
      await fs.writeFile(testPath, testContent)

      const content = await filesystem.readFile(testPath)
      expect(content).toBe(testContent)
    })

    it("should reject paths outside root directory", async () => {
      const outsidePath = path.join(os.tmpdir(), "outside.txt")

      await expect(filesystem.readFile(outsidePath)).rejects.toThrow(McpError)
    })
  })

  describe("readFiles", () => {
    it("should read multiple files concurrently", async () => {
      const files = [
        { path: "file1.txt", content: "Content 1" },
        { path: "file2.txt", content: "Content 2" },
        { path: "file3.txt", content: "Content 3" },
      ]

      for (const file of files) {
        const filePath = path.join(tmpDir, file.path)
        await fs.writeFile(filePath, file.content)
      }

      const results = await filesystem.readFiles(
        files.map((f) => path.join(tmpDir, f.path))
      )

      expect(results).toHaveLength(3)
      expect(results.every((r) => r.content && !r.error)).toBe(true)
      expect(results.map((r) => r.content)).toEqual([
        "Content 1",
        "Content 2",
        "Content 3",
      ])
    })

    it("should handle errors in concurrent reads", async () => {
      const files = [
        { path: "exists1.txt", content: "Content 1" },
        { path: "missing.txt", content: null },
        { path: "exists2.txt", content: "Content 2" },
      ]

      for (const file of files) {
        if (file.content) {
          const filePath = path.join(tmpDir, file.path)
          await fs.writeFile(filePath, file.content)
        }
      }

      const results = await filesystem.readFiles(
        files.map((f) => path.join(tmpDir, f.path))
      )

      expect(results).toHaveLength(3)
      expect(results[0].content).toBe("Content 1")
      expect(results[1].error).toBeDefined()
      expect(results[2].content).toBe("Content 2")
    })

    describe("writeFile", () => {
      it("should handle template resolution", async () => {
        const testPath = path.join(tmpDir, "template.txt")
        const template = "Hello, {{name}}!"
        const content = { name: "world" }

        const result = await filesystem.writeFile(testPath, content, {
          template,
        })

        expect(result.content).toBe("Hello, world!")
        const written = await fs.readFile(testPath, "utf-8")
        expect(written).toBe("Hello, world!")
      })

      it("should handle result chaining with previousResult", async () => {
        const testPath = path.join(tmpDir, "chained.txt")
        const previousResult = { key: "value" }

        const result = await filesystem.writeFile(
          testPath,
          "placeholder",
          {},
          previousResult
        )

        expect(result.content).toBe(JSON.stringify(previousResult))
        const written = await fs.readFile(testPath, "utf-8")
        expect(JSON.parse(written)).toEqual(previousResult)
      })

      it("should create directories as needed", async () => {
        const testPath = path.join(tmpDir, "nested", "deep", "test.txt")
        const content = "Nested content"

        await filesystem.writeFile(testPath, content)

        const written = await fs.readFile(testPath, "utf-8")
        expect(written).toBe(content)

        const dirExists = await fs
          .stat(path.dirname(testPath))
          .then(() => true)
          .catch(() => false)
        expect(dirExists).toBe(true)
      })
    })

    describe("moveFile", () => {
      it("should move file to new location", async () => {
        const sourcePath = path.join(tmpDir, "source.txt")
        const destPath = path.join(tmpDir, "dest.txt")
        const content = "Test content"

        await fs.writeFile(sourcePath, content)
        await filesystem.moveFile(sourcePath, destPath)

        // Source should not exist
        await expect(fs.access(sourcePath)).rejects.toThrow()

        // Destination should have content
        const movedContent = await fs.readFile(destPath, "utf-8")
        expect(movedContent).toBe(content)
      })

      it("should create destination directory if needed", async () => {
        const sourcePath = path.join(tmpDir, "source.txt")
        const destPath = path.join(tmpDir, "nested", "deep", "dest.txt")
        const content = "Test content"

        await fs.writeFile(sourcePath, content)
        await filesystem.moveFile(sourcePath, destPath)

        const movedContent = await fs.readFile(destPath, "utf-8")
        expect(movedContent).toBe(content)
      })

      it("should throw InvalidParams for non-existent source", async () => {
        const sourcePath = path.join(tmpDir, "nonexistent.txt")
        const destPath = path.join(tmpDir, "dest.txt")

        await expect(filesystem.moveFile(sourcePath, destPath)).rejects.toThrow(
          McpError
        )
      })
    })

    describe("excludedDirs", () => {
      it("should prevent operations in excluded directories", async () => {
        // Create test file in excluded directory
        const excludedDir = path.join(tmpDir, "excluded")
        const excludedFile = path.join(excludedDir, "test.txt")
        await fs.mkdir(excludedDir, { recursive: true })
        await fs.writeFile(excludedFile, "Test content")

        // Attempt operations on excluded file
        await expect(filesystem.readFile(excludedFile)).rejects.toThrow(
          McpError
        )

        await expect(
          filesystem.writeFile(excludedFile, "New content")
        ).rejects.toThrow(McpError)

        await expect(filesystem.deleteFile(excludedFile)).rejects.toThrow(
          McpError
        )
      })
    })

    describe("deleteFile", () => {
      it("should delete existing file", async () => {
        const filePath = path.join(tmpDir, "delete.txt")
        await fs.writeFile(filePath, "Test content")

        await filesystem.deleteFile(filePath)

        await expect(fs.access(filePath)).rejects.toThrow()
      })

      it("should throw InvalidParams for non-existent file", async () => {
        const filePath = path.join(tmpDir, "nonexistent.txt")

        await expect(filesystem.deleteFile(filePath)).rejects.toThrow(McpError)
      })
    })

    describe("copyFile", () => {
      it("should copy file to new location", async () => {
        const sourcePath = path.join(tmpDir, "source.txt")
        const destPath = path.join(tmpDir, "dest.txt")
        const content = "Test content"

        await fs.writeFile(sourcePath, content)
        await filesystem.copyFile(sourcePath, destPath)

        // Source should still exist
        const sourceContent = await fs.readFile(sourcePath, "utf-8")
        expect(sourceContent).toBe(content)

        // Destination should have content
        const copiedContent = await fs.readFile(destPath, "utf-8")
        expect(copiedContent).toBe(content)
      })

      it("should create destination directory if needed", async () => {
        const sourcePath = path.join(tmpDir, "source.txt")
        const destPath = path.join(tmpDir, "nested", "deep", "dest.txt")
        const content = "Test content"

        await fs.writeFile(sourcePath, content)
        await filesystem.copyFile(sourcePath, destPath)

        const copiedContent = await fs.readFile(destPath, "utf-8")
        expect(copiedContent).toBe(content)
      })

      it("should throw InvalidParams for non-existent source", async () => {
        const sourcePath = path.join(tmpDir, "nonexistent.txt")
        const destPath = path.join(tmpDir, "dest.txt")

        await expect(filesystem.copyFile(sourcePath, destPath)).rejects.toThrow(
          McpError
        )
      })
    })
  })
})
