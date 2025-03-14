/**
 * Represents a single operation to be executed
 */
export interface Operation {
  id?: string;
  tool: string;
  arguments?: Record<string, unknown> & {
    template?: string;
    content?: unknown;
  };
  dependsOn?: string | string[];
}

/**
 * Operation arguments with template support
 */
export interface TemplateArguments {
  template?: string;
  content?: unknown;
  [key: string]: unknown;
}

/**
 * Options for batch execution
 */
export interface BatchExecutionOptions {
  maxConcurrent?: number;
  timeoutMs?: number;
  stopOnError?: boolean;
}

/**
 * Result of an operation execution
 */
export interface OperationResult {
  id?: string;
  tool: string;
  success: boolean;
  result?: unknown;
  error?: string;
  errorCode?: number;
  durationMs?: number;
}

/**
 * Represents a file content modification
 */
export interface ContentModification {
  timestamp: string;
  path: string;
  operation: "create" | "update" | "delete";
  size?: number;
  type?: string;
  diff?: string;
}

/**
 * Options for content tracking
 */
export interface ContentTrackingOptions {
  enabled?: boolean;
  trackSize?: boolean;
  trackType?: boolean;
  trackDiff?: boolean;
  diffContextLines?: number;
}

/**
 * Operation with content tracking details
 */
export interface ContentTrackingOperation extends Operation {
  contentTracking?: ContentTrackingOptions;
}

/**
 * Operation result with content tracking details
 */
export interface ContentTrackingResult extends OperationResult {
  contentModification?: ContentModification;
}

/**
 * Operation with template support
 */
export interface TemplateOperation extends Operation {
  arguments?: Record<string, unknown> & {
    template?: string;
  };
}
