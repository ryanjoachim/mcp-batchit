import { PathValidationConfig } from '../../batchit-filesystem/index.js';

export interface MemoryBankConfig {
  rootDirectory?: string;
  templates?: Record<string, string>;
}

export type MemoryBankOperation = 'initialize' | 'verify_and_read' | 'just_read' | 'list' | 'update';

export interface MemoryBankArgs {
  operation: MemoryBankOperation;
  directory: string;
  files?: string[];
  updates?: Array<MemoryBankUpdate>;
  options?: MemoryBankOptions;
}

export interface MemoryBankOptions {
  backup?: boolean;
  rollback?: boolean;
  atomic?: boolean;
}

export interface MemoryBankUpdate {
  file: string;
  mode: 'overwrite' | 'append' | 'diff' | 'edit';
  newContent?: string;
  diff?: Array<MemoryBankDiffOperation>;
  edits?: Array<MemoryBankEdit>;
}

export interface MemoryBankDiffOperation {
  line: number;
  operation: 'insert' | 'replace' | 'delete';
  text?: string;
}

export interface MemoryBankEdit {
  oldText: string;
  newText: string;
}

export interface MemoryBankResult {
  message: string;
  filesRead?: string[];
  directory?: string;
  data?: Record<string, string> | unknown;
  results?: string[];
}

export interface MemoryBankService {
  initialize(directory: string, validation: PathValidationConfig): Promise<MemoryBankResult>;
  verifyAndRead(directory: string, files: string[] | undefined, validation: PathValidationConfig): Promise<MemoryBankResult>;
  justRead(directory: string, files: string[] | undefined, validation: PathValidationConfig): Promise<MemoryBankResult>;
  list(directory: string, validation: PathValidationConfig): Promise<MemoryBankResult>;
  update(directory: string, updates: MemoryBankUpdate[], validation: PathValidationConfig): Promise<MemoryBankResult>;
}
