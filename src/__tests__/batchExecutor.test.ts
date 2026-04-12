import { describe, test, expect, beforeEach } from "@jest/globals"
import { ResultsCache } from "../utils/resultsCache.js"
import { resolveResultReferences } from "../utils/resultResolver.js"
import { resolveTemplates } from "../utils/templateResolver.js"
import {
  validateDependsOnReferences,
  createOrderedBatches,
} from "../utils/dependencyOrder.js"
import { Operation } from "../types/schemas/batch.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

describe("Main executor integration: result reference resolution", () => {
  let cache: ResultsCache

  beforeEach(() => {
    cache = new ResultsCache()
  })

  test("resolves ${results.id} in string arguments", () => {
    cache.storeResult("read1", "Hello World")

    const resolved = resolveResultReferences(
      {
        content: "${results.read1}",
      },
      cache
    )

    expect(resolved.content).toBe("Hello World")
  })

  test("resolves ${results.id.property} in string arguments", () => {
    cache.storeResult("config", { version: "1.0", name: "test" })

    const resolved = resolveResultReferences(
      {
        version: "${results.config.version}",
      },
      cache
    )

    expect(resolved.version).toBe("1.0")
  })

  test("resolves embedded references within strings", () => {
    cache.storeResult("file1", "content-here")

    const resolved = resolveResultReferences(
      {
        path: "/output/${results.file1}.txt",
      },
      cache
    )

    expect(resolved.path).toBe("/output/content-here.txt")
  })

  test("throws for missing result references", () => {
    expect(() =>
      resolveResultReferences({ content: "${results.nonexistent}" }, cache)
    ).toThrow()
  })

  test("resolves multiple references in one value", () => {
    cache.storeResult("a", "hello")
    cache.storeResult("b", "world")

    // Test each reference individually first
    const resolved1 = resolveResultReferences({ msg: "${results.a}" }, cache)
    expect(resolved1.msg).toBe("hello")

    const resolved2 = resolveResultReferences({ msg: "${results.b}" }, cache)
    expect(resolved2.msg).toBe("world")

    // Now test both in one string
    const resolved = resolveResultReferences(
      {
        message: "${results.a} ${results.b}",
      },
      cache
    )

    expect(resolved.message).toBe("hello world")
  })
})

describe("Main executor integration: template resolution", () => {
  let cache: ResultsCache

  beforeEach(() => {
    cache = new ResultsCache()
  })

  test("resolves Handlebars templates in arguments", () => {
    const resolved = resolveTemplates(
      {
        template: "Upper: {{uppercase 'hello'}}",
      },
      cache
    )

    expect(resolved.content).toBe("Upper: HELLO")
    expect(resolved.template).toBeUndefined()
  })

  test("resolves templates with result references", () => {
    cache.storeResult("data", { name: "test" })

    // First resolve result references, then templates
    const step1 = resolveResultReferences(
      {
        template: "Name: {{json results.data}}",
      },
      cache
    )
    const step2 = resolveTemplates(step1, cache)

    expect(step2.content).toContain("test")
  })

  test("passes through arguments without templates unchanged", () => {
    const args = { path: "/some/file.txt", content: "plain content" }
    const resolved = resolveTemplates(args, cache)

    expect(resolved).toEqual(args)
  })
})

describe("Main executor integration: dependency ordering", () => {
  test("validates that all dependsOn IDs exist in the operation set", () => {
    const operations: Operation[] = [
      { tool: "read_file", arguments: { path: "/a" }, id: "step1" },
      {
        tool: "write_file",
        arguments: { path: "/b", content: "x" },
        id: "step2",
        dependsOn: "step1",
      },
    ]

    expect(() => validateDependsOnReferences(operations)).not.toThrow()
  })

  test("rejects dependsOn referencing unknown IDs", () => {
    const operations: Operation[] = [
      { tool: "read_file", arguments: { path: "/a" }, id: "step1" },
      {
        tool: "write_file",
        arguments: { path: "/b", content: "x" },
        id: "step2",
        dependsOn: "typo_id",
      },
    ]

    expect(() => validateDependsOnReferences(operations)).toThrow()
    try {
      validateDependsOnReferences(operations)
    } catch (error) {
      expect(error).toBeInstanceOf(McpError)
      expect((error as McpError).code).toBe(ErrorCode.InvalidParams)
      expect((error as McpError).message).toContain("typo_id")
    }
  })

  test("creates correct batch ordering for dependency chains", () => {
    const operations: Operation[] = [
      { tool: "read_file", arguments: { path: "/a" }, id: "step1" },
      {
        tool: "process",
        arguments: { data: "${results.step1}" },
        id: "step2",
        dependsOn: "step1",
      },
      {
        tool: "write_file",
        arguments: { path: "/c", content: "${results.step2}" },
        id: "step3",
        dependsOn: "step2",
      },
    ]

    validateDependsOnReferences(operations)
    const batches = createOrderedBatches(operations)

    expect(batches).toHaveLength(3)
    expect(batches[0][0].id).toBe("step1")
    expect(batches[1][0].id).toBe("step2")
    expect(batches[2][0].id).toBe("step3")
  })
})

describe("Main executor integration: ResultsCache behavior", () => {
  test("cache is empty after clear", () => {
    const cache = new ResultsCache()
    cache.storeResult("id1", "value1")
    cache.storeResult("id2", "value2")

    expect(cache.getResult("id1")).toBe("value1")
    expect(cache.getResult("id2")).toBe("value2")

    cache.clear()

    expect(cache.getResult("id1")).toBeUndefined()
    expect(cache.getResult("id2")).toBeUndefined()
  })

  test("separate cache instances do not leak between batches", () => {
    // Simulate first batch with its own cache
    const cache1 = new ResultsCache()
    cache1.storeResult("read_config", { version: "1.0" })
    expect(cache1.getResult("read_config")).toEqual({ version: "1.0" })

    // Second batch gets a fresh cache — no stale results leak
    const cache2 = new ResultsCache()
    expect(cache2.getResult("read_config")).toBeUndefined()
  })
})

describe("Main executor integration: end-to-end resolution pipeline", () => {
  let cache: ResultsCache

  beforeEach(() => {
    cache = new ResultsCache()
  })

  test("full pipeline: cache → resolve references → resolve templates", () => {
    // Simulate what the main executor does for each operation:
    // 1. Store previous operation result
    cache.storeResult("read_data", "important content")

    // 2. Next operation references the result
    const args = {
      path: "/output.txt",
      template: "Processed: {{uppercase results.read_data}}",
    }

    // 3. Resolve result references first
    const step1 = resolveResultReferences(args, cache)
    // Template strings still have Handlebars syntax, so template is preserved
    expect(step1.template).toBe("Processed: {{uppercase results.read_data}}")

    // 4. Resolve templates second
    const step2 = resolveTemplates(step1, cache)
    expect(step2.content).toBe("Processed: IMPORTANT CONTENT")
  })
})
