import { MemoryBankService } from './services/memory-bank.service.js';
import { MemoryBankConfig, MemoryBankArgs, MemoryBankResult } from './types/memory-bank.types.js';
import { PathValidationConfig } from '../batchit-filesystem/index.js';

export class MemoryBank {
  private service: MemoryBankService;

  constructor(config?: MemoryBankConfig) {
    this.service = new MemoryBankService(config);
  }

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
