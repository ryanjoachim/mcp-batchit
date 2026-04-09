import { describe, test, expect } from "@jest/globals"
import {
  createOrderedBatches,
  validateDependsOnReferences,
} from "../dependencyOrder.js"
import { Operation } from "../../types/schemas/batch.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

describe("validateDependsOnReferences", () => {
  test("passes when all dependsOn IDs exist in the operation set", () => {
    const operations: Operation[] = [
      { tool: "read_file", arguments: { path: "/a" }, id: "step1" },
      {
        tool: "read_file",
        arguments: { path: "/b" },
        id: "step2",
        dependsOn: "step1",
      },
      {
        tool: "write_file",
        arguments: { path: "/c", content: "out" },
        id: "step3",
        dependsOn: ["step1", "step2"],
      },
    ]

    expect(() => validateDependsOnReferences(operations)).not.toThrow()
  })

  test("passes when operations have no dependsOn", () => {
    const operations: Operation[] = [
      { tool: "read_file", arguments: { path: "/a" }, id: "step1" },
      { tool: "read_file", arguments: { path: "/b" }, id: "step2" },
    ]

    expect(() => validateDependsOnReferences(operations)).not.toThrow()
  })

  test("throws McpError for unknown dependsOn ID (string)", () => {
    const operations: Operation[] = [
      { tool: "read_file", arguments: { path: "/a" }, id: "step1" },
      {
        tool: "read_file",
        arguments: { path: "/b" },
        id: "step2",
        dependsOn: "nonexistent",
      },
    ]

    expect(() => validateDependsOnReferences(operations)).toThrow()
    try {
      validateDependsOnReferences(operations)
    } catch (error) {
      expect(error).toBeInstanceOf(McpError)
      expect((error as McpError).code).toBe(ErrorCode.InvalidParams)
      expect((error as McpError).message).toContain("nonexistent")
    }
  })

  test("throws McpError for unknown dependsOn ID (array)", () => {
    const operations: Operation[] = [
      { tool: "read_file", arguments: { path: "/a" }, id: "step1" },
      {
        tool: "read_file",
        arguments: { path: "/b" },
        id: "step2",
        dependsOn: ["step1", "typo_id"],
      },
    ]

    expect(() => validateDependsOnReferences(operations)).toThrow()
    try {
      validateDependsOnReferences(operations)
    } catch (error) {
      expect(error).toBeInstanceOf(McpError)
      expect((error as McpError).message).toContain("typo_id")
    }
  })

  test("handles mixed valid and invalid dependsOn in array", () => {
    const operations: Operation[] = [
      { tool: "read_file", arguments: { path: "/a" }, id: "step1" },
      {
        tool: "write_file",
        arguments: { path: "/b", content: "x" },
        id: "step2",
        dependsOn: ["step1", "missing_id"],
      },
    ]

    expect(() => validateDependsOnReferences(operations)).toThrow()
  })
})

describe("createOrderedBatches", () => {
  test("creates single batch for operations with no dependencies", () => {
    const operations: Operation[] = [
      { tool: "read_file", arguments: { path: "/a" }, id: "step1" },
      { tool: "read_file", arguments: { path: "/b" }, id: "step2" },
      { tool: "read_file", arguments: { path: "/c" }, id: "step3" },
    ]

    const batches = createOrderedBatches(operations)
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(3)
  })

  test("creates ordered batches based on dependencies", () => {
    const operations: Operation[] = [
      { tool: "read_file", arguments: { path: "/a" }, id: "step1" },
      {
        tool: "read_file",
        arguments: { path: "/b" },
        id: "step2",
        dependsOn: "step1",
      },
      {
        tool: "write_file",
        arguments: { path: "/c", content: "out" },
        id: "step3",
        dependsOn: "step2",
      },
    ]

    const batches = createOrderedBatches(operations)
    expect(batches).toHaveLength(3)
    expect(batches[0][0].id).toBe("step1")
    expect(batches[1][0].id).toBe("step2")
    expect(batches[2][0].id).toBe("step3")
  })

  test("creates parallel batches for independent operations after a dependency", () => {
    const operations: Operation[] = [
      { tool: "read_file", arguments: { path: "/a" }, id: "step1" },
      {
        tool: "write_file",
        arguments: { path: "/b", content: "x" },
        id: "step2",
        dependsOn: "step1",
      },
      {
        tool: "write_file",
        arguments: { path: "/c", content: "y" },
        id: "step3",
        dependsOn: "step1",
      },
    ]

    const batches = createOrderedBatches(operations)
    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(1)
    expect(batches[1]).toHaveLength(2)
  })

  test("detects circular dependencies", () => {
    const operations: Operation[] = [
      {
        tool: "read_file",
        arguments: { path: "/a" },
        id: "step1",
        dependsOn: "step2",
      },
      {
        tool: "read_file",
        arguments: { path: "/b" },
        id: "step2",
        dependsOn: "step1",
      },
    ]

    expect(() => createOrderedBatches(operations)).toThrow(
      "Circular dependency"
    )
  })

  test("handles string and array dependsOn formats", () => {
    const operations: Operation[] = [
      { tool: "read_file", arguments: { path: "/a" }, id: "step1" },
      {
        tool: "read_file",
        arguments: { path: "/b" },
        id: "step2",
        dependsOn: "step1",
      },
      {
        tool: "read_file",
        arguments: { path: "/c" },
        id: "step3",
        dependsOn: ["step1", "step2"],
      },
    ]

    const batches = createOrderedBatches(operations)
    expect(batches).toHaveLength(3)
  })

  test("handles operations without IDs", () => {
    const operations: Operation[] = [
      { tool: "read_file", arguments: { path: "/a" } },
      { tool: "read_file", arguments: { path: "/b" } },
    ]

    const batches = createOrderedBatches(operations)
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(2)
  })
})
