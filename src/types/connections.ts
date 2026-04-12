import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { ChildProcess } from "child_process"
import { Provider } from "../providers/factory.js"
import { ServerIdentity } from "./schemas/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

/**
 * Union type for all supported MCP client transports
 */
export type ClientTransport =
  | WebSocketClientTransport
  | StdioClientTransport
  | StreamableHTTPClientTransport

/**
 * Base interface for all connection types
 */
export interface BaseConnection {
  type: string
  lastUsed: number
  identity: ServerIdentity
}

/**
 * Transport-based connection using MCP client
 */
export interface TransportConnection extends BaseConnection {
  type: "transport"
  client: Client
  transport: ClientTransport
  childProcess?: ChildProcess
  provider?: never
}

/**
 * Provider-based connection using internal implementation
 */
export interface ProviderConnection extends BaseConnection {
  type: "provider"
  provider: Provider
  /** Underlying FileSystem for internal providers, used to share the batch's ResultsCache */
  fileSystem?: import("../filesystem/FileSystem.js").FileSystem
  client?: never
  transport?: never
  childProcess?: never
}

/**
 * Union type of all connection types
 */
export type ServerConnection = TransportConnection | ProviderConnection

/**
 * Type guard for TransportConnection
 */
export function isTransportConnection(
  conn: ServerConnection
): conn is TransportConnection {
  return conn.type === "transport"
}

/**
 * Type guard for ProviderConnection
 */
export function isProviderConnection(
  conn: ServerConnection
): conn is ProviderConnection {
  return conn.type === "provider"
}

/**
 * Helper to create a transport connection
 */
export function createTransportConnection(
  client: Client,
  transport: ClientTransport,
  identity: ServerIdentity,
  childProcess?: ChildProcess
): TransportConnection {
  return {
    type: "transport",
    client,
    transport,
    childProcess,
    lastUsed: Date.now(),
    identity,
  }
}

/**
 * Helper to create a provider connection
 */
export function createProviderConnection(
  provider: Provider,
  identity: ServerIdentity,
  fileSystem?: import("../filesystem/FileSystem.js").FileSystem
): ProviderConnection {
  return {
    type: "provider",
    provider,
    fileSystem,
    lastUsed: Date.now(),
    identity,
  }
}
