import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { mapToMcpError } from "../errorMapper.js"

describe("errorMapper", () => {
  describe("mapToMcpError", () => {
    it("returns the original error if it's already an McpError", () => {
      const originalError = new McpError(ErrorCode.InvalidParams, "Test error")
      const mappedError = mapToMcpError(originalError)
      expect(mappedError).toBe(originalError)
    })

    describe("File system errors", () => {
      it("maps ENOENT to InvalidParams", () => {
        const error = new Error("File not found")
        ;(error as any).code = "ENOENT"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.InvalidParams)
        expect(mappedError.message).toContain("File not found")
      })

      it("maps EACCES to InvalidParams with enhanced message", () => {
        const error = new Error("Permission denied")
        ;(error as any).code = "EACCES"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.InvalidParams)
        expect(mappedError.message).toContain(
          "Permission denied: Permission denied"
        )
      })

      it("maps EPERM to InvalidParams with enhanced message", () => {
        const error = new Error("Operation not permitted")
        ;(error as any).code = "EPERM"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.InvalidParams)
        expect(mappedError.message).toContain(
          "Permission denied: Operation not permitted"
        )
      })

      it("maps EEXIST to InvalidParams with enhanced message", () => {
        const error = new Error("File already exists")
        ;(error as any).code = "EEXIST"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.InvalidParams)
        expect(mappedError.message).toContain(
          "Resource already exists: File already exists"
        )
      })

      it("maps EISDIR to InvalidParams with enhanced message", () => {
        const error = new Error("Is a directory")
        ;(error as any).code = "EISDIR"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.InvalidParams)
        expect(mappedError.message).toContain(
          "Expected file but found directory: Is a directory"
        )
      })

      it("maps ENOTDIR to InvalidParams with enhanced message", () => {
        const error = new Error("Not a directory")
        ;(error as any).code = "ENOTDIR"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.InvalidParams)
        expect(mappedError.message).toContain(
          "Expected directory but found file: Not a directory"
        )
      })
    })

    describe("Timeout errors", () => {
      it("maps ETIMEDOUT to RequestTimeout", () => {
        const error = new Error("Connection timed out")
        ;(error as any).code = "ETIMEDOUT"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.RequestTimeout)
        expect(mappedError.message).toContain(
          "Operation timed out: Connection timed out"
        )
      })

      it("maps ESOCKETTIMEDOUT to RequestTimeout", () => {
        const error = new Error("Socket timed out")
        ;(error as any).code = "ESOCKETTIMEDOUT"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.RequestTimeout)
        expect(mappedError.message).toContain(
          "Operation timed out: Socket timed out"
        )
      })
    })

    describe("Connection errors", () => {
      it("maps ECONNREFUSED to ConnectionClosed", () => {
        const error = new Error("Connection refused")
        ;(error as any).code = "ECONNREFUSED"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.ConnectionClosed)
        expect(mappedError.message).toContain(
          "Connection error: Connection refused"
        )
      })

      it("maps ECONNRESET to ConnectionClosed", () => {
        const error = new Error("Connection reset")
        ;(error as any).code = "ECONNRESET"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.ConnectionClosed)
        expect(mappedError.message).toContain(
          "Connection error: Connection reset"
        )
      })
    })

    describe("Network errors", () => {
      it("maps EHOSTUNREACH to InternalError", () => {
        const error = new Error("Host unreachable")
        ;(error as any).code = "EHOSTUNREACH"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.InternalError)
        expect(mappedError.message).toContain("Network error: Host unreachable")
      })

      it("maps ENETUNREACH to InternalError", () => {
        const error = new Error("Network unreachable")
        ;(error as any).code = "ENETUNREACH"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.InternalError)
        expect(mappedError.message).toContain(
          "Network error: Network unreachable"
        )
      })
    })

    describe("Parse errors", () => {
      it("maps SyntaxError to ParseError", () => {
        const error = new SyntaxError("Unexpected token")
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.ParseError)
        expect(mappedError.message).toContain("Parse error: Unexpected token")
      })

      it("maps ERR_INVALID_ARG_TYPE to ParseError", () => {
        const error = new Error("Invalid argument type")
        ;(error as any).code = "ERR_INVALID_ARG_TYPE"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.ParseError)
        expect(mappedError.message).toContain(
          "Parse error: Invalid argument type"
        )
      })
    })

    describe("Resource errors", () => {
      it("maps EMFILE to InternalError", () => {
        const error = new Error("Too many open files")
        ;(error as any).code = "EMFILE"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.InternalError)
        expect(mappedError.message).toContain(
          "Resource error: Too many open files"
        )
      })

      it("maps ENOSPC to InternalError", () => {
        const error = new Error("No space left on device")
        ;(error as any).code = "ENOSPC"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.InternalError)
        expect(mappedError.message).toContain(
          "Resource error: No space left on device"
        )
      })
    })

    describe("Default error handling", () => {
      it("maps unknown errors to InternalError", () => {
        const error = new Error("Unknown error")
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.InternalError)
        expect(mappedError.message).toContain("Unknown error")
      })

      it("maps non-Error objects to InternalError", () => {
        const mappedError = mapToMcpError("String error")
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.InternalError)
        expect(mappedError.message).toContain("String error")
      })

      it("preserves error context in mapped errors", () => {
        const error = new Error("Test error")
        error.stack = "Error stack trace"
        ;(error as any).code = "CUSTOM_CODE"
        const mappedError = mapToMcpError(error)
        expect(mappedError).toBeInstanceOf(McpError)
        expect(mappedError.code).toBe(ErrorCode.InternalError)
        expect(mappedError.message).toContain("Test error")
        expect((mappedError as any).data.originalError).toBe(error)
        expect((mappedError as any).data.errorCode).toBe("CUSTOM_CODE")
        expect((mappedError as any).data.stack).toBe("Error stack trace")
      })
    })
  })
})
