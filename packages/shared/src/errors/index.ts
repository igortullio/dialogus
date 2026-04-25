export class DialogusError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class ConfigError extends DialogusError {}
export class NotFoundError extends DialogusError {}
export class ValidationError extends DialogusError {}

export class InvalidCursorError extends DialogusError {
  constructor(
    public readonly cursor: string,
    cause?: unknown,
  ) {
    super('INVALID_CURSOR', `Invalid cursor: ${cursor}`, cause)
  }
}

export class IdempotencyKeyConflictError extends DialogusError {
  constructor(
    public readonly key: string,
    message = `Idempotency-Key ${key} reused with a different request body`,
  ) {
    super('IDEMPOTENCY_KEY_CONFLICT', message)
  }
}
