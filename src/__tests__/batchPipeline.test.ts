import { describe, test, expect, beforeEach, afterEach } from "@jest/globals"
import { FileSystem } from "../filesystem/FileSystem.js"
import { BatchExecutor } from "../execution/BatchExecutor.js"
import { ConnectionManager } from "../connections/ConnectionManager.js"
import { ServerIdentity } from "../types/schemas/index.js"
import { promises as fs } from "fs"
import path from "path"
import os from "os"

describe("Batch Pipeline Integration", () => {
  let tmpDir: string
  let batchExecutor: BatchExecutor

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `batch-pipeline-${Date.now()}`)
    await fs.mkdir(tmpDir, { recursive: true })
    const filesystem = new FileSystem({ rootDirectory: tmpDir })
    const connectionManager = new ConnectionManager(filesystem)
    batchExecutor = new BatchExecutor(connectionManager)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  const getIdentity = (): ServerIdentity => ({
    name: "test-fs",
    serverType: {
      type: "filesystem",
      config: { provider: "batchit-internal" as const, rootDirectory: tmpDir },
    },
  })

  test("write then read with result chaining", async () => {
    const testFile = path.join(tmpDir, "chained.txt")

    const results = await batchExecutor.executeBatch(
      getIdentity(),
      [
        {
          tool: "write_file",
          arguments: { path: testFile, content: "hello from batch" },
          id: "write1",
        },
        {
          tool: "read_file",
          arguments: { path: testFile },
          id: "read1",
          dependsOn: "write1",
        },
      ],
      { maxConcurrent: 10, timeoutMs: 5000, stopOnError: false }
    )

    expect(results).toHaveLength(2)
    expect(results[0].success).toBe(true)
    expect(results[1].success).toBe(true)
  })

  test("write file then list directory", async () => {
    const testFile = path.join(tmpDir, "new-file.txt")

    const results = await batchExecutor.executeBatch(
      getIdentity(),
      [
        {
          tool: "write_file",
          arguments: { path: testFile, content: "content" },
        },
        {
          tool: "list_directory",
          arguments: { path: tmpDir },
        },
      ],
      { maxConcurrent: 10, timeoutMs: 5000, stopOnError: false }
    )

    expect(results).toHaveLength(2)
    expect(results[0].success).toBe(true)
    expect(results[1].success).toBe(true)
  })

  test("parallel writes to different files", async () => {
    const file1 = path.join(tmpDir, "parallel1.txt")
    const file2 = path.join(tmpDir, "parallel2.txt")

    const results = await batchExecutor.executeBatch(
      getIdentity(),
      [
        {
          tool: "write_file",
          arguments: { path: file1, content: "file 1" },
          id: "write1",
        },
        {
          tool: "write_file",
          arguments: { path: file2, content: "file 2" },
          id: "write2",
        },
      ],
      { maxConcurrent: 10, timeoutMs: 5000, stopOnError: false }
    )

    expect(results).toHaveLength(2)
    expect(results[0].success).toBe(true)
    expect(results[1].success).toBe(true)

    // Verify both files exist
    const content1 = await fs.readFile(file1, "utf-8")
    const content2 = await fs.readFile(file2, "utf-8")
    expect(content1).toBe("file 1")
    expect(content2).toBe("file 2")
  })

  test("stopOnError stops after first failure", async () => {
    const goodFile = path.join(tmpDir, "good.txt")
    // Use a read_file on a nonexistent path — guaranteed to fail
    const badPath = path.join(tmpDir, "no-such-dir", "nonexistent.txt")

    const results = await batchExecutor.executeBatch(
      getIdentity(),
      [
        {
          tool: "read_file",
          arguments: { path: badPath },
          id: "bad",
        },
        {
          tool: "write_file",
          arguments: { path: goodFile, content: "should not run" },
          id: "good",
          dependsOn: "bad",
        },
      ],
      { maxConcurrent: 10, timeoutMs: 5000, stopOnError: true }
    )

    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].success).toBe(false)
  })

  test("delete file operation", async () => {
    const testFile = path.join(tmpDir, "to-delete.txt")
    await fs.writeFile(testFile, "delete me")

    const results = await batchExecutor.executeBatch(
      getIdentity(),
      [
        {
          tool: "delete_file",
          arguments: { path: testFile },
        },
      ],
      { maxConcurrent: 10, timeoutMs: 5000, stopOnError: false }
    )

    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)

    // Verify file is gone
    await expect(fs.access(testFile)).rejects.toThrow()
  })

  test("get file info", async () => {
    const testFile = path.join(tmpDir, "info-test.txt")
    await fs.writeFile(testFile, "test content")

    const results = await batchExecutor.executeBatch(
      getIdentity(),
      [
        {
          tool: "get_file_info",
          arguments: { path: testFile },
        },
      ],
      { maxConcurrent: 10, timeoutMs: 5000, stopOnError: false }
    )

    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
  })
})
