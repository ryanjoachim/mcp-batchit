import { z } from "zod"

// Operation Types
import {
  ReadFileArgsSchema,
  WriteFileArgsSchema,
  EditFileArgsSchema,
  CreateDirectoryArgsSchema,
  ListDirectoryArgsSchema,
  DirectoryTreeArgsSchema,
  MoveFileArgsSchema,
  SearchFilesArgsSchema,
  GetFileInfoArgsSchema,
  ReadMultipleFilesArgsSchema
} from "./operations.js"

// Transform function schema
export const TransformFunctionSchema = z.object({
  code: z.string().describe("JavaScript code for the transform function"),
  inputSchema: z.string().optional().describe("Schema for validating transform input"),
  outputSchema: z.string().optional().describe("Schema for validating transform output")
});

export const OperationSchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("read_file").describe("Read file operation"),
    arguments: ReadFileArgsSchema,
    id: z.string().optional().describe("Unique identifier for referencing operation results"),
    dependsOn: z.union([z.string(), z.array(z.string())]).optional().describe("IDs of operations this operation depends on"),
    transform: z.union([TransformFunctionSchema, z.record(z.unknown())]).optional().describe("Transform to apply to operation arguments")
  }),
  z.object({
    tool: z.literal("write_file").describe("Write file operation"),
    arguments: WriteFileArgsSchema,
    id: z.string().optional().describe("Unique identifier for referencing operation results"),
    dependsOn: z.union([z.string(), z.array(z.string())]).optional().describe("IDs of operations this operation depends on"),
    transform: z.union([TransformFunctionSchema, z.record(z.unknown())]).optional().describe("Transform to apply to operation arguments")
  }),
  z.object({
    tool: z.literal("edit_file").describe("Edit file operation"),
    arguments: EditFileArgsSchema,
    id: z.string().optional().describe("Unique identifier for referencing operation results"),
    dependsOn: z.union([z.string(), z.array(z.string())]).optional().describe("IDs of operations this operation depends on"),
    transform: z.union([TransformFunctionSchema, z.record(z.unknown())]).optional().describe("Transform to apply to operation arguments")
  }),
  z.object({
    tool: z.literal("create_directory").describe("Create directory operation"),
    arguments: CreateDirectoryArgsSchema,
    id: z.string().optional().describe("Unique identifier for referencing operation results"),
    dependsOn: z.union([z.string(), z.array(z.string())]).optional().describe("IDs of operations this operation depends on"),
    transform: z.union([TransformFunctionSchema, z.record(z.unknown())]).optional().describe("Transform to apply to operation arguments")
  }),
  z.object({
    tool: z.literal("list_directory").describe("List directory operation"),
    arguments: ListDirectoryArgsSchema,
    id: z.string().optional().describe("Unique identifier for referencing operation results"),
    dependsOn: z.union([z.string(), z.array(z.string())]).optional().describe("IDs of operations this operation depends on"),
    transform: z.union([TransformFunctionSchema, z.record(z.unknown())]).optional().describe("Transform to apply to operation arguments")
  }),
  z.object({
    tool: z.literal("directory_tree").describe("Generate directory tree operation"),
    arguments: DirectoryTreeArgsSchema,
    id: z.string().optional().describe("Unique identifier for referencing operation results"),
    dependsOn: z.union([z.string(), z.array(z.string())]).optional().describe("IDs of operations this operation depends on"),
    transform: z.union([TransformFunctionSchema, z.record(z.unknown())]).optional().describe("Transform to apply to operation arguments")
  }),
  z.object({
    tool: z.literal("move_file").describe("Move file operation"),
    arguments: MoveFileArgsSchema,
    id: z.string().optional().describe("Unique identifier for referencing operation results"),
    dependsOn: z.union([z.string(), z.array(z.string())]).optional().describe("IDs of operations this operation depends on"),
    transform: z.union([TransformFunctionSchema, z.record(z.unknown())]).optional().describe("Transform to apply to operation arguments")
  }),
  z.object({
    tool: z.literal("search_files").describe("Search files operation"),
    arguments: SearchFilesArgsSchema,
    id: z.string().optional().describe("Unique identifier for referencing operation results"),
    dependsOn: z.union([z.string(), z.array(z.string())]).optional().describe("IDs of operations this operation depends on"),
    transform: z.union([TransformFunctionSchema, z.record(z.unknown())]).optional().describe("Transform to apply to operation arguments")
  }),
  z.object({
    tool: z.literal("get_file_info").describe("Get file info operation"),
    arguments: GetFileInfoArgsSchema,
    id: z.string().optional().describe("Unique identifier for referencing operation results"),
    dependsOn: z.union([z.string(), z.array(z.string())]).optional().describe("IDs of operations this operation depends on"),
    transform: z.union([TransformFunctionSchema, z.record(z.unknown())]).optional().describe("Transform to apply to operation arguments")
  }),
  z.object({
    tool: z.literal("read_multiple_files").describe("Read multiple files operation"),
    arguments: ReadMultipleFilesArgsSchema,
    id: z.string().optional().describe("Unique identifier for referencing operation results"),
    dependsOn: z.union([z.string(), z.array(z.string())]).optional().describe("IDs of operations this operation depends on"),
    transform: z.union([TransformFunctionSchema, z.record(z.unknown())]).optional().describe("Transform to apply to operation arguments")
  })
]);

export const ServerTypeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("filesystem"),
    config: z.object({
      rootDirectory: z.string()
        .describe("Required - base directory (Absolute Path) for all filesystem operations"),
      permissions: z.string().optional()
        .describe("Optional - currently unused"),
      watchMode: z.boolean().optional()
        .describe("Optional - for future use"),
      provider: z.enum(["batchit-internal", "external"])
        .describe("Provider type - internal ('batchit-internal') or external ('external') filesystem"),
    }).refine((data) => !!data.rootDirectory, {
      message: "rootDirectory (Absolute Path) is required for filesystem server type",
      path: ["rootDirectory"],
    }),
  }),
  z.object({
    type: z.literal("database"),
    config: z.object({
      database: z.string(),
      readOnly: z.boolean().optional(),
      poolSize: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal("generic"),
    config: z.record(z.unknown()),
  }),
]);

export const TransportConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stdio"),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    npxDownload: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("websocket"),
    url: z.string(),
    options: z.record(z.unknown()).optional(),
  }),
]);

// Batch execution options schema
export const BatchExecutionOptionsSchema = z.object({
  maxConcurrent: z.number().optional().default(5)
    .describe("Maximum number of concurrent operations"),
  timeoutMs: z.number().optional().default(30000)
    .describe("Operation timeout in milliseconds"),
  stopOnError: z.boolean().optional().default(false)
    .describe("Stop batch on first error"),
  keepAlive: z.boolean().optional().default(false)
    .describe("Keep server connection alive between operations"),
});

// Target server schema with proper hierarchy
export const TargetServerSchema = z.object({
  name: z.string().describe("Server identifier"),
  serverType: ServerTypeSchema,
  transport: TransportConfigSchema.optional().describe("Transport configuration (required for external providers)"),
  maxIdleTimeMs: z.number().optional().describe("Maximum idle time in milliseconds before cleanup")
}).refine(
  (data) => {
    if (
      data.serverType.type === "filesystem" &&
      data.serverType.config.provider === "external"
    ) {
      return !!data.transport
    }
    return true
  },
  {
    message: "Transport configuration is required for external filesystem providers",
    path: ["transport"],
  }
)

// Main batch schema with proper hierarchy
export const BatchArgsSchema = z.object({
  targetServer: z.object({
    name: z.string().describe("Server identifier"),
    serverType: ServerTypeSchema,
    transport: TransportConfigSchema.optional(),
    maxIdleTimeMs: z.number().optional().describe("Maximum idle time in milliseconds before cleanup"),
  })
    .refine(
      (data) => {
        if (
          data.serverType.type === "filesystem" &&
          data.serverType.config.provider === "external"
        ) {
          return !!data.transport
        }
        return true
      },
      {
        message: "Transport configuration is required for external filesystem providers",
        path: ["transport"],
      }
    )
    .describe("Target server configuration"),

  operations: z.array(OperationSchema)
    .min(1, "At least one operation is required")
    .describe("Array of operations to execute"),

  options: z
    .object({
      maxConcurrent: z.number().default(5)
        .describe("Maximum number of concurrent operations"),
      timeoutMs: z.number().default(30000)
        .describe("Operation timeout in milliseconds"),
      stopOnError: z.boolean().default(false)
        .describe("Stop batch on first error"),
      keepAlive: z.boolean().default(false)
        .describe("Keep server connection alive between operations"),
    })
    .default({
      maxConcurrent: 5,
      timeoutMs: 30000,
      stopOnError: false,
      keepAlive: false,
    })
    .describe("Batch execution options"),
}).describe("Batch execution configuration");

export interface ExecutionPlan {
  batches: Array<{
    operations: Array<{
      operation: z.infer<typeof OperationSchema>;
      dependencyResults?: Record<string, unknown>;
    }>;
    canExecuteParallel: boolean;
  }>;
  dataFlowMap: Map<string, Set<string>>;
}

export interface OperationResult {
  id?: string;
  tool: string;
  success: boolean;
  result?: unknown;
  error?: Error;
  duration: number;
  metadata: {
    startTime: number;
    endTime: number;
    retries?: number;
  };
}

// Schema descriptions for documentation
export const BatchExecutorDescriptions = {
  "BatchExecutor._schema": "Execute a batch of operations with dependency management",
  "BatchExecutor.operation": "Definition of a single operation in the batch",
  "BatchExecutor.operation.tool": "Name of the tool to execute",
  "BatchExecutor.operation.arguments": "Arguments specific to the tool",
  "BatchExecutor.operation.id": "Optional ID for referencing operation results",
  "BatchExecutor.operation.dependsOn": "Optional dependencies on other operations",
  "BatchExecutor.operation.transform": "Optional transform for operation arguments",

  "BatchExecutor.options": "Configuration options for batch execution",
  "BatchExecutor.options.maxConcurrent": "Maximum parallel operations",
  "BatchExecutor.options.timeoutMs": "Operation timeout in milliseconds",
  "BatchExecutor.options.stopOnError": "Stop on first error",
  "BatchExecutor.options.keepAlive": "Maintain connections between operations"
};

export const BatchToolSchema = z.object({
  targetServer: z.object({
    name: z.string().describe("Server identifier"),
    serverType: ServerTypeSchema,
    transport: TransportConfigSchema.optional(),
    maxIdleTimeMs: z.number().optional().describe("Maximum idle time in milliseconds before cleanup"),
  }).refine(
    (data) => {
      if (
        data.serverType.type === "filesystem" &&
        data.serverType.config.provider === "external"
      ) {
        return !!data.transport
      }
      return true
    },
    {
      message: "Transport configuration is required for external filesystem providers",
      path: ["transport"],
    }
  ).describe("Target server configuration"),

  operations: z.array(OperationSchema)
    .min(1, "At least one operation is required")
    .describe("Array of operations to execute"),

  options: BatchExecutionOptionsSchema.default({
    maxConcurrent: 5,
    timeoutMs: 30000,
    stopOnError: false,
    keepAlive: false,
  }).describe("Batch execution options"),
})
