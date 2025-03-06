import { MemoryBankService } from './services/memory-bank.service.js';
import { MemoryBankConfig, MemoryBankArgs, MemoryBankResult } from './types/memory-bank.types.js';
import { PathValidationConfig } from '../batchit-filesystem/index.js';
import { withRecovery } from '../utils/recovery.js';
import { eventBus } from '../utils/eventBus.js';
import { metricsCollector } from '../utils/metricsCollector.js';

/**
 * Manages the memory bank operations, providing a structured way to interact with project documentation.
 */
export class MemoryBank {
  private service: MemoryBankService;

  /**
   * Constructs a new MemoryBank instance.
   * @param config Optional configuration for the MemoryBank.
   */
  constructor(config?: MemoryBankConfig) {
    this.service = new MemoryBankService(config);
    eventBus.emit('memoryBankCreated', { config });
  }

  /**
   * Executes a memory bank operation based on the provided arguments.
   * @param args The arguments for the memory bank operation.
   * @param validation The path validation configuration.
   * @returns A promise that resolves to a MemoryBankResult.
   */
  async execute(args: MemoryBankArgs, validation: PathValidationConfig): Promise<MemoryBankResult> {
    const startTime = Date.now();
    const operationId = `${args.operation}-${startTime}`;

    return withRecovery(async () => {
      try {
        eventBus.emit('memoryBankOperationStarted', {
          operation: args.operation,
          directory: args.directory,
          operationId
        });

        let result: MemoryBankResult;

        switch (args.operation) {
          case 'initialize':
            result = await this.service.initialize(args.directory, validation);
            break;

          case 'verify_and_read':
            result = await this.service.verifyAndRead(args.directory, args.files, validation);
            break;

          case 'just_read':
            result = await this.service.justRead(args.directory, args.files, validation);
            break;

          case 'list':
            result = await this.service.list(args.directory, validation);
            break;

          case 'update':
            if (!args.updates?.length) {
              throw new Error('No updates provided for operation=\'update\'');
            }
            result = await this.service.update(args.directory, args.updates, validation);
            break;

          default:
            throw new Error(`Unknown memory_bank operation: ${args.operation}`);
        }

        const duration = Date.now() - startTime;

        // Record metrics
        metricsCollector.recordMetric(`memoryBank.operation.${args.operation}.duration`, duration);
        metricsCollector.recordMetric(`memoryBank.operation.${args.operation}.count`, 1);

        // Emit completion event
        eventBus.emit('memoryBankOperationCompleted', {
          operation: args.operation,
          directory: args.directory,
          operationId,
          duration,
          success: true
        });

        return result;
      } catch (error) {
        // Record error metrics
        metricsCollector.recordMetric(`memoryBank.operation.${args.operation}.errors`, 1);

        // Emit error event
        eventBus.emit('memoryBankOperationError', {
          operation: args.operation,
          directory: args.directory,
          operationId,
          error: error instanceof Error ? error.message : String(error)
        });

        throw error;
      }
    });
  }
}

// Re-export types
export * from './types/memory-bank.types.js';
