# BatchIt Error Handling Guide

This guide documents the error handling patterns and best practices for the BatchIt codebase. It provides practical examples and strategies for handling errors consistently across the project.

## 1. Core Principles of Error Handling in BatchIt

BatchIt follows these core principles for error handling:

### 1.1 Consistent Error Types

All errors in BatchIt are transformed to MCP error types using the `McpError` class from the MCP SDK. This ensures consistent error handling and reporting throughout the application.

```typescript
// Always use McpError for error creation
throw new McpError(ErrorCode.InvalidParams, "Invalid parameter: path is required");
```

### 1.2 Error Context Preservation

Error context is preserved when transforming errors, including stack traces, original error objects, and additional metadata.

```typescript
// Preserve context when transforming errors
try {
  // Operation implementation
} catch (error) {
  throw ErrorManager.normalizeError(error, "Failed during file operation");
}
```

### 1.3 Clear Error Messages

Error messages are standardized and provide clear information about what went wrong and how to fix it.

```typescript
// Use standardized error messages
throw ErrorManager.createNotFoundError("File", filePath);
```

### 1.4 Recovery Paths

Recovery paths are defined for transient errors, with automatic retry mechanisms for operations that might fail temporarily.

```typescript
// Use withRecovery for operations that might experience transient failures
return withRecovery(async () => {
  // Operation that might fail transiently
});
```

### 1.5 Error Mapping

Node.js errors are mapped to appropriate MCP error codes based on their type and context.

```typescript
// Map Node.js errors to MCP errors
const mappedError = mapToMcpError(nodeJsError);
```

## 2. Common Error Patterns with Code Examples

### 2.1 Path Validation Errors

Path validation is a critical security measure in BatchIt. All paths must be absolute, within the root directory, and free from directory traversal attempts.

```typescript
// Path validation pattern
function validatePath(filePath: string, config: PathValidationConfig): string {
  // Check if path is absolute
  if (!path.isAbsolute(filePath)) {
    throw ErrorManager.createPathValidationError(
      filePath,
      "Path must be absolute"
    );
  }

  // Normalize path for comparison
  const normalized = path.normalize(filePath);

  // Prevent directory traversal
  if (normalized.includes("..")) {
    throw ErrorManager.createPathValidationError(
      filePath,
      "Path cannot contain parent directory references (..)"
    );
  }

  // Enforce root directory constraints
  if (!normalized.startsWith(path.normalize(config.rootDirectory))) {
    throw ErrorManager.createPathValidationError(
      filePath,
      `Path must be within root directory ${config.rootDirectory}`
    );
  }

  return normalized;
}
```

### 2.2 File Operation Errors

File operations can fail for various reasons, such as file not found, permission denied, or invalid file format.

```typescript
// File operation error handling pattern
async function readFile(filePath: string): Promise<string> {
  return withRecovery(async () => {
    const validPath = validatePath(filePath, this.config);

    try {
      await fs.access(validPath);
    } catch {
      throw ErrorManager.createNotFoundError("File", validPath);
    }

    try {
      // Check if file is binary
      const isBinary = await isBinaryFile(validPath);
      if (isBinary) {
        throw ErrorManager.createInvalidFormatError(
          "File",
          `Binary file ${validPath} cannot be read`
        );
      }

      const content = await fs.readFile(validPath, "utf-8");
      return content;
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw ErrorManager.normalizeError(
        error,
        `Failed to read file ${validPath}`
      );
    }
  });
}
```

### 2.3 Template Resolution Errors

Template resolution can fail if the template is invalid or if the data being templated is incompatible.

```typescript
// Template resolution error handling pattern
try {
  const resolvedRefs = resolveResultReferences(contentToResolve);
  const templateResult = resolveTemplates({
    template: options.template,
    content: resolvedRefs.content,
  });
  resolvedContent = templateResult.content;
} catch (error) {
  throw ErrorManager.normalizeError(
    error,
    `Failed to resolve template for ${validPath}`
  );
}

if (resolvedContent === undefined || resolvedContent === null) {
  throw ErrorManager.createInvalidFormatError(
    "Template",
    "Resolution failed to produce valid content"
  );
}
```

### 2.4 Batch Operation Errors

Batch operations can fail if individual operations fail or if dependencies between operations are not satisfied.

```typescript
// Batch operation error handling pattern
async function processBatch(operations: Operation[]): Promise<Result[]> {
  const results: Result[] = Array(operations.length).fill(null);

  const processOperation = async (operation: Operation, index: number) => {
    try {
      const result = await executeOperation(operation);
      results[index] = { success: true, result };
    } catch (error) {
      const normalizedError = ErrorManager.normalizeError(
        error,
        `Failed to execute operation ${operation.tool}`
      );
      results[index] = {
        success: false,
        error: normalizedError.message,
        errorCode: normalizedError.code
      };
    }
  };

  // Process operations in batches
  for (let i = 0; i < operations.length; i += maxConcurrent) {
    const batch = operations.slice(i, i + maxConcurrent);
    const batchPromises = batch.map((operation, batchIndex) =>
      processOperation(operation, i + batchIndex)
    );
    await Promise.all(batchPromises);
  }

  return results;
}
```

## 3. Error Mapping Documentation

BatchIt maps Node.js errors to MCP error types using the `mapToMcpError` function. This ensures consistent error handling across the application.

### 3.1 File System Errors

| Node.js Error Code | Description | MCP Error Code | Enhanced Message |
|-------------------|-------------|---------------|-----------------|
| ENOENT | No such file or directory | InvalidParams | (Original message) |
| EACCES | Permission denied | InvalidParams | Permission denied: (Original message) |
| EPERM | Operation not permitted | InvalidParams | Permission denied: (Original message) |
| EEXIST | File already exists | InvalidParams | Resource already exists: (Original message) |
| EISDIR | Is a directory when file expected | InvalidParams | Expected file but found directory: (Original message) |
| ENOTDIR | Not a directory when directory expected | InvalidParams | Expected directory but found file: (Original message) |
| EROFS | Read-only file system | InvalidParams | (Original message) |
| ENAMETOOLONG | Filename too long | InvalidParams | (Original message) |
| ELOOP | Too many symbolic links | InvalidParams | (Original message) |
| ENOTEMPTY | Directory not empty | InvalidParams | (Original message) |
| EINVAL | Invalid argument | InvalidParams | (Original message) |

### 3.2 Timeout Errors

| Node.js Error Code | Description | MCP Error Code | Enhanced Message |
|-------------------|-------------|---------------|-----------------|
| ETIMEDOUT | Connection timed out | RequestTimeout | Operation timed out: (Original message) |
| ESOCKETTIMEDOUT | Socket timeout | RequestTimeout | Operation timed out: (Original message) |
| ETIMEOUT | Generic timeout | RequestTimeout | Operation timed out: (Original message) |

### 3.3 Connection Errors

| Node.js Error Code | Description | MCP Error Code | Enhanced Message |
|-------------------|-------------|---------------|-----------------|
| ECONNREFUSED | Connection refused | ConnectionClosed | Connection error: (Original message) |
| ECONNRESET | Connection reset | ConnectionClosed | Connection error: (Original message) |
| ECONNABORTED | Connection aborted | ConnectionClosed | Connection error: (Original message) |
| EPIPE | Broken pipe | ConnectionClosed | Connection error: (Original message) |
| ESHUTDOWN | Cannot send after transport endpoint shutdown | ConnectionClosed | Connection error: (Original message) |

### 3.4 Network Errors

| Node.js Error Code | Description | MCP Error Code | Enhanced Message |
|-------------------|-------------|---------------|-----------------|
| EHOSTUNREACH | Host unreachable | InternalError | Network error: (Original message) |
| ENETUNREACH | Network unreachable | InternalError | Network error: (Original message) |
| EADDRINUSE | Address already in use | InternalError | Network error: (Original message) |
| EADDRNOTAVAIL | Address not available | InternalError | Network error: (Original message) |

### 3.5 Parse Errors

| Node.js Error Code | Description | MCP Error Code | Enhanced Message |
|-------------------|-------------|---------------|-----------------|
| EBADMSG | Bad message | ParseError | Parse error: (Original message) |
| ERR_INVALID_ARG_TYPE | Invalid argument type | ParseError | Parse error: (Original message) |
| ERR_INVALID_ARG_VALUE | Invalid argument value | ParseError | Parse error: (Original message) |
| SyntaxError | Syntax error | ParseError | Parse error: (Original message) |

### 3.6 Resource Errors

| Node.js Error Code | Description | MCP Error Code | Enhanced Message |
|-------------------|-------------|---------------|-----------------|
| EMFILE | Too many open files | InternalError | Resource error: (Original message) |
| EBUSY | Resource busy | InternalError | Resource error: (Original message) |
| ENOSPC | No space left on device | InternalError | Resource error: (Original message) |
| ENOMEM | Not enough memory | InternalError | Resource error: (Original message) |
| EAGAIN | Resource temporarily unavailable | InternalError | Resource error: (Original message) |

## 4. Best Practices for Error Handling

### 4.1 Use the ErrorManager for Standardized Error Creation

The `ErrorManager` class provides standardized methods for creating errors with consistent messages and codes.

```typescript
// Use ErrorManager for standardized error creation
throw ErrorManager.createNotFoundError("File", filePath);
throw ErrorManager.createAlreadyExistsError("File", filePath);
throw ErrorManager.createInvalidFormatError("JSON", "missing closing brace");
throw ErrorManager.createPermissionError("write", filePath);
throw ErrorManager.createTimeoutError("read operation");
throw ErrorManager.createPathValidationError(filePath, "outside root directory");
throw ErrorManager.createUnsupportedOperationError("symlink");
throw ErrorManager.createMissingParamError("path", "file operation");
```

### 4.2 Normalize Unknown Errors

Use the `normalizeError` method to convert unknown errors to MCP errors with consistent formatting.

```typescript
// Normalize unknown errors
try {
  // Operation implementation
} catch (error) {
  throw ErrorManager.normalizeError(error, "Failed during operation");
}
```

### 4.3 Enhance Errors with Context

Use the `enhanceError` method to add additional context to existing errors.

```typescript
// Enhance errors with context
try {
  // Operation implementation
} catch (error) {
  if (error instanceof McpError) {
    throw ErrorManager.enhanceError(error, "Additional context");
  }
  throw ErrorManager.normalizeError(error, "Failed during operation");
}
```

### 4.4 Use withRecovery for Transient Errors

Use the `withRecovery` function to automatically retry operations that might fail transiently.

```typescript
// Use withRecovery for transient errors
return withRecovery(async () => {
  // Operation that might fail transiently
});
```

### 4.5 Validate Paths Before Operations

Always validate paths before performing file operations to prevent security issues.

```typescript
// Validate paths before operations
const validPath = validatePath(filePath, this.config);
```

### 4.6 Preserve Error Context

Preserve error context when transforming errors to provide better debugging information.

```typescript
// Preserve error context
try {
  // Operation implementation
} catch (error) {
  throw new McpError(
    ErrorCode.InternalError,
    `Operation failed: ${error instanceof Error ? error.message : String(error)}`,
    { originalError: error }
  );
}
```

### 4.7 Use Specific Error Codes

Use specific error codes that accurately reflect the nature of the error.

```typescript
// Use specific error codes
throw new McpError(ErrorCode.InvalidParams, "Invalid parameter: path is required");
throw new McpError(ErrorCode.RequestTimeout, "Operation timed out");
throw new McpError(ErrorCode.ConnectionClosed, "Connection closed unexpectedly");
```

### 4.8 Handle Binary Files Appropriately

Check if files are binary before attempting to read them as text.

```typescript
// Handle binary files appropriately
const isBinary = await isBinaryFile(validPath);
if (isBinary) {
  throw ErrorManager.createInvalidFormatError(
    "File",
    `Binary file ${validPath} cannot be read as text`
  );
}
```

## 5. Recovery Strategies for Transient Errors

### 5.1 Identifying Transient Errors

BatchIt uses the `isTransientError` function to identify errors that are likely to be transient and can be retried.

```typescript
// Transient error identification
function isTransientError(error: unknown): boolean {
  // McpError checks
  if (error instanceof McpError) {
    switch (error.code) {
      // These errors indicate client-side issues that won't be resolved by retrying
      case ErrorCode.InvalidParams:
      case ErrorCode.InvalidRequest:
      case ErrorCode.MethodNotFound:
      case ErrorCode.ParseError:
        return false;

      // These are likely transient and worth retrying
      case ErrorCode.ConnectionClosed:
      case ErrorCode.RequestTimeout:
        return true;

      // For InternalError, check the message
      case ErrorCode.InternalError:
        const message = error.message.toLowerCase();
        return (
          message.includes("timeout") ||
          message.includes("connection") ||
          message.includes("network")
        );

      default:
        return false;
    }
  }

  // Node.js error checks
  if (error instanceof Error && "code" in error) {
    const code = (error as any).code;

    // Common transient error codes
    const transientCodes = [
      "ECONNRESET",
      "ECONNREFUSED",
      "ECONNABORTED",
      "ETIMEDOUT",
      "ESOCKETTIMEDOUT",
      "EAGAIN",
    ];

    return transientCodes.includes(code);
  }

  // Default to non-transient for unknown errors
  return false;
}
```

### 5.2 Exponential Backoff Retry

BatchIt uses exponential backoff for retrying operations that fail with transient errors.

```typescript
// Exponential backoff retry configuration
const config: RecoveryConfig = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 5000,
  backoffFactor: 2,
  preserveContext: true,
};

// Calculate delay with exponential backoff
const delay = Math.min(
  config.initialDelay * Math.pow(config.backoffFactor, retries - 1),
  config.maxDelay
);
```

### 5.3 Using withRecovery

The `withRecovery` function provides a simple way to add retry logic to any operation.

```typescript
// Using withRecovery with custom configuration
return withRecovery(
  async () => {
    // Operation implementation
  },
  {
    maxRetries: 5,
    initialDelay: 200,
    maxDelay: 10000,
    backoffFactor: 1.5,
    preserveContext: true,
  }
);
```

### 5.4 Handling Non-Transient Errors

Non-transient errors are thrown immediately without retrying.

```typescript
// Handling non-transient errors
if (!isTransientError(error)) {
  if (error instanceof McpError) {
    throw error;
  } else {
    throw new McpError(
      ErrorCode.InternalError,
      `Non-retryable error: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}
```

### 5.5 Preserving Context After Retries

Error context is preserved after retries to provide better debugging information.

```typescript
// Preserving context after retries
throw new McpError(
  ErrorCode.InternalError,
  `Operation failed after ${retries} retries: ${error instanceof Error ? error.message : String(error)}`,
  {
    originalError: error,
    retryAttempts: retries,
  }
);
```

### 5.6 Custom Recovery Strategies

For more complex recovery strategies, you can implement custom logic based on the specific requirements of the operation.

```typescript
// Custom recovery strategy
async function withCustomRecovery<T>(
  operation: () => Promise<T>,
  isRetryable: (error: unknown) => boolean,
  config: Partial<RecoveryConfig> = {}
): Promise<T> {
  // Merge with defaults
  const cfg = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  let retries = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      // Check if the error is retryable using custom logic
      if (!isRetryable(error)) {
        // Non-retryable errors should be thrown immediately
        if (error instanceof McpError) {
          throw error;
        } else {
          throw new McpError(
            ErrorCode.InternalError,
            `Non-retryable error: ${error instanceof Error ? error.message : String(error)}`,
            cfg.preserveContext ? { originalError: error } : undefined
          );
        }
      }

      retries++;

      // Stop if max retries reached
      if (retries >= cfg.maxRetries) {
        throw new McpError(
          ErrorCode.InternalError,
          `Operation failed after ${retries} retries: ${error instanceof Error ? error.message : String(error)}`,
          cfg.preserveContext
            ? {
                originalError: error,
                retryAttempts: retries,
              }
            : undefined
        );
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        cfg.initialDelay * Math.pow(cfg.backoffFactor, retries - 1),
        cfg.maxDelay
      );

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
```

## Conclusion

Following these error handling patterns and best practices will ensure consistent, reliable, and maintainable error handling throughout the BatchIt codebase. By using standardized error types, preserving error context, and implementing recovery strategies for transient errors, BatchIt can provide a robust and user-friendly experience even when things go wrong.
