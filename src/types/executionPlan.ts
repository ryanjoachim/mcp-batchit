import type { Operation } from './config.js';

/**
 * Map containing information about data dependencies between operations.
 */
export interface DataFlowMap {
  // Maps operation IDs to their dependent operation IDs
  dependencies: Map<string, string[]>;
  // Maps operation IDs to their output type (tool name)
  outputTypes: Map<string, string>;
  // Maps operation IDs to their input types (tool names of dependencies)
  inputTypes: Map<string, string[]>;
}

/**
 * Represents a plan for executing batch operations.
 */
export interface ExecutionPlan {
  // Operations grouped by execution order
  batches: Operation[][];
  // Information about data dependencies between operations
  dataFlowMap: DataFlowMap;
}
