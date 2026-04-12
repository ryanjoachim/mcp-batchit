import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { isTransientError, withRecovery } from "../recovery.js"

describe("recovery", () => {
  describe("isTransientError", () => {
    it("identifies non-transient McpErrors correctly", () => {
      const invalidParamsError = new McpError(
        ErrorCode.InvalidParams,
        "Invalid parameter"
      )
      const invalidRequestError = new McpError(
        ErrorCode.InvalidRequest,
        "Invalid request"
      )
      const methodNotFoundError = new McpError(
        ErrorCode.MethodNotFound,
        "Method not found"
      )
      const parseError = new McpError(ErrorCode.ParseError, "Parse error")

      expect(isTransientError(invalidParamsError)).toBe(false)
      expect(isTransientError(invalidRequestError)).toBe(false)
      expect(isTransientError(methodNotFoundError)).toBe(false)
      expect(isTransientError(parseError)).toBe(false)
    })

    it("identifies transient McpErrors correctly", () => {
      const connectionClosedError = new McpError(
        ErrorCode.ConnectionClosed,
        "Connection closed"
      )
      const timeoutError = new McpError(
        ErrorCode.RequestTimeout,
        "Request timeout"
      )

      expect(isTransientError(connectionClosedError)).toBe(true)
      expect(isTransientError(timeoutError)).toBe(true)
    })

    it("identifies transient InternalErrors based on message content", () => {
      const timeoutInternalError = new McpError(
        ErrorCode.InternalError,
        "Operation timeout occurred"
      )
      const connectionInternalError = new McpError(
        ErrorCode.InternalError,
        "Connection issue detected"
      )
      const networkInternalError = new McpError(
        ErrorCode.InternalError,
        "Network problem occurred"
      )
      const genericInternalError = new McpError(
        ErrorCode.InternalError,
        "Some other internal error"
      )

      expect(isTransientError(timeoutInternalError)).toBe(true)
      expect(isTransientError(connectionInternalError)).toBe(true)
      expect(isTransientError(networkInternalError)).toBe(true)
      expect(isTransientError(genericInternalError)).toBe(false)
    })

    it("identifies transient InternalErrors via data.errorCode", () => {
      const eagainWrapped = new McpError(
        ErrorCode.InternalError,
        "Resource error: temporarily unavailable",
        { errorCode: "EAGAIN" }
      )
      const econnresetWrapped = new McpError(
        ErrorCode.InternalError,
        "Resource error: connection reset",
        { errorCode: "ECONNRESET" }
      )
      const econnrefusedWrapped = new McpError(
        ErrorCode.InternalError,
        "Resource error: connection refused",
        { errorCode: "ECONNREFUSED" }
      )

      expect(isTransientError(eagainWrapped)).toBe(true)
      expect(isTransientError(econnresetWrapped)).toBe(true)
      expect(isTransientError(econnrefusedWrapped)).toBe(true)
    })

    it("does not misclassify non-transient errorCode in InternalError", () => {
      const enoentWrapped = new McpError(
        ErrorCode.InternalError,
        "Resource error: not found",
        { errorCode: "ENOENT" }
      )
      expect(isTransientError(enoentWrapped)).toBe(false)
    })

    it("identifies transient Node.js errors correctly", () => {
      const connectionResetError = new Error("Connection reset")
      ;(connectionResetError as any).code = "ECONNRESET"

      const connectionRefusedError = new Error("Connection refused")
      ;(connectionRefusedError as any).code = "ECONNREFUSED"

      const timeoutError = new Error("Timeout")
      ;(timeoutError as any).code = "ETIMEDOUT"

      const resourceError = new Error("Resource temporarily unavailable")
      ;(resourceError as any).code = "EAGAIN"

      expect(isTransientError(connectionResetError)).toBe(true)
      expect(isTransientError(connectionRefusedError)).toBe(true)
      expect(isTransientError(timeoutError)).toBe(true)
      expect(isTransientError(resourceError)).toBe(true)
    })

    it("identifies non-transient Node.js errors correctly", () => {
      const notFoundError = new Error("File not found")
      ;(notFoundError as any).code = "ENOENT"

      const permissionError = new Error("Permission denied")
      ;(permissionError as any).code = "EACCES"

      expect(isTransientError(notFoundError)).toBe(false)
      expect(isTransientError(permissionError)).toBe(false)
    })

    it("treats unknown errors as non-transient by default", () => {
      const unknownError = new Error("Unknown error")
      const stringError = "String error"

      expect(isTransientError(unknownError)).toBe(false)
      expect(isTransientError(stringError)).toBe(false)
    })
  })

  describe("withRecovery", () => {
    it("returns the operation result on success", async () => {
      const operation = jest.fn().mockResolvedValue("success")
      const result = await withRecovery(operation)

      expect(result).toBe("success")
      expect(operation).toHaveBeenCalledTimes(1)
    })

    it("does not retry non-transient errors", async () => {
      const nonTransientError = new McpError(
        ErrorCode.InvalidParams,
        "Invalid parameter"
      )
      const operation = jest.fn().mockRejectedValue(nonTransientError)

      await expect(withRecovery(operation)).rejects.toThrow(nonTransientError)
      expect(operation).toHaveBeenCalledTimes(1)
    })

    it("preserves error context when configured", async () => {
      // Use a non-transient error to avoid retries
      const originalError = new Error("Original error")
      ;(originalError as any).code = "ENOENT" // Non-transient error code

      const operation = jest.fn().mockRejectedValue(originalError)

      try {
        await withRecovery(operation, {
          preserveContext: true,
        })
        fail("Should have thrown an error")
      } catch (error) {
        expect(error).toBeInstanceOf(McpError)
        const mcpError = error as McpError
        expect(mcpError.message).toContain("Non-retryable error")
        expect((mcpError as any).data.originalError).toBe(originalError)
      }
    })

    it("retries and succeeds after transient failures", async () => {
      const transientError = new Error("Connection reset")
      ;(transientError as any).code = "ECONNRESET"

      const operation = jest
        .fn()
        .mockRejectedValueOnce(transientError)
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce("recovered")

      const result = await withRecovery(operation, {
        initialDelay: 10,
        backoffFactor: 1,
        maxDelay: 10,
      })

      expect(result).toBe("recovered")
      expect(operation).toHaveBeenCalledTimes(3)
    })

    it("exhausts max retries for persistent transient errors", async () => {
      const transientError = new Error("Connection reset")
      ;(transientError as any).code = "ECONNRESET"

      const operation = jest.fn().mockRejectedValue(transientError)

      try {
        await withRecovery(operation, {
          maxRetries: 2,
          initialDelay: 10,
          backoffFactor: 1,
          maxDelay: 10,
        })
        fail("Should have thrown an error")
      } catch (error) {
        expect(error).toBeInstanceOf(McpError)
        const mcpError = error as McpError
        expect(mcpError.message).toContain("Operation failed after 2 retries")
        // maxRetries=2 means 2 retry attempts after the initial failure = 2 total calls
        expect(operation).toHaveBeenCalledTimes(2)
      }
    })
  })
})
