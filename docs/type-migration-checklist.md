# BatchIt Type Migration Checklist

This document provides a step-by-step guide for migrating from the old BatchIt type system to the new consolidated type system. It includes common patterns and their replacements, troubleshooting guidance, and a timeline for deprecating old types.

## Table of Contents

1. [Migration Overview](#migration-overview)
2. [Step-by-Step Migration Guide](#step-by-step-migration-guide)
3. [Common Patterns and Replacements](#common-patterns-and-replacements)
4. [Troubleshooting](#troubleshooting)
5. [Deprecation Timeline](#deprecation-timeline)
6. [Migration Verification](#migration-verification)

## Migration Overview

The BatchIt type system has been consolidated to provide a more consistent, type-safe, and maintainable foundation. The new type system:

- Organizes types into clear hierarchies with proper relationships
- Uses discriminated unions for better type safety
- Standardizes naming conventions
- Eliminates duplicate and overlapping types
- Provides better documentation

This migration guide will help you update your code to use the new type system while maintaining backward compatibility.

## Step-by-Step Migration Guide

### 1. Update Import Statements

Replace imports from the old type files with imports from the new filesystem-specific type files:

**Old imports:**

```typescript
import {
  Operation,
  OperationResult,
  ContentTrackingOptions,
  ContentModification
} from '../types/operations.js';
```

**New imports:**

```typescript
import {
  FileSystemOperation,
  ReadOperation,
  WriteOperation,
  UpdateOperation
} from '../types/filesystem/operations.js';
import {
  FileSystemResult,
  ReadResult,
  WriteResult,
  UpdateResult
} from '../types/filesystem/results.js';
import {
  ContentTrackingOptions,
  ContentModification
} from '../types/filesystem/contentTracking.js';
```

### 2. Update Operation Definitions

Replace generic `Operation` objects with specific operation types:

**Old style:**

```typescript
const writeOperation: Operation = {
  id: 'write1',
  tool: 'write_file',
  arguments: {
    path: '/path/to/file.txt',
    content: 'Hello, world!',
    contentTracking: {
      enabled: true,
      trackDiff: true
    }
  }
};
```

**New style:**

```typescript
const writeOperation: WriteOperation = {
  operation: 'write',
  path: '/path/to/file.txt',
  content: 'Hello, world!',
  tracking: {
    enabled: true,
    trackDiff: true
  }
};
```

### 3. Update Result Handling

Replace generic `OperationResult` handling with specific result types:

**Old style:**

```typescript
function processResult(result: OperationResult): void {
  if (!result.success) {
    console.error(`Operation failed: ${result.error}`);
    return;
  }

  if (result.tool === 'read_file') {
    const content = (result.result as any).content;
    console.log(`Read content: ${content}`);
  }
}
```

**New style:**

```typescript
function processResult(result: FileSystemResult): void {
  if (!result.success) {
    console.error(`Operation failed: ${result.error}`);
    return;
  }

  switch (result.operation) {
    case 'read':
      console.log(`Read content: ${result.content}`);
      break;
    case 'write':
      console.log(`Wrote ${result.size} bytes`);
      break;
    // Handle other result types...
  }
}
```

### 4. Update Content Tracking

Update content tracking options and modification handling:

**Old style:**

```typescript
const trackingOptions: ContentTrackingOptions = {
  enabled: true,
  trackSize: true,
  trackType: true,
  trackDiff: true
};
```

**New style:**

```typescript
const trackingOptions: ContentTrackingOptions = {
  enabled: true,
  trackSize: true,
  trackType: true,
  trackDiff: true
};
```

Note: The structure of `ContentTrackingOptions` and `ContentModification` remains similar, but they are now imported from `../types/filesystem/contentTracking.js`.

### 5. Use Type Discrimination

Take advantage of discriminated unions for type-safe operations:

```typescript
function executeOperation(op: FileSystemOperation): Promise<FileSystemResult> {
  switch (op.operation) {
    case 'read':
      // TypeScript knows op is ReadOperation here
      return readFile(op.path, op.encoding);
    case 'write':
      // TypeScript knows op is WriteOperation here
      return writeFile(op.path, op.content, op.tracking);
    case 'update':
      // TypeScript knows op is UpdateOperation here
      if (op.mode === 'diff') {
        return applyDiff(op.path, op.diff);
      } else {
        return updateContent(op.path, op.mode, op.content);
      }
    // Handle other operations...
  }
}
```

## Common Patterns and Replacements

### Operation Creation

| Old Pattern | New Pattern |
|-------------|-------------|
| `{ tool: 'read_file', arguments: { path: '/file.txt' } }` | `{ operation: 'read', path: '/file.txt' }` |
| `{ tool: 'write_file', arguments: { path: '/file.txt', content: 'text' } }` | `{ operation: 'write', path: '/file.txt', content: 'text' }` |
| `{ tool: 'update_file', arguments: { path: '/file.txt', operation: { mode: 'append', content: 'text' } } }` | `{ operation: 'update', path: '/file.txt', mode: 'append', content: 'text' }` |
| `{ tool: 'update_file', arguments: { path: '/file.txt', operation: { mode: 'diff', operations: [...] } } }` | `{ operation: 'update', path: '/file.txt', mode: 'diff', diff: [...] }` |

### Result Handling

| Old Pattern | New Pattern |
|-------------|-------------|
| `result.tool === 'read_file' && (result.result as any).content` | `result.operation === 'read' && result.content` |
| `result.tool === 'write_file' && (result.result as any).size` | `result.operation === 'write' && result.size` |
| `(result.result as any).contentModification` | `result.contentTracking` (for write/update results) |

### Type Guards

| Old Pattern | New Pattern |
|-------------|-------------|
| `op.tool === 'read_file'` | `isReadOperation(op)` or `op.operation === 'read'` |
| `op.tool === 'write_file'` | `isWriteOperation(op)` or `op.operation === 'write'` |
| `op.tool === 'update_file'` | `isUpdateOperation(op)` or `op.operation === 'update'` |

## Troubleshooting

### Common Issues and Solutions

#### Issue: TypeScript errors after migration

**Problem:** After updating imports, TypeScript reports errors about missing properties.

**Solution:** Ensure you're using the correct type for each operation. The new types use a discriminated union pattern, so properties are specific to each operation type.

```typescript
// Incorrect
const op: FileSystemOperation = {
  operation: 'read',
  path: '/file.txt',
  content: 'text' // Error: Property 'content' does not exist on type 'ReadOperation'
};

// Correct
const op: ReadOperation = {
  operation: 'read',
  path: '/file.txt'
};

// Or
const writeOp: WriteOperation = {
  operation: 'write',
  path: '/file.txt',
  content: 'text'
};
```

#### Issue: Missing properties in result handling

**Problem:** Properties like `content` or `size` are reported as missing when handling results.

**Solution:** Use type discrimination to narrow down the result type:

```typescript
function processResult(result: FileSystemResult): void {
  if (result.operation === 'read') {
    // TypeScript knows this is a ReadResult
    console.log(result.content);
  } else if (result.operation === 'write') {
    // TypeScript knows this is a WriteResult
    console.log(result.size);
  }
}
```

#### Issue: Compatibility with external code

**Problem:** External code still expects the old type format.

**Solution:** Use the compatibility layer to convert between old and new formats:

```typescript
import { adaptLegacyOperation, createLegacyOperation } from '../types/compat/operations.js';

// Convert old to new
const oldOp: Operation = { /* ... */ };
const newOp = adaptLegacyOperation(oldOp);

// Convert new to old
const newOp: FileSystemOperation = { /* ... */ };
const oldOp = createLegacyOperation(newOp);
```

### Type Conversion Helpers

Use these helper functions to convert between old and new types:

```typescript
// Convert old Operation to new FileSystemOperation
function convertToNewOperation(oldOp: Operation): FileSystemOperation | null {
  if (!oldOp.tool || !oldOp.arguments) return null;

  switch (oldOp.tool) {
    case 'read_file':
      return {
        operation: 'read',
        path: oldOp.arguments.path as string,
        encoding: oldOp.arguments.encoding as BufferEncoding | undefined,
        startLine: oldOp.arguments.startLine as number | undefined,
        endLine: oldOp.arguments.endLine as number | undefined
      };
    case 'write_file':
      return {
        operation: 'write',
        path: oldOp.arguments.path as string,
        content: oldOp.arguments.content,
        tracking: oldOp.arguments.contentTracking as ContentTrackingOptions | undefined,
        template: oldOp.arguments.template as string | undefined
      };
    // Add other conversions as needed
  }

  return null;
}

// Convert new FileSystemOperation to old Operation
function convertToLegacyOperation(newOp: FileSystemOperation): Operation {
  const base: Operation = {
    tool: '',
    arguments: {}
  };

  switch (newOp.operation) {
    case 'read':
      base.tool = 'read_file';
      base.arguments = {
        path: newOp.path,
        encoding: newOp.encoding,
        startLine: newOp.startLine,
        endLine: newOp.endLine
      };
      break;
    case 'write':
      base.tool = 'write_file';
      base.arguments = {
        path: newOp.path,
        content: newOp.content,
        contentTracking: newOp.tracking,
        template: newOp.template
      };
      break;
    // Add other conversions as needed
  }

  return base;
}
```

## Deprecation Timeline

| Date | Milestone |
|------|-----------|
| April 15, 2025 | Release of new type system with compatibility layer |
| May 15, 2025 | Deprecation warnings added to old type imports |
| July 1, 2025 | Documentation and examples updated to use new types exclusively |
| September 1, 2025 | Old types marked as deprecated in code |
| January 1, 2026 | Compatibility layer marked as deprecated |
| April 1, 2026 | Old types removed in next major version |

## Migration Verification

Use this checklist to verify your migration is complete:

- [ ] All imports updated to use new type files
- [ ] All operation definitions updated to use specific operation types
- [ ] All result handling updated to use specific result types
- [ ] Type discrimination used for handling different operation/result types
- [ ] Tests updated to use new types
- [ ] No TypeScript errors related to the type system
- [ ] All functionality working as expected

### Testing Your Migration

Run the following tests to verify your migration:

1. **Type Compatibility Tests**
   - Create instances of new types
   - Convert between old and new types
   - Verify type discrimination works correctly

2. **Functionality Tests**
   - Verify all operations work with new types
   - Verify all result handling works with new types
   - Verify error handling works correctly

3. **Edge Case Tests**
   - Test with optional properties omitted
   - Test with null or undefined values
   - Test with complex nested structures

Example test file: `src/types/filesystem/__tests__/types.test.ts`
