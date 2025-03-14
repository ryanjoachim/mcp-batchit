import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals"
import { writeFile } from "../fileOperations.js"
import { resultsCache } from "../../utils/resultsCache.js"
import { clearTemplateCache } from "../../utils/templateResolver.js"

describe("Template File Operations", () => {
  let testDir: string
  let testFilePath: string

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })
    testFilePath = path.join(testDir, "test.txt")
    resultsCache.clear()
    clearTemplateCache()
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it("should handle basic templates", async () => {
    const result = await writeFile(
      testFilePath,
      { name: "test" },
      { rootDirectory: testDir },
      {
        template: "Hello {{content.name}}!"
      }
    )

    expect(result.content).toBe("Hello test!")
    const fileContent = await fs.readFile(testFilePath, "utf-8")
    expect(fileContent).toBe("Hello test!")
  })

  it("should handle JSON templates", async () => {
    const data = { user: { name: "test", age: 25 } }
    const result = await writeFile(
      testFilePath,
      data,
      { rootDirectory: testDir },
      {
        template: "{{{json content.user}}}"
      }
    )

    expect(result.content).toBe(JSON.stringify(data.user, null, 2))
    const fileContent = await fs.readFile(testFilePath, "utf-8")
    expect(JSON.parse(fileContent)).toEqual(data.user)
  })

  it("should use previous results in templates", async () => {
    resultsCache.storeResult("prevOp", { value: "test value" })

    const result = await writeFile(
      testFilePath,
      { current: "current value" },
      { rootDirectory: testDir },
      {
        template: "Previous: {{results.prevOp.value}}, Current: {{content.current}}"
      }
    )

    expect(result.content).toBe("Previous: test value, Current: current value")
    const fileContent = await fs.readFile(testFilePath, "utf-8")
    expect(fileContent).toBe("Previous: test value, Current: current value")
  })

  it("should handle the now helper in templates", async () => {
    const result = await writeFile(
      testFilePath,
      {},
      { rootDirectory: testDir },
      {
        template: "Created at: {{now}}"
      }
    )

    expect(result.content).toMatch(/Created at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    const fileContent = await fs.readFile(testFilePath, "utf-8")
    expect(fileContent).toMatch(/Created at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it("should handle parseJson helper in templates", async () => {
    resultsCache.storeResult("jsonString", '{"key":"value"}')

    const result = await writeFile(
      testFilePath,
      {},
      { rootDirectory: testDir },
      {
        template: "{{#with (parseJson results.jsonString)}}Key: {{key}}{{/with}}"
      }
    )

    expect(result.content).toBe("Key: value")
    const fileContent = await fs.readFile(testFilePath, "utf-8")
    expect(fileContent).toBe("Key: value")
  })

  it("should handle template cache", async () => {
    // First write
    await writeFile(
      testFilePath,
      { value: "first" },
      { rootDirectory: testDir },
      {
        template: "Value: {{content.value}}"
      }
    )

    // Second write with same template
    const result = await writeFile(
      testFilePath,
      { value: "second" },
      { rootDirectory: testDir },
      {
        template: "Value: {{content.value}}"
      }
    )

    expect(result.content).toBe("Value: second")
    const fileContent = await fs.readFile(testFilePath, "utf-8")
    expect(fileContent).toBe("Value: second")
  })
})
