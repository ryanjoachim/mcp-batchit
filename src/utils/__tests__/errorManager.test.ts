import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { ErrorManager } from "../errorManager.js"

describe("ErrorManager", () => {
  describe("formatValidationError", () => {
    it("formats validation errors correctly", () => {
      const message = ErrorManager.formatValidationError(
        "parameter",
        "must be a string"
      )
      expect(message).toBe("Invalid parameter: must be a string")
    })
  })

  describe("createNotFoundError", () => {
    it("creates not found errors with correct code and message", () => {
      const error = ErrorManager.createNotFoundError("File", "/test.txt")
      expect(error).toBeInstanceOf(McpError)
      expect(error.code).toBe(ErrorCode.InvalidParams)
      expect(error.message).toContain("File not found: /test.txt")
    })
  })

  describe("createAlreadyExistsError", () => {
    it("creates already exists errors with correct code and message", () => {
      const error = ErrorManager.createAlreadyExistsError("File", "/test.txt")
      expect(error).toBeInstanceOf(McpError)
      expect(error.code).toBe(ErrorCode.InvalidParams)
      expect(error.message).toContain("File already exists: /test.txt")
    })
  })

  describe("createInvalidFormatError", () => {
    it("creates invalid format errors with correct code and message", () => {
      const error = ErrorManager.createInvalidFormatError(
        "JSON",
        "missing closing brace"
      )
      expect(error).toBeInstanceOf(McpError)
      expect(error.code).toBe(ErrorCode.InvalidParams)
      expect(error.message).toContain(
        "Invalid JSON format: missing closing brace"
      )
    })
  })

  describe("createPermissionError", () => {
    it("creates permission errors with correct code and message", () => {
      const error = ErrorManager.createPermissionError("write", "/test.txt")
      expect(error).toBeInstanceOf(McpError)
      expect(error.code).toBe(ErrorCode.InvalidParams)
      expect(error.message).toContain(
        "Permission denied: Cannot write /test.txt"
      )
    })
  })

  describe("enhanceError", () => {
    it("adds context to existing McpError", () => {
      const original = new McpError(ErrorCode.InvalidParams, "Original error")
      const enhanced = ErrorManager.enhanceError(original, "additional context")
      expect(enhanced.message).toContain("Original error")
      expect(enhanced.message).toContain("additional context")
      expect(enhanced.code).toBe(original.code)
    })

    it("preserves metadata when enhancing errors", () => {
      const metadata = { detail: "test" }
      const original = new McpError(ErrorCode.InvalidParams, "Original error")
      const enhanced = ErrorManager.enhanceError(original, "context", metadata)
      expect(enhanced.message).toContain("Original error")
      expect(enhanced.message).toContain("context")
      expect(enhanced.code).toBe(original.code)
    })
  })

  describe("normalizeError", () => {
    it("preserves existing McpError instances without context", () => {
      const original = new McpError(ErrorCode.InvalidParams, "Original error")
      const normalized = ErrorManager.normalizeError(original, "")
      expect(normalized).toBe(original)
    })

    it("adds context to existing McpError when provided", () => {
      const original = new McpError(ErrorCode.InvalidParams, "Original error")
      const normalized = ErrorManager.normalizeError(original, "test context")
      expect(normalized.message).toContain("Original error")
      expect(normalized.message).toContain("test context")
    })

    it("converts Error instances to McpError", () => {
      const error = new Error("Test error")
      const normalized = ErrorManager.normalizeError(error, "test context")
      expect(normalized).toBeInstanceOf(McpError)
      expect(normalized.message).toContain("Test error")
    })

    it("handles Node.js specific errors", () => {
      const error = new Error("ENOENT: no such file")
      ;(error as any).code = "ENOENT"
      const normalized = ErrorManager.normalizeError(error, "test context")
      expect(normalized).toBeInstanceOf(McpError)
      expect(normalized.code).toBe(ErrorCode.InvalidParams)
      expect(normalized.message).toContain("no such file")
    })

    it("converts string errors to McpError", () => {
      const normalized = ErrorManager.normalizeError(
        "error message",
        "test context"
      )
      expect(normalized).toBeInstanceOf(McpError)
      expect(normalized.message).toContain("error message")
    })

    it("converts null/undefined to McpError", () => {
      const normalized = ErrorManager.normalizeError(null, "test context")
      expect(normalized).toBeInstanceOf(McpError)
      expect(normalized.message).toContain("null")
    })
  })

  describe("createPathValidationError", () => {
    it("creates path validation errors with correct code and message", () => {
      const error = ErrorManager.createPathValidationError(
        "/test.txt",
        "outside root directory"
      )
      expect(error).toBeInstanceOf(McpError)
      expect(error.code).toBe(ErrorCode.InvalidParams)
      expect(error.message).toContain(
        "Invalid path: /test.txt (outside root directory)"
      )
    })
  })

  describe("createMissingParamError", () => {
    it("creates missing parameter errors with correct code and message", () => {
      const error = ErrorManager.createMissingParamError("path")
      expect(error).toBeInstanceOf(McpError)
      expect(error.code).toBe(ErrorCode.InvalidParams)
      expect(error.message).toContain("Missing required parameter: path")
    })

    it("includes context when provided", () => {
      const error = ErrorManager.createMissingParamError(
        "path",
        "file operation"
      )
      expect(error.message).toContain(
        "Missing required parameter 'path' for file operation"
      )
    })
  })

  describe("getErrorMessage", () => {
    it("extracts message from Error instances", () => {
      expect(ErrorManager.getErrorMessage(new Error("test message"))).toBe(
        "test message"
      )
    })

    it("converts string values to themselves", () => {
      expect(ErrorManager.getErrorMessage("string error")).toBe("string error")
    })

    it("converts numbers to strings", () => {
      expect(ErrorManager.getErrorMessage(42)).toBe("42")
    })

    it("converts null to 'null'", () => {
      expect(ErrorManager.getErrorMessage(null)).toBe("null")
    })

    it("converts undefined to 'undefined'", () => {
      expect(ErrorManager.getErrorMessage(undefined)).toBe("undefined")
    })
  })
})
