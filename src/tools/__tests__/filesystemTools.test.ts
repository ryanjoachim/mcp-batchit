/**
 * @fileoverview
 * Tests for individual filesystem tool registration.
 * Verifies that all 12 tool schemas and annotations are correctly defined.
 */

import { describe, test, expect } from "@jest/globals"

import {
  ReadFileToolSchema,
  ReadFilesToolSchema,
  WriteFileToolSchema,
  UpdateFileToolSchema,
  MoveFileToolSchema,
  CopyFileToolSchema,
  DeleteFileToolSchema,
  ListDirectoryToolSchema,
  CreateDirectoryToolSchema,
  SearchFilesToolSchema,
  GetFileInfoToolSchema,
  DirectoryTreeToolSchema,
  FILESYSTEM_TOOL_ANNOTATIONS,
} from "../../types/schemas/filesystemTools.js"

describe("filesystemTools schemas", () => {
  test("should have all 12 tool schemas defined", () => {
    expect(ReadFileToolSchema).toBeDefined()
    expect(ReadFilesToolSchema).toBeDefined()
    expect(WriteFileToolSchema).toBeDefined()
    expect(UpdateFileToolSchema).toBeDefined()
    expect(MoveFileToolSchema).toBeDefined()
    expect(CopyFileToolSchema).toBeDefined()
    expect(DeleteFileToolSchema).toBeDefined()
    expect(ListDirectoryToolSchema).toBeDefined()
    expect(CreateDirectoryToolSchema).toBeDefined()
    expect(SearchFilesToolSchema).toBeDefined()
    expect(GetFileInfoToolSchema).toBeDefined()
    expect(DirectoryTreeToolSchema).toBeDefined()
  })

  test("should have required path fields in each schema", () => {
    expect("path" in ReadFileToolSchema).toBe(true)
    expect("paths" in ReadFilesToolSchema).toBe(true)
    expect("path" in WriteFileToolSchema).toBe(true)
    expect("path" in UpdateFileToolSchema).toBe(true)
    expect("sourcePath" in MoveFileToolSchema).toBe(true)
    expect("sourcePath" in CopyFileToolSchema).toBe(true)
    expect("path" in DeleteFileToolSchema).toBe(true)
    expect("path" in ListDirectoryToolSchema).toBe(true)
    expect("path" in CreateDirectoryToolSchema).toBe(true)
    expect("path" in SearchFilesToolSchema).toBe(true)
    expect("path" in GetFileInfoToolSchema).toBe(true)
    expect("path" in DirectoryTreeToolSchema).toBe(true)
  })
})

describe("FILESYSTEM_TOOL_ANNOTATIONS", () => {
  const toolNames = [
    "read_file",
    "read_files",
    "write_file",
    "update_file",
    "move_file",
    "copy_file",
    "delete_file",
    "list_directory",
    "create_directory",
    "search_files",
    "get_file_info",
    "directory_tree",
  ]

  test("should have annotations for all 12 tools", () => {
    for (const name of toolNames) {
      expect(FILESYSTEM_TOOL_ANNOTATIONS[name]).toBeDefined()
    }
    expect(Object.keys(FILESYSTEM_TOOL_ANNOTATIONS)).toHaveLength(12)
  })

  test("should mark read-only tools correctly", () => {
    const readOnlyTools = [
      "read_file",
      "read_files",
      "list_directory",
      "search_files",
      "get_file_info",
      "directory_tree",
    ]
    for (const name of readOnlyTools) {
      expect(FILESYSTEM_TOOL_ANNOTATIONS[name].readOnlyHint).toBe(true)
      expect(FILESYSTEM_TOOL_ANNOTATIONS[name].destructiveHint).toBe(false)
    }
  })

  test("should mark destructive tools correctly", () => {
    const destructiveTools = [
      "write_file",
      "update_file",
      "move_file",
      "delete_file",
    ]
    for (const name of destructiveTools) {
      expect(FILESYSTEM_TOOL_ANNOTATIONS[name].destructiveHint).toBe(true)
    }
  })

  test("should mark non-destructive write tools correctly", () => {
    expect(FILESYSTEM_TOOL_ANNOTATIONS.copy_file.destructiveHint).toBe(false)
    expect(FILESYSTEM_TOOL_ANNOTATIONS.create_directory.destructiveHint).toBe(
      false
    )
  })

  test("should mark idempotent tools correctly", () => {
    const idempotentTools = [
      "read_file",
      "read_files",
      "move_file",
      "copy_file",
      "list_directory",
      "create_directory",
      "search_files",
      "get_file_info",
      "directory_tree",
    ]
    for (const name of idempotentTools) {
      expect(FILESYSTEM_TOOL_ANNOTATIONS[name].idempotentHint).toBe(true)
    }

    expect(FILESYSTEM_TOOL_ANNOTATIONS.write_file.idempotentHint).toBe(false)
    expect(FILESYSTEM_TOOL_ANNOTATIONS.update_file.idempotentHint).toBe(false)
    expect(FILESYSTEM_TOOL_ANNOTATIONS.delete_file.idempotentHint).toBe(false)
  })

  test("should mark all tools as not open-world", () => {
    for (const name of toolNames) {
      expect(FILESYSTEM_TOOL_ANNOTATIONS[name].openWorldHint).toBe(false)
    }
  })
})
