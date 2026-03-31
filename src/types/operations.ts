/**
 * Re-export types from the consolidated type system
 */
import {
  Operation,
  OperationResult,
  BatchOptions as BatchExecutionOptions,
} from "./schemas/batch.js"
import {
  ContentModification,
  ContentTrackingOptions,
} from "./filesystem/contentTracking.js"

export { Operation, OperationResult, BatchExecutionOptions }
export { ContentModification, ContentTrackingOptions }

/**
 * Operation arguments with template support
 */
export interface TemplateArguments {
  template?: string
  content?: unknown
  [key: string]: unknown
}

/**
 * Operation with content tracking details
 */
export interface ContentTrackingOperation extends Operation {
  contentTracking?: ContentTrackingOptions
}

/**
 * Operation result with content tracking details
 */
export interface ContentTrackingResult extends OperationResult {
  contentModification?: ContentModification
}

/**
 * Operation with template support.
 * Used primarily with write_file and update_file tools.
 */
export interface TemplateOperation extends Operation {
  arguments: Record<string, unknown> & {
    /**
     * Template string for dynamic content generation.
     * Can reference results from previous operations using ${results.operationId}
     */
    template?: string
  }
}
