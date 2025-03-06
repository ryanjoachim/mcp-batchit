import { z } from "zod";

/**
 * Schema for process configuration
 */
/**
 * Default IO configuration values
 */
export const DEFAULT_IO_CONFIG = {
  captureOutput: true,
  bufferSize: 1024 * 1024,
  encoding: "utf8" as const
};

export const ProcessIOConfig = z.object({
  /**
   * Process output configuration
   *
   * @default { captureOutput: true, bufferSize: 1048576, encoding: "utf8" }
   */
  pipeTo: z.string().optional().describe("ID of process to pipe output to"),
  captureOutput: z.boolean().default(true).describe("Capture process output"),
  bufferSize: z.number().default(1024 * 1024).describe("Buffer size for output capture (in bytes)"),
  encoding: z.enum(["utf8", "buffer"]).default("utf8").describe("Encoding for output")
}).describe("Process I/O configuration");

export const ProcessSchema = z.object({
  /** Command to execute */
  command: z.string().min(1, "Command is required"),

  /** Command arguments */
  args: z.array(z.string()).optional(),

  /** Working directory for the process */
  cwd: z.string().optional(),

  /** Environment variables */
  env: z.record(z.string()).optional(),

  /** I/O configuration */
  io: ProcessIOConfig.optional()
}).describe("Process configuration options");

/**
 * Process configuration type derived from schema
 */
export type ProcessConfig = z.infer<typeof ProcessSchema>;

/**
 * Process result schema
 */
export const ProcessResultSchema = z.object({
  /** Process identifier */
  processId: z.string(),

  /** Command that was executed */
  command: z.string(),

  /** Command arguments */
  args: z.array(z.string()),

  /** Exit code */
  exitCode: z.number().optional(),

  /** Process output if captured */
  output: z.object({
    stdout: z.string().optional(),
    stderr: z.string().optional()
  }).optional(),

  /** Execution metrics */
  metrics: z.object({
    startTime: z.number(),
    duration: z.number()
  }).optional()
}).describe("Process execution result");

/**
 * Process result type derived from schema
 */
export type ProcessResult = z.infer<typeof ProcessResultSchema>;

/**
 * Process event types
 */
export enum ProcessEventType {
  Started = "process:started",
  Stopped = "process:stopped",
  Error = "process:error"
}

/**
 * Process context schema
 */
export const ProcessContextSchema = z.object({
  /** Working directory */
  workingDirectory: z.string().optional(),
  /** Number of environment variables */
  environmentVars: z.number().optional(),
  /** Target process for piping */
  pipedTo: z.string().optional(),
}).describe("Process execution context");

/**
 * Process event payload schema
 */
export const ProcessEventSchema = z.object({
  /** Process identifier */
  id: z.string(),

  /** Command that was executed */
  command: z.string(),

  /** Current process status */
  status: z.enum(["started", "stopped", "error"]),

  /** Error if status is 'error' */
  error: z.instanceof(Error).optional(),

  /** Exit code if status is 'stopped' */
  exitCode: z.number().optional(),

  /** Process output if captured */
  output: z.object({
    stdout: z.string(),
    stderr: z.string()
  }).optional(),

  /** Process execution context */
  context: ProcessContextSchema.optional()
}).describe("Process event payload");

/**
 * Process event payload type derived from schema
 */
export type ProcessEventPayload = z.infer<typeof ProcessEventSchema>;
