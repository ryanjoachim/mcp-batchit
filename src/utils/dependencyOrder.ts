import { Operation } from "../types/schemas/batch.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

/**
 * Validates that all dependsOn references point to IDs that exist in the operation set.
 * Throws McpError(InvalidParams) if any reference is unknown.
 */
export function validateDependsOnReferences(operations: Operation[]): void {
  const knownIds = new Set<string>()
  for (const op of operations) {
    if (op.id) {
      if (knownIds.has(op.id)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Duplicate operation ID: "${op.id}". Each operation ID must be unique.`
        )
      }
      knownIds.add(op.id)
    }
  }

  for (const op of operations) {
    if (!op.dependsOn) continue
    const deps = Array.isArray(op.dependsOn) ? op.dependsOn : [op.dependsOn]
    for (const dep of deps) {
      if (!knownIds.has(dep)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `dependsOn references unknown operation ID: "${dep}". ` +
            `Known IDs: [${Array.from(knownIds).join(", ")}]`
        )
      }
    }
  }
}

/**
 * Creates ordered batches of operations based on dependencies
 */
export function createOrderedBatches(operations: Operation[]): Operation[][] {
  const batches: Operation[][] = []
  const completed = new Set<string>()
  const idMapping = new Map<string, Operation>()

  // Get all operations with IDs
  operations
    .filter((op) => op.id)
    .forEach((op) => {
      idMapping.set(op.id!, op)
    })

  // Get operations with no dependencies first
  // Note: validateDependsOnReferences() must be called before this function
  // to ensure all dependsOn IDs exist in the operation set.
  let currentBatch = operations.filter((op) => {
    if (!op.dependsOn) return true

    const deps = Array.isArray(op.dependsOn) ? op.dependsOn : [op.dependsOn]
    // All deps are validated, so any reference not in idMapping means
    // it refers to an operation without an explicit ID — treat as ready
    return deps.every((dep) => !idMapping.has(dep))
  })

  // Add first batch if not empty
  if (currentBatch.length > 0) {
    batches.push(currentBatch)

    // Mark these operations as completed
    currentBatch.forEach((op) => {
      if (op.id) completed.add(op.id)
    })
  }

  // Continue until all operations are ordered
  const remaining = operations.filter((op) => !currentBatch.includes(op))

  while (remaining.length > 0) {
    currentBatch = remaining.filter((op) => {
      if (!op.dependsOn) return true

      const deps = Array.isArray(op.dependsOn) ? op.dependsOn : [op.dependsOn]
      return deps.every((dep) => completed.has(dep) || !idMapping.has(dep))
    })

    // If no operations can be added, we have a circular dependency
    if (currentBatch.length === 0) {
      throw new Error("Circular dependency detected in operations")
    }

    // Add batch and mark as completed
    batches.push(currentBatch)

    // Guard against unbounded dependency chains
    if (batches.length > 50) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Dependency chain exceeds maximum depth of 50"
      )
    }

    currentBatch.forEach((op) => {
      if (op.id) completed.add(op.id)

      // Remove from remaining
      const index = remaining.indexOf(op)
      if (index >= 0) remaining.splice(index, 1)
    })
  }

  return batches
}
