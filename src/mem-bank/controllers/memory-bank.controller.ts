import { MemoryBank } from '../index.js';
import { PathValidationConfig } from '../../batchit-filesystem/index.js';
import { MemoryBankArgs } from '../types/memory-bank.types.js';

/**
 * Handles incoming requests for memory bank operations.
 */
export class MemoryBankController {
  private bank: MemoryBank;

  constructor() {
    this.bank = new MemoryBank();
  }

  /**
   * Handles a memory bank request.
   * @param args The arguments for the memory bank operation.
   * @param validation The path validation configuration.
   * @returns A promise that resolves to the result of the memory bank operation.
   */
  async handleRequest(args: MemoryBankArgs, validation: PathValidationConfig) {
    return this.bank.execute(args, validation);
  }

  /**
   * Handles a legacy memory bank request.
   * @param operation The memory bank operation to perform.
   * @param directory The directory to operate on.
   * @param files An array of files to operate on.
   * @param updates An array of updates to apply.
   * @param validation The path validation configuration.
   * @returns A promise that resolves to the result of the memory bank operation.
   */
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
