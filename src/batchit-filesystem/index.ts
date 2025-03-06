
// Import subops
import { processSubOp } from "./process.js";

// Base exports
export * from "./validation.js"
export * from "./schemas.js"
export * from "./readFile.js"
export * from "./writeFile.js"
export * from "./editFile.js"
export * from "./createDirectory.js"
export * from "./listDirectory.js"
export * from "./directoryTree.js"
export * from "./moveFile.js"
export * from "./searchFiles.js"
export * from "./getFileInfo.js"
export * from "./process.js"

/**
 * Array of all filesystem subops
 */
export const localFsSubOps = [
  processSubOp
];
