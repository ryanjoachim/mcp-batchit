import { describe, test, expect, beforeEach, afterEach } from "@jest/globals"
import { executeBatch } from "../batchExecutor.js"
import fs from "fs/promises"
import path from "path"
import os from "os"

describe("batchExecutor integration", () => {
  let testDir: string

  beforeEach(async () => {
    // Create unique test directory
    testDir = path.join(os.tmpdir(), `batchit-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    // Cleanup test directory
    await fs.rm(testDir, { recursive: true, force: true })
  })

  test("executes result chaining with filesystem operations", async () => {
    const sourceFile = path.join(testDir, "source.txt")
    const destFile = path.join(testDir, "destination.txt")
    const initialContent = "Hello, World!"

    // Mock filesystem provider
    const provider = {
      async executeTool(name: string, args: any) {
        switch (name) {
          case "write_file":
            await fs.writeFile(args.path, args.content, "utf-8")
            return { success: true }
          case "read_file":
            return fs.readFile(args.path, "utf-8")
          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      },
    }

    // Define operations with result chaining
    const operations = [
      {
        tool: "write_file",
        arguments: {
          path: sourceFile,
          content: initialContent,
        },
        id: "write1",
      },
      {
        tool: "read_file",
        arguments: {
          path: sourceFile,
        },
        id: "read1",
        dependsOn: "write1",
      },
      {
        tool: "write_file",
        arguments: {
          path: destFile,
          content: "${results.read1}",
        },
        id: "write2",
        dependsOn: "read1",
      },
    ]

    // Execute batch
    const results = await executeBatch(operations, provider)

    // Verify all operations succeeded
    results.forEach((result) => {
      expect(result.success).toBe(true)
    })

    // Verify final content
    const finalContent = await fs.readFile(destFile, "utf-8")
    expect(finalContent).toBe(initialContent)
  })

  test("handles complex result chaining with nested properties", async () => {
    const configFile = path.join(testDir, "config.json")
    const dataFile = path.join(testDir, "data.json")
    const outputFile = path.join(testDir, "output.txt")

    const provider = {
      async executeTool(name: string, args: any) {
        switch (name) {
          case "write_file":
            await fs.writeFile(
              args.path,
              typeof args.content === "string"
                ? args.content
                : JSON.stringify(args.content),
              "utf-8"
            )
            return { success: true }
          case "read_file":
            const content = await fs.readFile(args.path, "utf-8")
            return args.path.endsWith(".json") ? JSON.parse(content) : content
          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      },
    }

    const operations = [
      {
        tool: "write_file",
        arguments: {
          path: configFile,
          content: { format: "txt", encoding: "utf-8" },
        },
        id: "writeConfig",
      },
      {
        tool: "write_file",
        arguments: {
          path: dataFile,
          content: { message: "Hello from JSON!" },
        },
        id: "writeData",
      },
      {
        tool: "read_file",
        arguments: { path: configFile },
        id: "readConfig",
        dependsOn: "writeConfig",
      },
      {
        tool: "read_file",
        arguments: { path: dataFile },
        id: "readData",
        dependsOn: "writeData",
      },
      {
        tool: "write_file",
        arguments: {
          path: outputFile,
          content: "${results.readData.message}",
        },
        id: "writeOutput",
        dependsOn: ["readConfig", "readData"],
      },
    ]

    const results = await executeBatch(operations, provider)

    // Verify all operations succeeded
    results.forEach((result) => {
      expect(result.success).toBe(true)
    })

    // Verify final content includes resolved nested property
    const finalContent = await fs.readFile(outputFile, "utf-8")
    expect(finalContent).toBe("Hello from JSON!")
  })

  test("handles errors in result chaining", async () => {
    const provider = {
      async executeTool(name: string, args: any) {
        if (
          name === "write_file" &&
          args.content.includes("${results.missing}")
        ) {
          throw new Error("Missing result reference: missing")
        }
        return { success: true }
      },
    }

    const operations = [
      {
        tool: "write_file",
        arguments: {
          path: path.join(testDir, "error.txt"),
          content: "${results.missing}",
        },
        id: "write1",
      },
    ]

    const results = await executeBatch(operations, provider)

    // Verify operation failed
    expect(results[0].success).toBe(false)
    expect(results[0].error).toContain("Result reference not found: missing")
  })

  test("handles complex dependency chains in result chaining", async () => {
    const baseDir = path.join(testDir, "complex")
    await fs.mkdir(baseDir, { recursive: true })

    const files = {
      source: path.join(baseDir, "source.json"),
      config: path.join(baseDir, "config.json"),
      temp1: path.join(baseDir, "temp1.txt"),
      temp2: path.join(baseDir, "temp2.txt"),
      final: path.join(baseDir, "final.json"),
    }

    const provider = {
      async executeTool(name: string, args: any) {
        switch (name) {
          case "write_file":
            await fs.writeFile(
              args.path,
              typeof args.content === "string"
                ? args.content
                : JSON.stringify(args.content),
              "utf-8"
            )
            return { success: true }
          case "read_file":
            const content = await fs.readFile(args.path, "utf-8")
            return args.path.endsWith(".json") ? JSON.parse(content) : content
          case "transform":
            return { transformed: args.content.toUpperCase() }
          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      },
    }

    const operations = [
      // Initial data setup
      {
        tool: "write_file",
        arguments: {
          path: files.source,
          content: { data: "test data" },
        },
        id: "writeSource",
      },
      {
        tool: "write_file",
        arguments: {
          path: files.config,
          content: { format: "json", prefix: "processed-" },
        },
        id: "writeConfig",
      },
      // First level transformations
      {
        tool: "read_file",
        arguments: { path: files.source },
        id: "readSource",
        dependsOn: "writeSource",
      },
      {
        tool: "read_file",
        arguments: { path: files.config },
        id: "readConfig",
        dependsOn: "writeConfig",
      },
      // Second level transformation
      {
        tool: "transform",
        arguments: {
          content: "${results.readSource.data}",
        },
        id: "transform1",
        dependsOn: "readSource",
      },
      // Third level transformations using multiple dependencies
      {
        tool: "write_file",
        arguments: {
          path: files.temp1,
          content: "${results.transform1.transformed}",
        },
        id: "writeTemp1",
        dependsOn: ["transform1", "readConfig"],
      },
      {
        tool: "read_file",
        arguments: { path: files.temp1 },
        id: "readTemp1",
        dependsOn: "writeTemp1",
      },
      // Final transformation combining multiple results
      {
        tool: "write_file",
        arguments: {
          path: files.final,
          content: {
            originalData: "${results.readSource.data}",
            transformedData: "${results.readTemp1}",
            config: "${results.readConfig}",
            timestamp: new Date().toISOString(),
          },
        },
        id: "writeFinal",
        dependsOn: ["readSource", "readTemp1", "readConfig"],
      },
    ]

    const results = await executeBatch(operations, provider)

    // Verify all operations succeeded
    results.forEach((result) => {
      expect(result.success).toBe(true)
    })

    // Verify final content combines all transformations
    const finalContent = JSON.parse(await fs.readFile(files.final, "utf-8"))
    expect(finalContent).toMatchObject({
      originalData: "test data",
      transformedData: "TEST DATA",
      config: {
        format: "json",
        prefix: "processed-",
      },
    })
    expect(finalContent.timestamp).toBeDefined()
  })

  test("handles concurrent operations with result chaining", async () => {
    const numOperations = 5
    const files = Array.from({ length: numOperations }, (_, i) => ({
      source: path.join(testDir, `source${i}.txt`),
      dest: path.join(testDir, `dest${i}.txt`),
    }))

    // Mock filesystem provider with artificial delay to test concurrency
    const provider = {
      async executeTool(name: string, args: any) {
        const delay = (ms: number) =>
          new Promise((resolve) => setTimeout(resolve, ms))

        switch (name) {
          case "write_file":
            await delay(Math.random() * 50) // Random delay to test race conditions
            await fs.writeFile(args.path, args.content, "utf-8")
            return { success: true }
          case "read_file":
            await delay(Math.random() * 50) // Random delay to test race conditions
            return fs.readFile(args.path, "utf-8")
          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      },
    }

    // Create operations for each file pair
    const operations = files.flatMap((file, index) => [
      {
        tool: "write_file",
        arguments: {
          path: file.source,
          content: `Content ${index}`,
        },
        id: `write${index}`,
      },
      {
        tool: "read_file",
        arguments: {
          path: file.source,
        },
        id: `read${index}`,
        dependsOn: `write${index}`,
      },
      {
        tool: "write_file",
        arguments: {
          path: file.dest,
          content: `\${results.read${index}}-processed`,
        },
        id: `process${index}`,
        dependsOn: `read${index}`,
      },
    ])

    // Execute batch with concurrent operations
    const results = await executeBatch(operations, provider, {
      maxConcurrent: numOperations,
    })

    // Verify all operations succeeded
    results.forEach((result) => {
      expect(result.success).toBe(true)
    })

    // Verify final content of all files
    await Promise.all(
      files.map(async (file, index) => {
        const content = await fs.readFile(file.dest, "utf-8")
        expect(content).toBe(`Content ${index}-processed`)
      })
    )
  })
})
