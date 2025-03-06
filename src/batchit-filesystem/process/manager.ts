import { ChildProcess, spawn } from "node:child_process"
import { eventBus } from "../../utils/eventBus.js"
import { metricsCollector } from "../../utils/metricsCollector.js"
import { FilesystemErrorCode, createFilesystemError } from "../errors.js"
import {
  ProcessSchema,
  ProcessConfig,
  ProcessEventType,
  ProcessEventPayload,
  ProcessContextSchema,
} from "../../schemas/process.js"

// Technical constraints from techContext.md
const TECHNICAL_CONSTRAINTS = {
  OPERATION_TIMEOUT_MS: 30000,    // 30s operation timeout
  MAX_CONCURRENT_CONNECTIONS: 50,  // Max concurrent connections
  ERROR_RATE_THRESHOLD: 0.05,     // 5% error threshold
}

// Types
interface ProcessOutput {
  stdout: string
  stderr: string
}

interface OutputBuffer {
  stdout: string[]
  stderr: string[]
  encoding: BufferEncoding
}

interface ProcessMetrics {
  errorRate: number
  connectionCount: number
}

interface ShutdownOptions {
  timeout: number
  force: boolean
}

/**
 * Manages child processes for the BatchIt filesystem
 * Implements process lifecycle management, event propagation, and resource cleanup
 */
export class ProcessManager {
  private processes: Map<string, ChildProcess>
  private outputBuffers: Map<string, OutputBuffer>
  private pipeConnections: Map<string, string>
  private errorCounts: Map<string, number>

  constructor() {
    this.processes = new Map()
    this.outputBuffers = new Map()
    this.pipeConnections = new Map()
    this.errorCounts = new Map()
  }

  /**
   * Gets current process metrics
   */
  async monitor(): Promise<ProcessMetrics> {
    const totalErrors = Array.from(this.errorCounts.values())
      .reduce((sum, count) => sum + count, 0)

    return {
      errorRate: this.processes.size > 0 ? totalErrors / this.processes.size : 0,
      connectionCount: this.processes.size
    }
  }

  /**
   * Creates process context information
   */
  private createProcessContext(config: ProcessConfig) {
    return ProcessContextSchema.parse({
      workingDirectory: config.cwd,
      environmentVars: config.env ? Object.keys(config.env).length : 0,
      pipedTo: config.io?.pipeTo,
    })
  }

  /**
   * Spawns a new process with the given configuration
   * @throws {McpError} If validation fails or spawn fails
   */
  async spawn(id: string, config: ProcessConfig): Promise<ChildProcess> {
    this.logEvent("spawn", id, { config })

    // Check connection limits
    if (this.processes.size >= TECHNICAL_CONSTRAINTS.MAX_CONCURRENT_CONNECTIONS) {
      throw createFilesystemError(
        FilesystemErrorCode.ConnectionError,
        `Cannot spawn process: Maximum concurrent connections (${TECHNICAL_CONSTRAINTS.MAX_CONCURRENT_CONNECTIONS}) reached`
      )
    }

    const result = ProcessSchema.safeParse(config)
    if (!result.success) {
      throw createFilesystemError(
        FilesystemErrorCode.ConnectionError,
        `Invalid process configuration for ${id}: ${result.error.message}`
      )
    }

    try {
      if (config.io?.captureOutput !== false) {
        this.outputBuffers.set(id, {
          stdout: [],
          stderr: [],
          encoding: (config.io?.encoding || "utf8") as BufferEncoding,
        })
      }

      const childProcess = spawn(config.command, config.args || [], {
        cwd: config.cwd,
        env: config.env,
        stdio: "pipe",
      })

      this.processes.set(id, childProcess)
      this.setupProcessHandlers(childProcess, id, config)

      // Wait for process to start or timeout
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            childProcess.removeListener("error", onError)
            childProcess.removeListener("spawn", onSpawn)
          }

          const onError = (err: Error) => {
            cleanup()
            this.processes.delete(id)
            this.errorCounts.set(id, (this.errorCounts.get(id) ?? 0) + 1)
            reject(createFilesystemError(
              FilesystemErrorCode.ConnectionError,
              `Failed to start process ${id}: ${err.message}`,
              err
            ))
          }

          const onSpawn = () => {
            cleanup()
            const eventPayload: ProcessEventPayload = {
              id,
              command: config.command,
              status: "started",
              context: this.createProcessContext(config)
            }
            console.log(`[ProcessManager] Emitting started event for ${id}:`, eventPayload)
            eventBus.emit(ProcessEventType.Started, eventPayload)
            resolve()
          }

          childProcess.once("error", onError)
          childProcess.once("spawn", onSpawn)
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(createFilesystemError(
            FilesystemErrorCode.ConnectionError,
            `Process ${id} start timeout after ${TECHNICAL_CONSTRAINTS.OPERATION_TIMEOUT_MS}ms`
          )), TECHNICAL_CONSTRAINTS.OPERATION_TIMEOUT_MS)
        ),
      ])

      // Check error rate after spawn
      const metrics = await this.monitor()
      if (metrics.errorRate > TECHNICAL_CONSTRAINTS.ERROR_RATE_THRESHOLD) {
        console.warn(`Process ${id} error rate above threshold:`, metrics.errorRate)
      }

      return childProcess
    } catch (error) {
      const err = error as Error
      this.errorCounts.set(id, (this.errorCounts.get(id) ?? 0) + 1)
      throw createFilesystemError(
        FilesystemErrorCode.ConnectionError,
        `Failed to spawn process ${id}: ${err.message}`,
        err
      )
    }
  }

  /**
   * Sets up process event handlers
   */
  private setupProcessHandlers(childProcess: ChildProcess, id: string, config: ProcessConfig): void {
    this.logEvent("setup", id, { command: config.command })

    // Handle stdout for both piping and output capture
    childProcess.stdout?.on("data", (data: Buffer) => {
      const targetId = config.io?.pipeTo
      if (targetId) {
        const targetProcess = this.processes.get(targetId)
        const processStdin = targetProcess?.stdin
        if (processStdin) {
          this.pipeConnections.set(id, targetId)
          processStdin.write(data)
        }
      }

      if (config.io?.captureOutput !== false) {
        const buffers = this.outputBuffers.get(id)
        if (buffers) {
          buffers.stdout.push(data.toString(buffers.encoding))
        }
      }
    })

    // Handle stderr (capture only)
    if (config.io?.captureOutput !== false) {
      const buffers = this.outputBuffers.get(id)!
      childProcess.stderr?.on("data", (data: Buffer) => {
        buffers.stderr.push(data.toString(buffers.encoding))
      })
    }

    // Handle process error
    childProcess.on("error", (error: Error) => {
      this.logEvent("error", id, { error })
      metricsCollector.recordMetric(`process.${id}.errors`, this.errorCounts.get(id) ?? 0)
      const output = this.getOutput(id)

      this.errorCounts.set(id, (this.errorCounts.get(id) ?? 0) + 1)

      const eventPayload: ProcessEventPayload = {
        id,
        command: config.command,
        status: "error",
        error,
        output,
        context: this.createProcessContext(config)
      }

      console.log(`[ProcessManager] Emitting error event for ${id}:`, eventPayload)
      eventBus.emit(ProcessEventType.Error, eventPayload)
      this.cleanupProcess(id, true, childProcess, output)
    })

    // Handle process exit
    childProcess.on("exit", (code: number) => {
      this.logEvent("exit", id, { code })
      metricsCollector.recordMetric(`process.${id}.exitCode`, code ?? 0)
      const output = this.getOutput(id)
      this.cleanupProcess(id, true, childProcess, output)
    })
  }

  /**
   * Cleans up process resources and connections
   */
  private async cleanupProcess(
    id: string,
    emitEvent = true,
    process?: ChildProcess,
    output?: ProcessOutput
  ): Promise<void> {
    this.logEvent("cleanup", id)

    // Clean up pipe connections
    const targetId = this.pipeConnections.get(id)
    if (targetId) {
      const targetProcess = this.processes.get(targetId)
      const processStdin = targetProcess?.stdin
      if (processStdin) {
        await new Promise<void>(resolve => {
          processStdin.end(() => resolve())
        })
      }
      this.pipeConnections.delete(id)
    }

    // Remove from tracking
    this.processes.delete(id)
    this.outputBuffers.delete(id)

    // Emit stopped event if needed
    if (emitEvent && process) {
      const eventPayload: ProcessEventPayload = {
        id,
        command: process.spawnargs?.[0] || "unknown",
        status: "stopped",
        exitCode: process.exitCode || 0,
        output,
      }
      console.log(`[ProcessManager] Emitting stopped event for ${id}:`, eventPayload)
      eventBus.emit(ProcessEventType.Stopped, eventPayload)
    }
  }

  /**
   * Stops a specific process and returns its final output
   * @returns The final output before stopping, if any
   */
  async stop(id: string): Promise<ProcessOutput | undefined> {
    this.logEvent("stop", id)

    const process = this.processes.get(id)
    if (!process) {
      this.logEvent("notFound", id)
      return this.getOutput(id)
    }

    const finalOutput = this.getOutput(id)

    // Handle already exited process
    if (process.exitCode !== null || process.killed) {
      this.logEvent("alreadyExited", id, { exitCode: process.exitCode })
      this.cleanupProcess(id, true, process, finalOutput)
      return finalOutput
    }

    try {
      // Set up exit handler before killing
      await new Promise<void>(resolve => {
        const onExit = () => {
          this.cleanupProcess(id, true, process, finalOutput)
          resolve()
        }
        process.once("exit", onExit)

        // Attempt to kill the process
        if (!process.kill()) {
          process.removeListener("exit", onExit)
          this.cleanupProcess(id, false, process, finalOutput)
          resolve()
        }
      })
    } catch (err) {
      this.logEvent("stopError", id, { error: err })
      metricsCollector.recordMetric(`process.${id}.stopErrors`, 1)
      this.cleanupProcess(id, false, process, finalOutput)
    }

    return finalOutput
  }

  /**
   * Gets the captured output for a process
   */
  getOutput(id: string): ProcessOutput | undefined {
    const buffers = this.outputBuffers.get(id)
    if (!buffers) return undefined

    return {
      stdout: buffers.stdout.join(""),
      stderr: buffers.stderr.join(""),
    }
  }

  /**
   * Gets a specific process by ID
   */
  getProcess(id: string): ChildProcess | undefined {
    return this.processes.get(id)
  }

  /**
   * Stops all managed processes with configurable options
   */
  async shutdown(options: ShutdownOptions = { timeout: 5000, force: false }): Promise<void> {
    this.logEvent("shutdown", "all", { options })

    const shutdownPromise = this.stopAll()

    try {
      await Promise.race([
        shutdownPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Shutdown timeout")), options.timeout)
        )
      ])
    } catch (error) {
      this.logEvent("shutdownTimeout", "all", { error })
      metricsCollector.recordMetric("process.shutdownTimeouts", 1)
      if (options.force) {
        // Force kill all remaining processes
        for (const [id, process] of this.processes.entries()) {
          try {
            process.kill('SIGKILL')
          } catch (err) {
            this.logEvent("forceKillError", id, { error: err })
            metricsCollector.recordMetric(`process.${id}.forceKillErrors`, 1)
          }
        }
      }
    }
  }

  /**
   * Stops all managed processes in the correct order
   */
  private async stopAll(): Promise<void> {
    this.logEvent("stopAll", "all")

    const processes = Array.from(this.processes.entries())
    const pipedProcesses = new Set(this.pipeConnections.values())

    // Stop processes in the correct order to handle dependencies
    const stopInOrder = async (processList: [string, ChildProcess][], phase: string) => {
      this.logEvent("stopPhase", "all", { phase, count: processList.length })
      await Promise.all(processList.map(([id]) => this.stop(id)))
    }

    // Stop non-piped processes first
    await stopInOrder(
      processes.filter(([id]) => !this.pipeConnections.has(id) && !pipedProcesses.has(id)),
      "Phase 1: Non-piped processes"
    )

    // Then stop pipe source processes
    await stopInOrder(
      processes.filter(([id]) => this.pipeConnections.has(id)),
      "Phase 2: Pipe source processes"
    )

    // Finally stop pipe target processes
    await stopInOrder(
      processes.filter(([id]) => pipedProcesses.has(id)),
      "Phase 3: Pipe target processes"
    )

    this.logEvent("cleared", "all")

    // Clear all tracking maps
    this.processes.clear()
    this.outputBuffers.clear()
    this.pipeConnections.clear()
    this.errorCounts.clear()
  }

  /**
   * Standardized logging with event emission
   */
  private logEvent(event: string, id: string, data?: Record<string, unknown>): void {
    const logData = {
      event,
      id,
      timestamp: new Date().toISOString(),
      ...data
    }

    // Standard logging format
    const message = `[ProcessManager] ${event} - ${id}${data ? ': ' + JSON.stringify(data) : ''}`

    if (event === "error" || event === "stopError" || event === "forceKillError" || event === "shutdownTimeout") {
      console.error(message)
    } else {
      console.log(message)
    }

    // Emit structured event
    eventBus.emit('processManager.' + event, logData)

    // Record event metric
    metricsCollector.recordMetric(`process.events.${event}`, 1)
  }
}
