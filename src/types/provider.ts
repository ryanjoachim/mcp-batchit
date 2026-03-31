export type ProviderType = "batchit-internal" | "external"

export interface ServerIdentity {
  name: string
  serverType: {
    type: string
    config: {
      rootDirectory?: string
      provider?: ProviderType
    }
  }
  transport?: {
    type: "stdio" | "websocket"
    [key: string]: unknown
  }
}
