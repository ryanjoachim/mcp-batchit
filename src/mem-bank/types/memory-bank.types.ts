import { PathValidationConfig } from '../../batchit-filesystem/index.js';

/**
 * Configuration options for the memory bank.
 */
export interface MemoryBankConfig {
  rootDirectory?: string;
  templates?: Record<string, string>;
}

/**
 * The possible memory bank operations.
 */
export type MemoryBankOperation = 'initialize' | 'verify_and_read' | 'just_read' | 'list' | 'update';

/**
 * Arguments for a memory bank operation.
 */
export interface MemoryBankArgs {
  operation: MemoryBankOperation;
  directory: string;
  files?: string[];
  updates?: Array<MemoryBankUpdate>;
  options?: MemoryBankOptions;
}

/**
 * Options for a memory bank operation.
 */
export interface MemoryBankOptions {
  backup?: boolean;
  rollback?: boolean;
  atomic?: boolean;
}

/**
 * An update to apply to a memory bank file.
 */
export interface MemoryBankUpdate {
  file: string;
  mode: 'overwrite' | 'append' | 'diff' | 'edit';
  newContent?: string;
  diff?: Array<MemoryBankDiffOperation>;
  edits?: Array<MemoryBankEdit>;
}

/**
 * A diff operation to apply to a memory bank file.
 */
export interface MemoryBankDiffOperation {
  line: number;
  operation: 'insert' | 'replace' | 'delete';
  text?: string;
}

/**
 * An edit to apply to a memory bank file.
 */
export interface MemoryBankEdit {
  oldText: string;
  newText: string;
}

/**
 * The result of a memory bank operation.
 */
export interface MemoryBankResult {
  message: string;
  filesRead?: string[];
  directory?: string;
  data?: Record<string, string> | unknown;
  results?: string[];
}

/**
 * Interface for the memory bank service.
 */
export interface MemoryBankService {
  initialize(directory: string, validation: PathValidationConfig): Promise<MemoryBankResult>;
  verifyAndRead(directory: string, files: string[] | undefined, validation: PathValidationConfig): Promise<MemoryBankResult>;
  justRead(directory: string, files: string[] | undefined, validation: PathValidationConfig): Promise<MemoryBankResult>;
  list(directory: string, validation: PathValidationConfig): Promise<MemoryBankResult>;
  update(directory: string, updates: MemoryBankUpdate[], validation: PathValidationConfig): Promise<MemoryBankResult>;
}
