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
    await fs.access(testDir) // Verify directory exists
    testFilePath = path.join(testDir, "test.txt")
    resultsCache.clear()
    clearTemplateCache()
  })

  afterEach(async () => {
    if (!testDir) return

    // Wait for any pending file operations to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    // Attempt cleanup with improved retry logic
    const maxRetries = 3
    for (let i = 0; i < maxRetries; i++) {
      try {
        await fs.rm(testDir, { recursive: true, force: true })
        return
      } catch (error: any) {
        if (i === maxRetries - 1) {
          console.warn(`Failed to clean up test directory after ${maxRetries} attempts: ${error.message}`)
        } else {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 100))
        }
      }
    }
  })

  it("should handle basic templates", async () => {
    const result = await writeFile(
      testFilePath,
      { name: "test" },
      { rootDirectory: testDir },
      {
        template: "Hello {{content.name}}!",
      }
    )

    expect(result.content).toBe("Hello test!")
    const fileContent = await fs.readFile(testFilePath, "utf-8")
    expect(fileContent).toBe("Hello test!")
  })

  it("should handle JSON templates", async () => {
    const data = { user: { name: "test", age: 25 } }
    const jsonFilePath = path.join(testDir, "test.json")

    const result = await writeFile(
      jsonFilePath,
      data,
      { rootDirectory: testDir },
      {
        template: "{{{json content.user}}}",
      }
    )

    expect(result.content).toBe(JSON.stringify(data.user, null, 2))

    // Explicitly wait for the file operation to complete
    await new Promise((resolve) => setTimeout(resolve, 50))

    const fileContent = await fs.readFile(jsonFilePath, "utf-8")
    expect(JSON.parse(fileContent)).toEqual(data.user)
  })

  it("should use previous results in templates", async () => {
    resultsCache.storeResult("prevOp", { value: "test value" })

    const result = await writeFile(
      testFilePath,
      { current: "current value" },
      { rootDirectory: testDir },
      {
        template:
          "Previous: {{results.prevOp.value}}, Current: {{content.current}}",
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
        template: "Created at: {{now}}",
      }
    )

    expect(result.content).toMatch(
      /Created at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    )
    const fileContent = await fs.readFile(testFilePath, "utf-8")
    expect(fileContent).toMatch(
      /Created at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    )
  })

  it("should handle parseJson helper in templates", async () => {
    resultsCache.storeResult("jsonString", '{"key":"value"}')

    const result = await writeFile(
      testFilePath,
      {},
      { rootDirectory: testDir },
      {
        template:
          "{{#with (parseJson results.jsonString)}}Key: {{key}}{{/with}}",
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
        template: "Value: {{content.value}}",
      }
    )

    // Second write with same template
    const result = await writeFile(
      testFilePath,
      { value: "second" },
      { rootDirectory: testDir },
      {
        template: "Value: {{content.value}}",
      }
    )

    expect(result.content).toBe("Value: second")
    const fileContent = await fs.readFile(testFilePath, "utf-8")
    expect(fileContent).toBe("Value: second")
  })

  it("should handle binary files with templates", async () => {
    // Create a simple placeholder image buffer (1x1 pixel)
    const imageBuffer = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
      0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
      0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
    ])

    const imgFilePath = path.join(testDir, "test.gif")

    // Write the binary file directly first
    await fs.writeFile(imgFilePath, imageBuffer)

    // Now use the template system to generate metadata file
    const metadataPath = path.join(testDir, "metadata.json")
    const metadata = {
      filename: path.basename(imgFilePath),
      size: imageBuffer.length,
      created: new Date().toISOString(),
    }

    const result = await writeFile(
      metadataPath,
      metadata,
      { rootDirectory: testDir },
      {
        template: "{{{json content}}}",
      }
    )

    expect(result.content).toBe(JSON.stringify(metadata, null, 2))

    // Ensure files are properly closed before proceeding
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Read back and verify content
    const fileContent = await fs.readFile(metadataPath, "utf-8")
    expect(JSON.parse(fileContent)).toEqual(metadata)

    // Clean up the image file explicitly before the test ends
    await fs.unlink(imgFilePath)
  })

  it("should handle nested template context", async () => {
    const data = {
      project: {
        name: "Test Project",
        version: "1.0.0",
        config: {
          settings: {
            enabled: true,
            timeout: 1000,
          },
        },
      },
    }

    const result = await writeFile(
      testFilePath,
      data,
      { rootDirectory: testDir },
      {
        template:
          "{{content.project.name}} v{{content.project.version}} - Enabled: {{content.project.config.settings.enabled}}",
      }
    )

    expect(result.content).toBe("Test Project v1.0.0 - Enabled: true")
  })

  it("should handle error cases gracefully", async () => {
    // Try to use a non-existent helper
    await expect(writeFile(
      testFilePath,
      { data: "test" },
      { rootDirectory: testDir },
      {
        template:
          "{{#nonExistentHelper}}{{content.data}}{{/nonExistentHelper}}",
      }
    )).rejects.toThrow(/nonExistentHelper/)
  })

  it("should maintain template cache for performance", async () => {
    // Use the same template multiple times with different data
    const template = "Name: {{content.name}}"

    // First use
    await writeFile(
      testFilePath,
      { name: "First" },
      { rootDirectory: testDir },
      { template }
    )

    // Second use - should use cached template
    const start = performance.now()
    const result = await writeFile(
      testFilePath,
      { name: "Second" },
      { rootDirectory: testDir },
      { template }
    )
    const duration = performance.now() - start

    expect(result.content).toBe("Name: Second")

    // This is a loose performance test, might need adjustment
    // Just ensuring template compilation isn't happening again
    expect(duration).toBeLessThan(50) // Typically very fast with cached template
  })

  it("should handle file cleanup properly", async () => {
    const imagePath = path.join(testDir, "test.png")
    const content = Buffer.from([0xff, 0xd8, 0xff, 0xe0]) // Simple JPEG header

    // Write content directly to simulate a binary file
    await fs.writeFile(imagePath, content)

    // Explicitly close and wait
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Try to remove the file specifically
    await fs.unlink(imagePath).catch((err) => {
      console.warn(`Failed to delete test file: ${err.message}`)
    })

    // Verify it's gone
    const exists = await fs
      .access(imagePath)
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(false)
  })
})
