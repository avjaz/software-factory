# Architecture & modules

## Module taxonomy (one concern each)

A small app is one Maven module with these as packages; a larger one promotes
them to modules. The boundaries don't change.

Per external system, a trio:

- `<system>-spec` — the OpenAPI/WSDL spec + **generated** models
- `<system>-api` — hand-written interfaces over the generated types
- `<system>-client` — REST/SOAP client wiring that implements those interfaces

Plus shared ones:

- `mapping` — all MapStruct mappers, nothing else
- `common` — small shared utilities, the `@Generated` annotation
- entry points — thin controllers / handlers that validate and delegate
- `acceptance` — Cucumber features + steps + factories + assertions

## Spec-first, generated code quarantined

- Never hand-write API models/clients: OpenAPI for REST, WSDL for SOAP,
  generated at build (e.g. openapi-generator).
- Generated packages are excluded from coverage and static analysis via one
  shared exclusion property. Hand-written code is never excluded.

## Mapping (MapStruct)

```java
@Mapper(
    injectionStrategy = InjectionStrategy.CONSTRUCTOR,
    unmappedTargetPolicy = ReportingPolicy.IGNORE,
    uses = OrderConverters.class
)
```

- `@BeanMapping(ignoreByDefault = true)` — every mapped field is an explicit
  `@Mapping`; nothing maps by accident.
- Shared converters in a `uses` class; `@Named`-qualified converter methods.
- Conditional/contextual logic via `@Context` objects + `@AfterMapping` hooks.
- Field-set knowledge (which source fields feed this mapper) declared as
  constants on the mapper interface, tested against.

## Construction lives at the composition root

`new` for a **collaborator or long-lived backing state** (a service, a client,
the list/map a store holds) belongs in a `@Configuration` `@Bean`, injected —
never `new`-ed into a field. Two exemptions, or the rule becomes unfollowable:

- **Value objects / records** — `new Order(...)`, `new LineItem(...)`,
  `new AuthContext(...)`. Per-request values can't come from a config bean.
- **Method-local scratch** — a `new ArrayList<>()` accumulating results inside a
  method.

Everything else that would be `new`-ed as durable state moves to `@Configuration`.

## Config & seed data

- **No literal seed/lookup/config data, and no `new`-ed backing collection,
  inside a logic class.** Push it to an `@Bean` and constructor-inject it.
  Payoff: the unit test supplies its own real/random data (upholds "no literal
  test data"), and the bean is the deployment swap point (a database-backed
  lookup or a remote config service replaces the in-memory seed with no change
  to the consumer).
- The config bean is a dependency-graph source with no logic → tag it
  `@Generated` (see build-quality). The consumer keeps the logic and stays 100%
  tested. `@Generated` marks *"no logic"*, not *"leaf"*: a leaf that has logic
  is tested normally.
- **Injecting the backing structure doesn't make it a mockable collaborator.**
  A `List`/`Map` is data — the consuming class is still a *state* test (build a
  real one, assert outputs), never `given/then` over a mocked collection.
- Gotchas on collection injection points:
  - A `Map<String,T>` / `List<T>` parameter **aggregates all `T` beans**, not
    "the bean you defined". Put a matching `@Qualifier` on both the `@Bean` and
    the parameter.
  - If the consumer mutates it (e.g. a store's `addAll`), the `@Bean` must
    return a **mutable** instance (`new ArrayList<>()`), not `List.of()`.

## Runtime patterns

- **Strategy + resolver** for event dispatch: an `OrderEventHandler`
  interface, one handler bean per event type, a resolver picks by type — no
  switch in the handler path.
- **Repository interface + impl + decorator** for storage/caching concerns.
- Bounded retry with backoff on remote calls, in the client layer.
  `@RestControllerAdvice` / filters at the HTTP boundary only.
- Secrets via an `ApplicationSecret` record hydrated once at the composition
  root from the platform's secret store — never read in logic classes.
