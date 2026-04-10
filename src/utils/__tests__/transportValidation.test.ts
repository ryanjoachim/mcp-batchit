/**
 * @fileoverview
 * Tests for transport validation functions.
 * Covers validateStdioCommand, validateWebSocketUrl, validateStreamableHttpUrl,
 * validateTransport, and getTransportConfig.
 */

import { describe, test, expect } from "@jest/globals"
import { McpError } from "@modelcontextprotocol/sdk/types.js"
import {
  validateStdioCommand,
  validateWebSocketUrl,
  validateStreamableHttpUrl,
  validateTransport,
  getTransportConfig,
  SELF_REFERENCE_PATTERNS,
} from "../transportValidation.js"
import { TransportConfig } from "../../types/schemas/transport.js"

describe("validateStdioCommand", () => {
  test("should accept valid commands", () => {
    expect(() => validateStdioCommand("node", ["server.js"])).not.toThrow()
    expect(() =>
      validateStdioCommand("npx", [
        "-y",
        "@modelcontextprotocol/server-filesystem",
      ])
    ).not.toThrow()
    expect(() =>
      validateStdioCommand("python", ["-m", "mcp_server"])
    ).not.toThrow()
  })

  test("should reject self-referential commands matching patterns", () => {
    for (const pattern of SELF_REFERENCE_PATTERNS) {
      expect(() => validateStdioCommand(pattern)).toThrow(McpError)
      expect(() => validateStdioCommand("node", [pattern])).toThrow(McpError)
    }
  })

  test("should reject case-insensitive self-referential commands", () => {
    expect(() => validateStdioCommand("MCP-BATCHIT")).toThrow(McpError)
    expect(() => validateStdioCommand("BATCHIT")).toThrow(McpError)
  })
})

describe("validateWebSocketUrl", () => {
  test("should accept valid ws:// URLs", () => {
    expect(() => validateWebSocketUrl("ws://localhost:8080")).not.toThrow()
    expect(() => validateWebSocketUrl("ws://example.com/mcp")).not.toThrow()
  })

  test("should accept valid wss:// URLs", () => {
    expect(() => validateWebSocketUrl("wss://localhost:8080")).not.toThrow()
    expect(() =>
      validateWebSocketUrl("wss://secure.example.com/mcp")
    ).not.toThrow()
  })

  test("should reject non-WebSocket protocols", () => {
    expect(() => validateWebSocketUrl("http://localhost:8080")).toThrow(
      McpError
    )
    expect(() => validateWebSocketUrl("https://localhost:8080")).toThrow(
      McpError
    )
    expect(() => validateWebSocketUrl("ftp://localhost:8080")).toThrow(McpError)
  })

  test("should reject invalid URLs", () => {
    expect(() => validateWebSocketUrl("not a url")).toThrow(McpError)
    expect(() => validateWebSocketUrl("")).toThrow(McpError)
  })
})

describe("validateStreamableHttpUrl", () => {
  test("should accept valid http:// URLs", () => {
    expect(() =>
      validateStreamableHttpUrl("http://localhost:8080")
    ).not.toThrow()
    expect(() =>
      validateStreamableHttpUrl("http://example.com/mcp")
    ).not.toThrow()
  })

  test("should accept valid https:// URLs", () => {
    expect(() =>
      validateStreamableHttpUrl("https://localhost:8080")
    ).not.toThrow()
    expect(() =>
      validateStreamableHttpUrl("https://secure.example.com/mcp")
    ).not.toThrow()
  })

  test("should reject non-HTTP protocols", () => {
    expect(() => validateStreamableHttpUrl("ws://localhost:8080")).toThrow(
      McpError
    )
    expect(() => validateStreamableHttpUrl("wss://localhost:8080")).toThrow(
      McpError
    )
    expect(() => validateStreamableHttpUrl("ftp://localhost:8080")).toThrow(
      McpError
    )
  })

  test("should reject invalid URLs", () => {
    expect(() => validateStreamableHttpUrl("not a url")).toThrow(McpError)
    expect(() => validateStreamableHttpUrl("")).toThrow(McpError)
  })
})

describe("validateTransport", () => {
  test("should validate stdio transport with command", () => {
    const config: TransportConfig = {
      type: "stdio",
      command: "node",
      args: ["server.js"],
    }
    expect(() => validateTransport(config)).not.toThrow()
  })

  test("should reject stdio transport without command", () => {
    const config = { type: "stdio" as const, command: "" }
    expect(() => validateTransport(config)).toThrow(McpError)
  })

  test("should reject stdio transport with self-referential command", () => {
    const config: TransportConfig = {
      type: "stdio",
      command: "mcp-batchit",
    }
    expect(() => validateTransport(config)).toThrow(McpError)
  })

  test("should validate websocket transport with valid URL", () => {
    const config: TransportConfig = {
      type: "websocket",
      url: "ws://localhost:8080",
    }
    expect(() => validateTransport(config)).not.toThrow()
  })

  test("should reject websocket transport with invalid URL", () => {
    const config: TransportConfig = {
      type: "websocket",
      url: "http://localhost:8080",
    }
    expect(() => validateTransport(config)).toThrow(McpError)
  })

  test("should validate streamable-http transport with valid URL", () => {
    const config: TransportConfig = {
      type: "streamable-http",
      url: "http://localhost:8080/mcp",
    }
    expect(() => validateTransport(config)).not.toThrow()
  })

  test("should reject streamable-http transport with invalid URL", () => {
    const config: TransportConfig = {
      type: "streamable-http",
      url: "ws://localhost:8080",
    }
    expect(() => validateTransport(config)).toThrow(McpError)
  })
})

describe("getTransportConfig", () => {
  test("should return undefined for batchit-internal provider", () => {
    const result = getTransportConfig({
      name: "local",
      serverType: {
        type: "filesystem",
        config: {
          rootDirectory: "/tmp",
          provider: "batchit-internal",
        },
      },
    })
    expect(result).toBeUndefined()
  })

  test("should throw for external provider without transport", () => {
    expect(() =>
      getTransportConfig({
        name: "external",
        serverType: {
          type: "filesystem",
          config: {
            rootDirectory: "/tmp",
            provider: "external",
          },
        },
      })
    ).toThrow(McpError)
  })

  test("should return transport config for external provider with transport", () => {
    const transport: TransportConfig = {
      type: "stdio",
      command: "node",
      args: ["server.js"],
    }
    const result = getTransportConfig({
      name: "external",
      serverType: {
        type: "filesystem",
        config: {
          rootDirectory: "/tmp",
          provider: "external",
        },
      },
      transport,
    })
    expect(result).toEqual(transport)
  })

  test("should return transport config for websocket transport", () => {
    const transport: TransportConfig = {
      type: "websocket",
      url: "ws://localhost:8080",
    }
    const result = getTransportConfig({
      name: "ws-server",
      serverType: {
        type: "filesystem",
        config: {
          rootDirectory: "/tmp",
          provider: "external",
        },
      },
      transport,
    })
    expect(result).toEqual(transport)
  })

  test("should return transport config for streamable-http transport", () => {
    const transport: TransportConfig = {
      type: "streamable-http",
      url: "http://localhost:8080/mcp",
    }
    const result = getTransportConfig({
      name: "http-server",
      serverType: {
        type: "filesystem",
        config: {
          rootDirectory: "/tmp",
          provider: "external",
        },
      },
      transport,
    })
    expect(result).toEqual(transport)
  })
})
