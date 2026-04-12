import { describe, test, expect, beforeEach } from "@jest/globals"
import { ConnectionManager, VERSION } from "../ConnectionManager.js"
import { FileSystem } from "../../filesystem/FileSystem.js"
import { ServerIdentity } from "../../types/schemas/index.js"
import os from "os"

describe("ConnectionManager", () => {
  let connectionManager: ConnectionManager

  beforeEach(() => {
    const defaultFileSystem = new FileSystem({ rootDirectory: os.tmpdir() })
    connectionManager = new ConnectionManager(defaultFileSystem)
  })

  const makeIdentity = (name: string, rootDir: string): ServerIdentity => ({
    name,
    serverType: {
      type: "filesystem",
      config: { provider: "batchit-internal" as const, rootDirectory: rootDir },
    },
  })

  describe("createKeyForIdentity", () => {
    test("creates consistent keys for the same identity", () => {
      const identity = makeIdentity("test-server", "/tmp")

      const key1 = connectionManager.createKeyForIdentity(identity)
      const key2 = connectionManager.createKeyForIdentity(identity)
      expect(key1).toBe(key2)
    })

    test("creates different keys for different identities", () => {
      const identity1 = makeIdentity("server-a", "/tmp")
      const identity2 = makeIdentity("server-b", "/tmp")

      const key1 = connectionManager.createKeyForIdentity(identity1)
      const key2 = connectionManager.createKeyForIdentity(identity2)
      expect(key1).not.toBe(key2)
    })

    test("includes transport config in the key", () => {
      const identity1: ServerIdentity = {
        name: "server",
        serverType: {
          type: "filesystem",
          config: { provider: "batchit-internal", rootDirectory: "/tmp" },
        },
        transport: { type: "stdio" as const, command: "node", args: ["a.js"] },
      }
      const identity2: ServerIdentity = {
        name: "server",
        serverType: {
          type: "filesystem",
          config: { provider: "batchit-internal", rootDirectory: "/tmp" },
        },
        transport: { type: "stdio" as const, command: "node", args: ["b.js"] },
      }

      const key1 = connectionManager.createKeyForIdentity(identity1)
      const key2 = connectionManager.createKeyForIdentity(identity2)
      expect(key1).not.toBe(key2)
    })
  })

  describe("getOrCreateConnection", () => {
    test("creates a provider connection for batchit-internal", async () => {
      const identity = makeIdentity("local-fs", os.tmpdir())

      const conn = await connectionManager.getOrCreateConnection(identity)
      expect(conn).toBeDefined()
      expect(conn.identity).toBe(identity)
    })

    test("reuses existing connection for the same identity", async () => {
      const identity = makeIdentity("local-fs", os.tmpdir())

      const conn1 = await connectionManager.getOrCreateConnection(identity)
      const conn2 = await connectionManager.getOrCreateConnection(identity)
      expect(conn1).toBe(conn2)
    })

    test("throws for external provider without transport config", async () => {
      const identity: ServerIdentity = {
        name: "external-server",
        serverType: {
          type: "filesystem",
          config: { provider: "external" as const, rootDirectory: "/tmp" },
        },
      }

      await expect(
        connectionManager.getOrCreateConnection(identity)
      ).rejects.toThrow("transport configuration")
    })
  })

  describe("closeConnection", () => {
    test("removes provider connection after closing", async () => {
      const identity = makeIdentity("local-fs", os.tmpdir())

      await connectionManager.getOrCreateConnection(identity)
      const key = connectionManager.createKeyForIdentity(identity)
      await connectionManager.closeConnection(key)

      // Creating again should create a new connection (not reused)
      const conn = await connectionManager.getOrCreateConnection(identity)
      expect(conn).toBeDefined()
    })
  })

  describe("closeAll", () => {
    test("closes all connections", async () => {
      const identity1 = makeIdentity("local-fs-1", os.tmpdir())
      const identity2 = makeIdentity("local-fs-2", os.tmpdir())

      await connectionManager.getOrCreateConnection(identity1)
      await connectionManager.getOrCreateConnection(identity2)
      await connectionManager.closeAll()

      // Both should create new connections after closeAll
      const conn1 = await connectionManager.getOrCreateConnection(identity1)
      const conn2 = await connectionManager.getOrCreateConnection(identity2)
      expect(conn1).toBeDefined()
      expect(conn2).toBeDefined()
    })
  })
})

describe("VERSION", () => {
  test("is a valid semver string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
