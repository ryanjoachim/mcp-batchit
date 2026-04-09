// Re-export everything from individual schema modules
export * from "./serverType.js"
export * from "./transport.js"
export * from "./batch.js"

// Export common type combinations
import { ServerType } from "./serverType.js"
import { TransportConfig } from "./transport.js"

/**
 * Server identity combining server type and transport
 */
export interface ServerIdentity {
  name: string
  serverType: ServerType
  transport?: TransportConfig
  maxIdleTimeMs?: number
}

/**
 * Common response types
 */
export interface HPCContentItem {
  type: string
  text?: string
}

export interface HPCErrorResponse {
  isError: true
  error?: string
  message?: string
  content?: HPCContentItem[]
}

export function isHPCErrorResponse(value: unknown): value is HPCErrorResponse {
  return (
    value !== null &&
    typeof value === "object" &&
    "isError" in value &&
    value.isError === true
  )
}
