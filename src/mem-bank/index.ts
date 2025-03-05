import { MemoryBankService } from './services/memory-bank.service.js';
import { MemoryBankConfig, MemoryBankArgs, MemoryBankResult } from './types/memory-bank.types.js';
import { PathValidationConfig } from '../batchit-filesystem/index.js';

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
  }

  /**
   * Executes a memory bank operation based on the provided arguments.
   * @param args The arguments for the memory bank operation.
   * @param validation The path validation configuration.
   * @returns A promise that resolves to a MemoryBankResult.
   */
  async execute(args: MemoryBankArgs, validation: PathValidationConfig): Promise<MemoryBankResult> {
    const { operation, directory, files, updates } = args;

    switch (operation) {
      case 'initialize':
        return this.service.initialize(directory, validation);

      case 'verify_and_read':
        return this.service.verifyAndRead(directory, files, validation);

      case 'just_read':
        return this.service.justRead(directory, files, validation);

      case 'list':
        return this.service.list(directory, validation);

      case 'update':
        if (!updates?.length) {
          throw new Error('No updates provided for operation=\'update\'');
        }
        return this.service.update(directory, updates, validation);

      default:
        throw new Error(`Unknown memory_bank operation: ${operation}`);
    }
  }
}

// Re-export types
export * from './types/memory-bank.types.js';
