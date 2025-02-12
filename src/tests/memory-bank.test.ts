import { jest } from "@jest/globals"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import {
    batchExecutor,
    ServerIdentity,
    Operation,
} from "../index.js"
import fs from "fs/promises"
import path from "path"

describe("Memory Bank Tool", () => {
    const defaultServerIdentity: ServerIdentity = {
        name: "memory-bank-server",
        serverType: { type: "filesystem", config: {} },
        transport: { type: "websocket", url: "ws://localhost:3000" },
    }

    const defaultOptions = {
        maxConcurrent: 5,
        timeoutMs: 30000,
        stopOnError: true,
        keepAlive: false,
    }

    // Directory used by the tests
    const testMemoryBankDir = "test-memory-bank"

    // Required files
    const requiredFiles = [
        "productContext.md",
        "activeContext.md",
        "systemPatterns.md",
        "techContext.md",
        "progress.md",
    ]

    beforeEach(() => {
        jest.spyOn(Client.prototype, "connect").mockResolvedValue(undefined)
        jest.spyOn(Client.prototype, "close").mockResolvedValue(undefined)
        jest.spyOn(Client.prototype, "request").mockResolvedValue({})
        jest.spyOn(fs, "mkdir").mockResolvedValue(undefined)
        jest.spyOn(fs, "writeFile").mockResolvedValue(undefined)
        jest.spyOn(fs, "readFile").mockResolvedValue("# Test Content")
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    describe("init (initialize) operation", () => {
        it("creates memory bank directory and files if they don't exist", async () => {
            const operation: Operation = {
                tool: "memory_bank",
                arguments: {
                    action: "init",
                    directory: testMemoryBankDir,
                },
            }

            // Mock directory check to say it doesn't exist
            jest.spyOn(fs, "access").mockRejectedValue(new Error("Directory not found"))

            const results = await batchExecutor.executeBatch(
                defaultServerIdentity,
                [operation],
                defaultOptions
            )

            expect(results[0].success).toBe(true)
            expect(fs.mkdir).toHaveBeenCalledWith(testMemoryBankDir, { recursive: true })

            // Verify all required files were created
            requiredFiles.forEach((file) => {
                expect(fs.writeFile).toHaveBeenCalledWith(
                    path.join(testMemoryBankDir, file),
                    expect.any(String),
                    "utf-8"
                )
            })
        })

        it("skips file creation if memory bank already exists", async () => {
            const operation: Operation = {
                tool: "memory_bank",
                arguments: {
                    action: "init",
                    directory: testMemoryBankDir,
                },
            }

            // Mock directory check to say it exists
            jest.spyOn(fs, "access").mockResolvedValue(undefined)

            const results = await batchExecutor.executeBatch(
                defaultServerIdentity,
                [operation],
                defaultOptions
            )

            expect(results[0].success).toBe(true)
            // No creation or writes if directory & files are present
            expect(fs.mkdir).not.toHaveBeenCalled()
            expect(fs.writeFile).not.toHaveBeenCalled()
        })
    })

    describe("read operation (verifies files)", () => {
        it("fails if any required file is missing", async () => {
            const operation: Operation = {
                tool: "memory_bank",
                arguments: {
                    action: "read",
                    directory: testMemoryBankDir,
                },
            }

            // Mock missing file
            jest.spyOn(fs, "access").mockImplementation(async (filePath) => {
                if (filePath.toString().includes("systemPatterns.md")) {
                    throw new Error(`File not found: ${filePath}`)
                }
            })

            const results = await batchExecutor.executeBatch(
                defaultServerIdentity,
                [operation],
                defaultOptions
            )

            expect(results[0].success).toBe(false)
            expect(results[0].error).toContain("Missing required file")
        })

        it("reads content of all memory bank files if all exist", async () => {
            const operation: Operation = {
                tool: "memory_bank",
                arguments: {
                    action: "read",
                    directory: testMemoryBankDir,
                },
            }

            // Mock that all files exist
            jest.spyOn(fs, "access").mockResolvedValue(undefined)

            const results = await batchExecutor.executeBatch(
                defaultServerIdentity,
                [operation],
                defaultOptions
            )

            expect(results[0].success).toBe(true)
            // We should have read each required file
            expect(fs.readFile).toHaveBeenCalledTimes(requiredFiles.length)
            requiredFiles.forEach((file) => {
                expect(fs.readFile).toHaveBeenCalledWith(
                    path.join(testMemoryBankDir, file),
                    "utf-8"
                )
            })
        })

        it("reads content of specified files only", async () => {
            const operation: Operation = {
                tool: "memory_bank",
                arguments: {
                    action: "read",
                    directory: testMemoryBankDir,
                    files: ["productContext.md"],
                },
            }

            jest.spyOn(fs, "access").mockResolvedValue(undefined)

            const results = await batchExecutor.executeBatch(
                defaultServerIdentity,
                [operation],
                defaultOptions
            )

            expect(results[0].success).toBe(true)
            // Only reads the single file
            expect(fs.readFile).toHaveBeenCalledTimes(1)
            expect(fs.readFile).toHaveBeenCalledWith(
                path.join(testMemoryBankDir, "productContext.md"),
                "utf-8"
            )
        })
    })

    describe("update operation", () => {
        it("updates content of a specific file", async () => {
            const operation: Operation = {
                tool: "memory_bank",
                arguments: {
                    action: "update",
                    directory: testMemoryBankDir,
                    updates: {
                        "activeContext.md": "# Updated Content",
                    },
                },
            }

            // Mock file exists check
            jest.spyOn(fs, "access").mockResolvedValue(undefined)

            const results = await batchExecutor.executeBatch(
                defaultServerIdentity,
                [operation],
                defaultOptions
            )

            expect(results[0].success).toBe(true)
            expect(fs.writeFile).toHaveBeenCalledWith(
                path.join(testMemoryBankDir, "activeContext.md"),
                "# Updated Content",
                "utf-8"
            )
        })

        it("fails if a target file doesn't exist", async () => {
            const operation: Operation = {
                tool: "memory_bank",
                arguments: {
                    action: "update",
                    directory: testMemoryBankDir,
                    updates: {
                        "nonexistent.md": "# Updated Content",
                    },
                },
            }

            // Mock file doesn't exist
            jest.spyOn(fs, "access").mockRejectedValue(new Error("File not found"))

            const results = await batchExecutor.executeBatch(
                defaultServerIdentity,
                [operation],
                defaultOptions
            )

            expect(results[0].success).toBe(false)
            expect(results[0].error).toContain("File not found")
            expect(fs.writeFile).not.toHaveBeenCalled()
        })
    })
})
