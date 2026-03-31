import { Operation } from "../types/schemas/batch.js"

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
  let currentBatch = operations.filter((op) => {
    // No dependencies or unknown ID
    if (!op.dependsOn) return true

    // Convert to array of dependencies
    const deps = Array.isArray(op.dependsOn) ? op.dependsOn : [op.dependsOn]

    // If any dependency doesn't exist, include it anyway
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
    currentBatch.forEach((op) => {
      if (op.id) completed.add(op.id)

      // Remove from remaining
      const index = remaining.indexOf(op)
      if (index >= 0) remaining.splice(index, 1)
    })
  }

  return batches
}

/**
 * Validates that there are no circular dependencies
 */
export function validateDependencies(operations: Operation[]): void {
  try {
    createOrderedBatches(operations)
  } catch (error) {
    throw error
  }
}
