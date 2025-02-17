import { MemoryBank } from '../index.js';
import { PathValidationConfig } from '../../batchit-filesystem/index.js';
import { MemoryBankArgs } from '../types/memory-bank.types.js';

export class MemoryBankController {
  private bank: MemoryBank;

  constructor() {
    this.bank = new MemoryBank();
  }

  async handleRequest(args: MemoryBankArgs, validation: PathValidationConfig) {
    return this.bank.execute(args, validation);
  }

  static async handleLegacyRequest(
    operation: string,
    directory: string,
    files: string[] | undefined,
    updates: any[] | undefined,
    validation: PathValidationConfig
  ) {
    const bank = new MemoryBank();
    const args: MemoryBankArgs = {
      operation: operation as any,
      directory,
      files,
      updates
    };
    return bank.execute(args, validation);
  }
}
