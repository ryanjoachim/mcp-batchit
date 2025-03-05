
import { PathValidationError, PathErrorType } from "../../validation/pathValidationError.js"
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js"

/**
 * Base class for memory bank errors.
 */
export class MemoryBankError extends PathValidationError {
  constructor(public code: ErrorCode, message: string) {
    super(PathErrorType.MemoryBankOperation, message)
  }
}

/**
 * Error class for memory bank validation errors.
 */
export class MemoryBankValidationError extends MemoryBankError {
  constructor(message: string) {
    super(ErrorCode.InvalidParams, message)
    this.name = 'MemoryBankValidationError'
  }
}

/**
 * Error class for memory bank file errors.
 */
export class MemoryBankFileError extends MemoryBankError {
  constructor(message: string) {
    super(ErrorCode.InvalidParams, message)
    this.name = 'MemoryBankFileError'
  }
}

/**
 * Error class for memory bank operation errors.
 */
export class MemoryBankOperationError extends MemoryBankError {
  constructor(message: string) {
    super(ErrorCode.InvalidParams, message)
    this.name = 'MemoryBankOperationError'
  }
}
