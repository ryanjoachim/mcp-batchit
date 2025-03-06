import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ProcessSchema, ProcessConfig, ProcessResult } from "../schemas/process.js";
import { ProcessManager } from "./process/manager.js";
import { eventBus } from "../utils/eventBus.js";
import { metricsCollector } from "../utils/metricsCollector.js";
import { withRecovery } from "../utils/recovery.js";
import { performance } from "perf_hooks";

// Initialize process manager as singleton
const processManager = new ProcessManager();

/**
 * Implementation of process operation logic
 * @throws {McpError} If validation fails or operation encounters an error
 */
async function executeProcess(args: ProcessConfig): Promise<ProcessResult> {
  const startTime = performance.now();
  const operationId = `process_${Date.now()}`;
  const processId = `proc_${Date.now()}`;

  // Validate arguments against schema
  const validationResult = ProcessSchema.safeParse(args);
  if (!validationResult.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid arguments for process operation",
      { validation: validationResult.error.flatten() }
    );
  }

  const operationContext = {
    operationId,
    processId,
    command: args.command,
    args: args.args || [],
    startTime
  };

  eventBus.emit("processOperation:start", operationContext);

  return withRecovery(async () => {
    try {
      // Spawn the process and wait for exit
      const childProcess = await processManager.spawn(processId, args);

      // Wait for process to complete
      const exitCode = await new Promise<number>((resolve) => {
        childProcess.on("exit", (code) => resolve(code ?? 1));
      });

      // Record metrics and get output
      const duration = performance.now() - startTime;
      metricsCollector.recordMetric("process.time", duration);
      const output = processManager.getOutput(processId);

      const result: ProcessResult = {
        processId,
        command: args.command,
        args: args.args || [],
        metrics: {
          startTime,
          duration
        },
        output: output || {
          stdout: "",
          stderr: ""
        },
        exitCode
      };

      eventBus.emit("processOperation:complete", {
        ...operationContext,
        result,
        duration
      });

      return result;

    } catch (error) {
      const duration = performance.now() - startTime;
      const errorContext = {
        ...operationContext,
        error: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof McpError ? error.code : ErrorCode.InternalError,
        duration,
        phase: "execution"
      };

      eventBus.emit("processOperation:error", errorContext);
      metricsCollector.recordMetric("process.errors", 1);
      metricsCollector.recordMetric("process.error.duration", duration);

      throw error instanceof McpError
        ? new McpError(error.code, error.message, { ...errorContext, originalError: error })
        : new McpError(
            ErrorCode.InternalError,
            `Failed to spawn process: ${error instanceof Error ? error.message : String(error)}`,
            errorContext
          );
    }
  });
}

/**
 * SubOp implementation for process management
 */
export const processSubOp = {
  name: "process",
  schema: ProcessSchema,
  description: "Executes and manages child processes",
  handler: async (args: ProcessConfig) => {
    const result = await executeProcess(args);
    return {
      success: true,
      data: result
    };
  }
};

export { executeProcess as processOp };
