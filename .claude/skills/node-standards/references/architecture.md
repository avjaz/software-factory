# Architecture & packages

## Package taxonomy (src layout, one concern each)

```
src/
  <system>/
    generated/        # openapi-typescript output — never hand-edited
    api.ts            # hand-written interfaces over the generated types
    client.ts         # openapi-fetch/undici wiring, retry, auth — implements the interfaces
  mapping/            # all mapper functions, nothing else
  common/             # small shared utilities
  entrypoints/        # thin edges: Lambda handler / Fastify routes
  composition.ts      # the composition root — builds the object graph
  config.ts           # zod-parsed env — typed settings, fails fast at startup
tests/
  unit/  integration/  support/    # support = data.ts helpers + factories.ts
acceptance/                        # cucumber-js features + steps
smoke-tests/                       # .http files
```

Per external system, the same trio as Java: generated spec code, hand-written
API surface, client wiring. The interface layer (`api.ts`) is what the rest
of the app imports — nothing outside `client.ts` touches `generated/` types
directly except `mapping/`. A monorepo (pnpm workspaces) promotes these
directories to packages; the boundaries don't change.

## Spec-first, generated code quarantined

- Never hand-write API models/clients: `openapi-typescript` generates the
  types, `openapi-fetch` gives a typed client over them; regenerate on spec
  change, commit the output under `generated/`.
- `generated/` is excluded from coverage, eslint, AND the strictest tsconfig
  checks via the shared exclusion globs in the config files (see
  build-quality). Hand-written code is never excluded.

## Mapping (the MapStruct gap — TS closes most of it)

Explicit mapper functions returning typed object literals:

```ts
export function toInvoiceRequest(order: Order, ctx: BillingContext): InvoiceRequest {
  return {
    orderId: order.id,
    customerId: order.customerId,
    issuedOn: toIsoDate(order.placedOn),   // shared converter
    currency: ctx.currency,
  };
}
```

- On an object **literal**, TS errors on a missing required field AND on an
  excess field — that is most of `ignoreByDefault` at compile time.
  Optional target fields remain the blind spot; the mapper's unit test
  covering every field closes it.
- Always return a literal directly — assigning through an intermediate
  variable or spreading (`...order`) defeats excess-property checking and
  maps fields by accident. **No spreads in mappers.**
- Shared converters are plain functions in `mapping/converters.ts`.
- Field-set knowledge (which source fields feed this mapper) declared as a
  `const … as const` set next to the mapper, tested against.
- Conditional/contextual logic via an explicit context parameter (a readonly
  object), not module state.

## Construction lives at the composition root

Instantiating a **collaborator or long-lived backing state** (a service, a
client, the Map/array a store holds) belongs in `composition.ts`, injected —
never `new`-ed inside a logic class and **never created as module-level
state** (a module-scope `const client = createClient()` is a hidden
singleton and the reason people reach for `vi.mock()`). Two exemptions:

- **Value objects / literals** — `{ orderId, customerId }`, `new Date(…)`.
  Per-request values can't come from the composition root.
- **Method-local scratch** — a `[]` accumulating results inside a function.

Fastify/Express: routes receive the composed objects via app locals /
plugin options — no logic class imports the framework. Lambda: the handler
module calls `composition.build(config)` once at cold start (top level is
fine — it is the composition call, not logic) and delegates per event.

## Config & seed data

- **No literal seed/lookup/config data, and no constructed backing
  collection, inside a logic module.** Push it to `composition.ts` /
  `config.ts` and constructor-inject it. Payoff: the unit test supplies its
  own real/random data (upholds "no literal test data"), and the composition
  root is the deployment swap point (a database-backed lookup or a remote
  config service replaces the in-memory seed with no change to the
  consumer).
- `config.ts` parses `process.env` through a zod schema once, exports the
  frozen result; **no `process.env` reads in logic code.**
- `composition.ts` and `config.ts` are dependency-graph sources with no
  logic → they sit on the coverage exclude list (the `@Generated` analogue).
  That marks *"no logic"*, not *"leaf"*: a leaf that has logic is tested
  normally, never excluded. Branching that creeps into composition moves out
  into a tested class. (Zod refinements in config count as logic — test them
  via a small exported schema, keep the hydration call excluded.)
- **Injecting the backing structure doesn't make it a mockable
  collaborator.** A `Map`/array is data — the consuming class is still a
  *state* test (build a real one, assert outputs), never stubbing a mocked
  collection.
- Gotchas on collection injection:
  - If the consumer mutates it (a store's `addAll`), composition must pass a
    **fresh mutable instance per graph**, never a shared module-level
    literal (ESM module state is a process-wide singleton).
  - Type the injection point as the capability needed:
    `ReadonlyMap<string, T>` for read-only consumers, `Map<string, T>` only
    when mutation is the job.

## Runtime patterns

- **Strategy + resolver** for event dispatch: an `OrderEventHandler`
  interface, one implementation per event type, an injected
  `ReadonlyMap<EventType, OrderEventHandler>` registry built in
  composition — no switch/if-else chains in the handler path.
- **Repository interface + impl + decorator** for storage/caching concerns.
- **p-retry** (bounded attempts + backoff) wrapping remote calls in the
  client layer; framework error handlers / middleware at the HTTP boundary
  only.
- Secrets via a readonly `ApplicationSecret` object hydrated from the
  platform's secret store inside composition — never read from
  `process.env` in logic code.
