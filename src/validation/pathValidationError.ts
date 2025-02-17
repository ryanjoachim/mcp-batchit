
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

export enum PathErrorType {
    NotAbsolute = "NotAbsolute",
    OutsideRoot = "OutsideRoot",
    InvalidFormat = "InvalidFormat",
    SecurityViolation = "SecurityViolation",
    InvalidSymlink = "InvalidSymlink",
    BatchProcessingError = "BatchProcessingError",
    MarkdownValidation = "MarkdownValidation",
    ContentStructure = "ContentStructure",
    MemoryBankOperation = "MemoryBankOperation"
}

export class PathValidationError extends McpError {
    constructor(
        public subType: PathErrorType,
        message: string,
    ) {
        super(ErrorCode.InvalidParams, `Path validation error: ${message}`)
        this.name = "PathValidationError"
        Error.captureStackTrace(this, PathValidationError)
    }

    static create(type: PathErrorType, message: string): PathValidationError {
        return new PathValidationError(type, message)
    }

    static notAbsolute(path: string): PathValidationError {
        return new PathValidationError(
            PathErrorType.NotAbsolute,
            `Path must be absolute: ${path}`
        )
    }

    static outsideRoot(path: string, root: string): PathValidationError {
        return new PathValidationError(
            PathErrorType.OutsideRoot,
            `Path must be within root directory ${root}: ${path}`
        )
    }

    static invalidFormat(path: string, reason: string): PathValidationError {
        return new PathValidationError(
            PathErrorType.InvalidFormat,
            `Invalid path format - ${reason}: ${path}`
        )
    }

    static invalidSymlink(path: string, reason: string): PathValidationError {
        return new PathValidationError(
            PathErrorType.InvalidSymlink,
            `Invalid symbolic link - ${reason}: ${path}`
        )
    }

    static securityViolation(path: string, reason: string): PathValidationError {
        return new PathValidationError(
            PathErrorType.SecurityViolation,
            `Security violation - ${reason}: ${path}`
        )
    }

    static markdownError(path: string, reason: string): PathValidationError {
        return new PathValidationError(
            PathErrorType.MarkdownValidation,
            `Markdown validation failed - ${reason}: ${path}`
        )
    }

    static contentError(path: string, reason: string): PathValidationError {
        return new PathValidationError(
            PathErrorType.ContentStructure,
            `Content structure error - ${reason}: ${path}`
        )
    }
}
