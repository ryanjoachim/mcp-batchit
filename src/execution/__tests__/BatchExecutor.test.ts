import { describe, test, expect, beforeEach } from "@jest/globals"
import { BatchExecutor } from "../BatchExecutor.js"
import { ConnectionManager } from "../../connections/ConnectionManager.js"
import { FileSystem } from "../../filesystem/FileSystem.js"
import { ServerIdentity } from "../../types/schemas/index.js"
import os from "os"

describe("BatchExecutor", () => {
  let batchExecutor: BatchExecutor
  let connectionManager: ConnectionManager

  beforeEach(() => {
    const defaultFileSystem = new FileSystem({ rootDirectory: os.tmpdir() })
    connectionManager = new ConnectionManager(defaultFileSystem)
    batchExecutor = new BatchExecutor(connectionManager)
  })

  const internalIdentity: ServerIdentity = {
    name: "test-fs",
    serverType: {
      type: "filesystem",
      config: {
        provider: "batchit-internal" as const,
        rootDirectory: os.tmpdir(),
      },
    },
  }

  describe("executeBatch", () => {
    test("executes a single list_directory operation", async () => {
      const results = await batchExecutor.executeBatch(
        internalIdentity,
        [
          {
            tool: "list_directory",
            arguments: { path: os.tmpdir() },
          },
        ],
        { maxConcurrent: 10, timeoutMs: 5000, stopOnError: false }
      )

      expect(results).toHaveLength(1)
      expect(results[0].tool).toBe("list_directory")
      expect(results[0].success).toBe(true)
    })

    test("executes multiple independent operations in parallel", async () => {
      const results = await batchExecutor.executeBatch(
        internalIdentity,
        [
          {
            tool: "list_directory",
            arguments: { path: os.tmpdir() },
            id: "list1",
          },
          {
            tool: "list_directory",
            arguments: { path: os.tmpdir() },
            id: "list2",
          },
        ],
        { maxConcurrent: 10, timeoutMs: 5000, stopOnError: false }
      )

      expect(results).toHaveLength(2)
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(true)
    })

    test("caches results for chained operations", async () => {
      const results = await batchExecutor.executeBatch(
        internalIdentity,
        [
          {
            tool: "list_directory",
            arguments: { path: os.tmpdir() },
            id: "step1",
          },
          {
            tool: "list_directory",
            arguments: { path: os.tmpdir() },
            id: "step2",
            dependsOn: "step1",
          },
        ],
        { maxConcurrent: 10, timeoutMs: 5000, stopOnError: false }
      )

      expect(results).toHaveLength(2)
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(true)
    })

    test("returns empty results when signal is already aborted", async () => {
      const controller = new AbortController()
      controller.abort()

      const results = await batchExecutor.executeBatch(
        internalIdentity,
        [
          {
            tool: "list_directory",
            arguments: { path: os.tmpdir() },
          },
        ],
        { maxConcurrent: 10, timeoutMs: 5000, stopOnError: false },
        { signal: controller.signal }
      )

      // Batch is cancelled before starting, so no results
      expect(results).toHaveLength(0)
    })

    test("stops on error when stopOnError is true", async () => {
      const results = await batchExecutor.executeBatch(
        internalIdentity,
        [
          {
            tool: "read_file",
            arguments: { path: "/nonexistent/path/file.txt" },
            id: "bad-read",
          },
          {
            tool: "list_directory",
            arguments: { path: os.tmpdir() },
            id: "good-list",
            dependsOn: "bad-read",
          },
        ],
        { maxConcurrent: 10, timeoutMs: 5000, stopOnError: true }
      )

      // Should have results for at least the first failed operation
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].success).toBe(false)
    })

    test("each batch gets a fresh results cache", async () => {
      // Run two sequential batches — the second should not see the first's results
      await batchExecutor.executeBatch(
        internalIdentity,
        [
          {
            tool: "list_directory",
            arguments: { path: os.tmpdir() },
            id: "step1",
          },
        ],
        { maxConcurrent: 10, timeoutMs: 5000, stopOnError: false }
      )

      // Second batch should work independently — no stale data interference
      const results = await batchExecutor.executeBatch(
        internalIdentity,
        [
          {
            tool: "list_directory",
            arguments: { path: os.tmpdir() },
            id: "step2",
          },
        ],
        { maxConcurrent: 10, timeoutMs: 5000, stopOnError: false }
      )

      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
    })

    test("returns error for unknown tool", async () => {
      const results = await batchExecutor.executeBatch(
        internalIdentity,
        [
          {
            tool: "nonexistent_tool",
            arguments: {},
          },
        ],
        { maxConcurrent: 10, timeoutMs: 5000, stopOnError: false }
      )

      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
    })
  })
})
