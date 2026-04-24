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
