
import { jest } from "@jest/globals"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import {
  batchExecutor,
  connectionManager,
  ServerIdentity,
  Operation,
} from "../index.js"
import { existsSync } from "fs"

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn()
}))

/* =====================
   ConnectionManager Tests
===================== */
describe("ConnectionManager", () => {
  const genericIdentity: ServerIdentity = {
    name: "generic-server",
    serverType: { type: "generic", config: {} },
    transport: { type: "websocket", url: "ws://localhost:3000" },
  }

  beforeEach(() => {
    jest.spyOn(Client.prototype, "connect").mockResolvedValue(undefined)
    jest.spyOn(Client.prototype, "close").mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("creates a consistent key from ServerIdentity", () => {
    const key = connectionManager.createKeyForIdentity(genericIdentity)
    expect(typeof key).toBe("string")
    expect(key).toEqual(
      JSON.stringify({
        name: genericIdentity.name,
        serverType: genericIdentity.serverType,
        transport: genericIdentity.transport,
      })
    )
  })

  it("returns the same connection if called twice with the same identity", async () => {
    const conn1 = await connectionManager.getOrCreateConnection(genericIdentity)
    const conn2 = await connectionManager.getOrCreateConnection(genericIdentity)
    expect(conn1).toBe(conn2)
    expect(conn2.lastUsed).toBeGreaterThanOrEqual(conn1.lastUsed)
  })

  it("closes a connection and clears its cleanup interval", async () => {
    const key = connectionManager.createKeyForIdentity(genericIdentity)
    await connectionManager.getOrCreateConnection(genericIdentity)
    const closeSpy = jest.spyOn(Client.prototype, "close")
    await connectionManager.closeConnection(key)
    expect(closeSpy).toHaveBeenCalled()
    expect((connectionManager as any).connections.has(key)).toBe(false)
  })

  describe("Transport Configuration Validation", () => {
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it("throws an error for invalid stdio config with non-absolute server file", async () => {
      const badIdentity: ServerIdentity = {
        name: "bad-stdio",
        serverType: { type: "generic", config: {} },
        transport: {
          type: "stdio",
          command: "node",
          args: ["relative/path/to/server.js"],
        },
      }
      await expect(
        connectionManager.getOrCreateConnection(badIdentity)
      ).rejects.toThrow(/Server file path must be absolute/)
    })

    it("throws an error for stdio config when server file does not exist", async () => {
      // Mock existsSync to return false
      (existsSync as jest.Mock).mockReturnValue(false)
      const badIdentity: ServerIdentity = {
        name: "nonexistent-stdio",
        serverType: { type: "generic", config: {} },
        transport: {
          type: "stdio",
          command: "node",
          args: ["/absolute/path/to/missingServer.js"],
        },
      }
      await expect(
        connectionManager.getOrCreateConnection(badIdentity)
      ).rejects.toThrow(/Server file not found/)
    })

    it("throws an error for invalid websocket URL", async () => {
      const badIdentity: ServerIdentity = {
        name: "bad-websocket",
        serverType: { type: "generic", config: {} },
        transport: {
          type: "websocket",
          url: "http://not-a-ws-protocol",
        },
      }
      await expect(
        connectionManager.getOrCreateConnection(badIdentity)
      ).rejects.toThrow(/Invalid WebSocket URL/)
    })
  })
})

/* =====================
   BatchExecutor - Basic Operation Execution
===================== */
describe("BatchExecutor - Basic Operation Execution", () => {
  const defaultServerIdentity: ServerIdentity = {
    name: "test-server",
    serverType: { type: "generic", config: {} },
    transport: { type: "websocket", url: "ws://localhost:3000" },
  }

  const defaultOptions = {
    maxConcurrent: 10,
    timeoutMs: 30000,
    stopOnError: false,
    keepAlive: false,
  }

  beforeEach(() => {
    jest.spyOn(Client.prototype, "connect").mockResolvedValue(undefined)
    jest.spyOn(Client.prototype, "close").mockResolvedValue(undefined)
    // Health check always resolves.
    jest.spyOn(Client.prototype, "request").mockResolvedValue({})
    // Default: callTool resolves immediately.
    jest.spyOn(Client.prototype, "callTool").mockImplementation(async (op) => ({
      type: "text",
      text: `mocked-${op.name}-result`,
    }))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("executes a successful operation", async () => {
    jest.spyOn(Client.prototype, "callTool").mockResolvedValue({
      type: "text",
      text: "test-result",
    })
    const operation: Operation = {
      tool: "quick-tool",
      arguments: { param: "value" },
    }
    const results = await batchExecutor.executeBatch(
      defaultServerIdentity,
      [operation],
      defaultOptions
    )
    expect(results).toEqual([
      expect.objectContaining({
        tool: "quick-tool",
        success: true,
        result: { type: "text", text: "test-result" },
      }),
    ])
  })

  it("handles multiple operations in parallel", async () => {
    jest
      .spyOn(Client.prototype, "callTool")
      .mockImplementation(async (op) =>
        Promise.resolve({
          type: "text",
          text: `result-${op.arguments?.param ?? "unknown"}`,
        })
      )
    const operations: Operation[] = [
      { tool: "parallel-tool", arguments: { param: "one" } },
      { tool: "parallel-tool", arguments: { param: "two" } },
      { tool: "parallel-tool", arguments: { param: "three" } },
    ]
    const results = await batchExecutor.executeBatch(
      defaultServerIdentity,
      operations,
      { ...defaultOptions, maxConcurrent: 2 }
    )
    expect(results).toEqual([
      expect.objectContaining({
        tool: "parallel-tool",
        success: true,
        result: { type: "text", text: "result-one" },
      }),
      expect.objectContaining({
        tool: "parallel-tool",
        success: true,
        result: { type: "text", text: "result-two" },
      }),
      expect.objectContaining({
        tool: "parallel-tool",
        success: true,
        result: { type: "text", text: "result-three" },
      }),
    ])
  })

  it("retries a transient failure and eventually succeeds", async () => {
    const callToolMock = jest
      .spyOn(Client.prototype, "callTool")
      .mockImplementationOnce(() =>
        Promise.reject(new Error("Transient error"))
      )
      .mockResolvedValue({ type: "text", text: "recovered" })
    const operation: Operation = {
      tool: "retry-tool",
      arguments: { param: "value" },
    }
    const [result] = await batchExecutor.executeBatch(
      defaultServerIdentity,
      [operation],
      defaultOptions
    )
    expect(result.success).toBe(true)
    expect(result.result).toEqual({ type: "text", text: "recovered" })
    expect(callToolMock).toHaveBeenCalledTimes(2)
  })

  it("times out operations that exceed the timeout duration", async () => {
    // Simulate a hanging callTool by returning a promise that never resolves.
    jest
      .spyOn(Client.prototype, "callTool")
      .mockImplementation(() => new Promise(() => {}))
    // Set a very short timeout so the operation times out quickly.
    const optionsWithShortTimeout = { ...defaultOptions, timeoutMs: 10 }
    const slowOperation: Operation = {
      tool: "slow-tool",
      arguments: { param: "value" },
    }
    const [result] = await batchExecutor.executeBatch(
      defaultServerIdentity,
      [slowOperation],
      optionsWithShortTimeout
    )
    expect(result).toMatchObject({
      tool: "slow-tool",
      success: false,
      durationMs: expect.any(Number),
    })
    expect(result.error).toContain("Operation timed out")
  })

  it("captures HPC error responses in the result correctly", async () => {
    const mockErrorResponse = {
      isError: true,
      error: "HPC computed error",
      message: "Something went wrong in HPC",
    }
    jest
      .spyOn(Client.prototype, "callTool")
      .mockResolvedValue(mockErrorResponse)
    const operation: Operation = {
      tool: "hpc-error-tool",
      arguments: { key: "value" },
    }
    const [result] = await batchExecutor.executeBatch(
      defaultServerIdentity,
      [operation],
      defaultOptions
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("HPC computed error")
  })
})

/* =====================
   BatchExecutor - Pipeline and Transform Features
===================== */
describe("BatchExecutor - Pipeline and Transform Features", () => {
  const defaultServerIdentity: ServerIdentity = {
    name: "pipeline-server",
    serverType: { type: "generic", config: {} },
    transport: { type: "websocket", url: "ws://localhost:3000" },
  }
  const defaultOptions = {
    maxConcurrent: 5,
    timeoutMs: 30000,
    stopOnError: false,
    keepAlive: false,
  }

  beforeEach(() => {
    jest.spyOn(Client.prototype, "connect").mockResolvedValue(undefined)
    jest.spyOn(Client.prototype, "close").mockResolvedValue(undefined)
    jest.spyOn(Client.prototype, "request").mockResolvedValue({})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("executes operations in sequence with dependsOn", async () => {
    const callToolMock = jest
      .spyOn(Client.prototype, "callTool")
      .mockImplementationOnce(async () => ({
        type: "text",
        text: "first-result",
      }))
      .mockImplementationOnce(async () => ({
        type: "text",
        text: "second-result",
      }))
    const operations: Operation[] = [
      { id: "step1", tool: "sequential-tool-1", arguments: { input: "first" } },
      {
        id: "step2",
        tool: "sequential-tool-2",
        arguments: { input: "second" },
        dependsOn: "step1",
      },
    ]
    const results = await batchExecutor.executeBatch(
      defaultServerIdentity,
      operations,
      { ...defaultOptions, maxConcurrent: 2 }
    )
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      tool: "sequential-tool-1",
      success: true,
      result: { type: "text", text: "first-result" },
    })
    expect(results[1]).toMatchObject({
      tool: "sequential-tool-2",
      success: true,
      result: { type: "text", text: "second-result" },
    })
    // Inspect call arguments directly.
    const firstCall = callToolMock.mock.calls[0][0]
    const secondCall = callToolMock.mock.calls[1][0]
    expect(firstCall.name).toBe("sequential-tool-1")
    expect(firstCall.arguments).toEqual({ input: "first" })
    expect(secondCall.name).toBe("sequential-tool-2")
    expect(secondCall.arguments).toEqual({ input: "second" })
  })

  it("applies transform function (as string) and falls back on error", async () => {
    // Simulate a transform string that fails evaluation.
    // In production, the transform failure should trigger a fallback to op.arguments.
    jest.spyOn(Client.prototype, "callTool").mockImplementation(async (op) => {
      if (op.name === "tool-step1") return { type: "text", text: "Hello" }
      return { type: "text", text: `Modified: ${op.arguments?.combined}` }
    })
    const operations: Operation[] = [
      { id: "step1", tool: "tool-step1", arguments: { greeting: "Hello" } },
      {
        id: "step2",
        tool: "tool-step2",
        dependsOn: "step1",
        arguments: { someBase: "Base" },
        // Invalid transform string should cause fallback.
        transform: "not a valid function",
      },
    ]
    const results = await batchExecutor.executeBatch(
      defaultServerIdentity,
      operations,
      { ...defaultOptions, maxConcurrent: 2 }
    )
    // Expect that the transform fails and the fallback (original op.arguments) is used.
    expect(results[1]).toMatchObject({
      tool: "tool-step2",
      success: true,
      result: { type: "text" },
    })
  })

  it("applies transform object to arguments", async () => {
    const callToolMock = jest
      .spyOn(Client.prototype, "callTool")
      .mockImplementation(async (op) => {
        if (op.name === "tool-step1") return { type: "text", text: "First" }
        return {
          type: "text",
          text: `Modified: ${JSON.stringify(op.arguments)}`,
        }
      })
    const operations: Operation[] = [
      { id: "step1", tool: "tool-step1", arguments: { initial: "First" } },
      {
        id: "step2",
        tool: "tool-step2",
        dependsOn: "step1",
        arguments: { base: "Base" },
        transform: { additional: "Extra", override: true },
      },
    ]
    const results = await batchExecutor.executeBatch(
      defaultServerIdentity,
      operations,
      { ...defaultOptions, maxConcurrent: 2 }
    )
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      tool: "tool-step1",
      success: true,
      result: { type: "text", text: "First" },
    })
    // Verify that the transform object was merged into the arguments.
    const secondCall = callToolMock.mock.calls[1][0]
    expect(secondCall.name).toBe("tool-step2")
    expect(secondCall.arguments).toEqual({
      base: "Base",
      additional: "Extra",
      override: true,
    })
  })

  it("throws error for unresolved dependencies (cyclic dependency)", async () => {
    const operations: Operation[] = [
      { id: "step1", tool: "tool1", arguments: {}, dependsOn: "step2" },
      { id: "step2", tool: "tool2", arguments: {}, dependsOn: "step1" },
    ]
    await expect(
      batchExecutor.executeBatch(
        defaultServerIdentity,
        operations,
        defaultOptions
      )
    ).rejects.toThrow(/Unresolved or cyclic dependencies in operations/)
  })
})

/* =====================
   BatchExecutor - Connection Cleanup and KeepAlive
===================== */
describe("BatchExecutor - Connection Cleanup and KeepAlive", () => {
  const identity: ServerIdentity = {
    name: "cleanup-server",
    serverType: { type: "generic", config: {} },
    transport: { type: "websocket", url: "ws://localhost:3000" },
  }
  const options = {
    maxConcurrent: 2,
    timeoutMs: 30000,
    stopOnError: false,
    keepAlive: false,
  }

  beforeEach(() => {
    jest.spyOn(Client.prototype, "connect").mockResolvedValue(undefined)
    jest.spyOn(Client.prototype, "close").mockResolvedValue(undefined)
    jest.spyOn(Client.prototype, "request").mockResolvedValue({})
    jest
      .spyOn(Client.prototype, "callTool")
      .mockResolvedValue({ type: "text", text: "result" })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("closes connection after batch execution if keepAlive is false", async () => {
    const closeSpy = jest.spyOn(connectionManager, "closeConnection")
    await batchExecutor.executeBatch(identity, [], options)
    expect(closeSpy).toHaveBeenCalledWith(
      connectionManager.createKeyForIdentity(identity)
    )
  })
})
