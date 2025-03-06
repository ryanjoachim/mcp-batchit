import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { eventBus } from "./eventBus.js";
import { z } from "zod";

export enum RecoveryEventType {
  RetryAttempt = "retry_attempt",
  RetrySuccess = "retry_success",
  RetryFailure = "retry_failure",
  MaxRetriesExceeded = "max_retries_exceeded"
}

const RecoveryConfigSchema = z.object({
  maxRetries: z.number().default(3),
  initialDelay: z.number().default(1000),
  maxDelay: z.number().default(30000),
  backoffFactor: z.number().default(2)
});

type RecoveryConfig = z.infer<typeof RecoveryConfigSchema>;

async function withRecovery<T>(
  operation: () => Promise<T>,
  config: Partial<RecoveryConfig> = {}
): Promise<T> {
  const recoveryConfig = RecoveryConfigSchema.parse(config);
  let retries = 0;

  while (retries < recoveryConfig.maxRetries) {
    try {
      const result = await operation();
      if (retries > 0) {
        eventBus.emit(RecoveryEventType.RetrySuccess, { retries });
      }
      return result;
    } catch (error) {
      retries++;

      const delay = Math.min(
        recoveryConfig.initialDelay * Math.pow(recoveryConfig.backoffFactor, retries - 1),
        recoveryConfig.maxDelay
      );

      eventBus.emit(RecoveryEventType.RetryAttempt, {
        error,
        retries,
        delay,
        maxRetries: recoveryConfig.maxRetries
      });

      if (retries === recoveryConfig.maxRetries) {
        eventBus.emit(RecoveryEventType.MaxRetriesExceeded, {
          error,
          retries
        });
        throw new McpError(
          ErrorCode.InternalError,
          `Operation failed after ${recoveryConfig.maxRetries} retries: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      eventBus.emit(RecoveryEventType.RetryFailure, {
        error,
        retries,
        willRetry: true
      });
    }
  }

  // TypeScript control flow doesn't recognize that this is unreachable
  throw new McpError(ErrorCode.InternalError, 'Unreachable code');
}

export { withRecovery, RecoveryConfigSchema };
