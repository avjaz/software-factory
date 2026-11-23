export class ConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`factory config: ${message}`, options);
    this.name = 'ConfigError';
  }
}
