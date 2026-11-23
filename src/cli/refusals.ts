import { ConfigError } from '../config/config-error.js';
import { PackError } from '../packs/pack-error.js';
import { RefusalError } from '../refusal.js';
import { FactoryYamlError } from '../target/factory-yaml-error.js';
import { TicketError } from '../tickets/ticket-error.js';

const refusalErrors = [
  RefusalError,
  PackError,
  FactoryYamlError,
  ConfigError,
  TicketError,
] as const;

export function isRefusal(e: unknown): e is Error {
  return refusalErrors.some((type) => e instanceof type);
}
