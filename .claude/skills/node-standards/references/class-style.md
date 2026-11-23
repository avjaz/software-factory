# Class & module style

## Shape

- **Functions before classes.** No collaborators + no state → an exported
  function. Collaborators or long-lived state → a class with constructor
  injection. Never wrap a pure function in a class to look enterprise; never
  smuggle collaborators in through module-level singletons to avoid one —
  module state is the enemy of the no-module-mocking rule.
- Average class ~50 lines; entry points (Lambda handlers, route modules) stay
  under 60 lines: validate → parse → resolve → delegate, nothing else.
- One responsibility per class/module; split before 150 lines of logic. Long
  declarative constant tables (`const FIELD_IDS = new Set([...]) as const`)
  don't count against size.
- ESM only (`"type": "module"`), one export concern per file. No default
  exports in src (named exports grep and refactor honestly); default export
  only where a framework demands it.

## Immutability & state

- Hand-written value types are **`readonly` interfaces/types** + object
  literals — even two-field ones:

  ```ts
  export interface OrderPlaced {
    readonly orderId: string;
    readonly customerId: string;
  }
  ```

  No classes for pure data; there is no value equality in JS, so `equals`
  lives in tests as `toEqual` and nowhere in production code.
- Collaborators as `private readonly` constructor parameter properties:

  ```ts
  export class InvoiceService {
    constructor(private readonly taxCalculator: TaxCalculator) {}
  }
  ```

- Collections exposed or stored: `ReadonlyArray<T>` / `ReadonlyMap<K, V>` /
  `ReadonlySet<T>`; accept the readonly form in signatures unless mutation is
  the class's job (a store). `as const` for literal tables.
- **`const` everywhere; `let` only when reassignment is the algorithm.** No
  setters; no mutating getters. `exactOptionalPropertyTypes` keeps optional
  fields honest (absent ≠ explicitly undefined).
- Domain knowledge (field lists, routing tables) lives in module-level
  `const … as const` declarations composed declaratively, not procedural code.

## Flow

- Guard clauses + early return; log the reason at `info` when returning early.
- Multiple typed entry points: function overload signatures all delegating to
  one implementation, or explicitly named methods delegating to one private
  method.
- Composition over inheritance: **interfaces** as the contract, plain classes
  as implementations, decorators wrapping them (repository interface,
  file-store impl, caching decorator). `extends` only for `Error` hierarchies.
- **Async discipline**: every promise `await`ed or `return`ed —
  `no-floating-promises` and `no-misused-promises` enforce it. No `async`
  function that never awaits; no `.then` chains where `await` reads straight.

## Errors

- One custom `Error` subclass per failure domain (`InvoiceError`,
  `PaymentGatewayError`…), with `name` set — otherwise every error reports as
  `Error` in logs:

  ```ts
  export class InvoiceError extends Error {
    constructor(message: string, options?: ErrorOptions) {
      super(message, options);
      this.name = 'InvoiceError';
    }
  }
  ```

- Catch broad errors **only at boundaries**; log there, rethrow wrapped with
  a message that names what failed, chained via `cause`. Re-throw domain
  errors untouched first:

  ```ts
  catch (e) {
    if (e instanceof InvoiceError) throw e;
    log.error({ orderId }, 'Invoice creation failed');
    throw new PaymentGatewayError(`Failed to bill order ${orderId}`, { cause: e });
  }
  ```

- A caught value is `unknown` (`useUnknownInCatchVariables` rides along with
  strict) — narrow before touching `.message`.
- Never swallow; never log-and-continue on a failure the caller must know
  about; no empty `catch`.

## Logging

- **pino**, structured. One module-level child logger per file:

  ```ts
  const log = logger.child({ module: 'invoice-service' });
  ```

  The base `logger` instance is built once in composition; child creation is
  cheap and keeps the per-file-site granularity of `getLogger(getClass())`.
- Structured fields first, message second — `log.info({ orderId }, 'Creating invoice')` —
  never template-interpolate data into the message string.
- `info` for lifecycle facts, `debug` for payloads, `error` immediately
  before throwing.
