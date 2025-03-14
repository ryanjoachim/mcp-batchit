import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { ChildProcess } from "child_process"
import { Provider } from "../providers/factory.js"
import { ServerIdentity } from "./schemas/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js"

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
  transport: WebSocketClientTransport | StdioClientTransport
  childProcess?: ChildProcess
  provider?: never
}

/**
 * Provider-based connection using internal implementation
 */
export interface ProviderConnection extends BaseConnection {
  type: "provider"
  provider: Provider
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
export function isTransportConnection(conn: ServerConnection): conn is TransportConnection {
  return conn.type === "transport"
}

/**
 * Type guard for ProviderConnection
 */
export function isProviderConnection(conn: ServerConnection): conn is ProviderConnection {
  return conn.type === "provider"
}

/**
 * Helper to create a transport connection
 */
export function createTransportConnection(
  client: Client,
  transport: WebSocketClientTransport | StdioClientTransport,
  identity: ServerIdentity,
  childProcess?: ChildProcess
): TransportConnection {
  return {
    type: "transport",
    client,
    transport,
    childProcess,
    lastUsed: Date.now(),
    identity
  }
}

/**
 * Helper to create a provider connection
 */
export function createProviderConnection(
  provider: Provider,
  identity: ServerIdentity
): ProviderConnection {
  return {
    type: "provider",
    provider,
    lastUsed: Date.now(),
    identity
  }
}
