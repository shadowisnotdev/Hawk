export class BotError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string = 'An unexpected error occurred.',
    public readonly severity: 'warning' | 'error' | 'critical' = 'error',
  ) {
    super(message);
    this.name = 'BotError';
  }
}

export class CommandError extends BotError {
  constructor(userMessage: string, internalMessage?: string) {
    super(internalMessage ?? userMessage, userMessage, 'warning');
    this.name = 'CommandError';
  }
}

export class PermissionError extends BotError {
  constructor(userMessage: string, internalMessage?: string) {
    super(internalMessage ?? userMessage, userMessage, 'warning');
    this.name = 'PermissionError';
  }
}

export class ValidationError extends BotError {
  constructor(userMessage: string, internalMessage?: string) {
    super(internalMessage ?? userMessage, userMessage, 'warning');
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends BotError {
  constructor(internalMessage: string) {
    super(internalMessage, 'A database error occurred. Please try again later.', 'error');
    this.name = 'DatabaseError';
  }
}

export function getUserMessage(error: unknown): string {
  if (error instanceof BotError) return error.userMessage;
  return 'An unexpected error occurred.';
}

export function getInternalMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
