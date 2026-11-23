export class FactoryYamlError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`.factory.yaml: ${message}`, options);
    this.name = 'FactoryYamlError';
  }
}
