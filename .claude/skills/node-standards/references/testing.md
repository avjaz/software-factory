# Unit test style

## Anatomy (follow exactly)

```ts
// tests/unit/invoice-service.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { InvoiceService } from '../../src/invoice-service.js';
import type { OrderPlaced } from '../../src/events.js';
import type { TaxCalculator } from '../../src/tax.js';
import { someString } from '../support/data.js';

describe('InvoiceService', () => {
  let taxCalculator: MockProxy<TaxCalculator>; // collaborator mocks first
  let subject: InvoiceService;                 // subject last

  beforeEach(() => {
    taxCalculator = mock<TaxCalculator>();     // typed mock
    subject = new InvoiceService(taxCalculator); // manual construction — honest constructor
  });

  it('Can_throw_an_error_when_customer_id_is_blank', () => {
    const order: OrderPlaced = { orderId: someString(), customerId: '' }; // value type → build real

    // When
    const actual = () => subject.create(order);

    // Then
    expect(actual).toThrow(/^Missing customer id$/);   // anchored = exact message
    expect(taxCalculator.calculate).not.toHaveBeenCalled();
  });
});
```

## Rules

- **Names**: `Can_<behavior>` / `Can_<behavior>_when_<condition>` — the exact
  snake_case sentence, capitalised `Can_`, kept verbatim from the Java house
  style so behaviors grep identically across languages. One behavior per test.
- **`beforeEach` is `@BeforeEach`**: fresh `mock<T>()` per collaborator, the
  subject constructed **by hand** so the constructor stays honest. No DI
  container in tests, no `vi.mock()` / `vi.doMock()` module mocking, no
  spying on imports — anything you would module-mock is a collaborator that
  should be injected.
- **`mock<Interface>()` (vitest-mock-extended) always.** It's a typed proxy:
  stubbing a method that doesn't exist, or asserting with wrong argument
  types, fails compilation — the autospec/`mock(X.class)` equivalent. A hand
  object of untyped `vi.fn()`s compiles against typos; don't build one.
- **BDD dialect maps 1:1** — same discipline, different spelling:

  | BDDMockito | Vitest + mock-extended |
  |---|---|
  | `given(x.foo(a)).willReturn(v)` | `x.foo.mockReturnValue(v)` |
  | *(async)* | `x.foo.mockResolvedValue(v)` / `mockRejectedValue(e)` |
  | `given(x.foo(a)).willThrow(e)` | `x.foo.mockImplementation(() => { throw e; })` |
  | `then(x).should().foo(a, b)` | `expect(x.foo).toHaveBeenCalledExactlyOnceWith(a, b)` |
  | `then(x).should(never()).foo(…)` | `expect(x.foo).not.toHaveBeenCalled()` |
  | `then(x).shouldHaveNoInteractions()` | per-method `not.toHaveBeenCalled()` on every method that path could reach |

  There is no whole-object silence assertion — name the methods the guarded
  path must not touch; that specificity is a feature, not a loss.
- **`// Given // When // Then` comments** delimit every test. Local
  declarations may sit above `// Given`. A test with no stubbing may omit
  `// Given`.
- **No literal test data**: `tests/support/data.ts` provides faker-backed
  helpers (`someString()`, `somePositiveInteger()`, `someIsoDate()`…) for
  scalars; **Fishery** factories for object graphs, with targeted overrides:
  `orderFactory.build({ placedOn: someIsoDate() })`. Factories live in
  `tests/support/factories.ts`.
- **Inject behavior, construct data.** Behavior (service, client, handler) →
  constructor-inject and `mock<T>()`. Values (a seed Map, a string, a
  readonly object, any array) → build it real. Mocking a Map only re-states
  the implementation and buys nothing. The sole legal mock of a value type:
  an opaque pass-through argument handed between real collaborators, never
  with a method stubbed on it.
- **`expect.anything()` is a smell, not a default.** Prefer, in order:
  - method must not fire on this path → `expect(x.foo).not.toHaveBeenCalled()`
  - argument the subject constructs internally (a context object, a
    timestamp) → **typed** `expect.any(BillingContext)` in that one position,
    real captured values everywhere else:
    `expect(mapper.toInvoice).toHaveBeenCalledExactlyOnceWith(order, expect.any(BillingContext));`
    Asymmetric matchers mix freely with real args (no Mockito all-or-nothing
    constraint), so there is even less excuse for spraying them.
  Capture the randoms you passed in (`const body = someString()`) and assert
  against them.
- **Don't assert a random value through a transform.** `someString()` can
  emit quote/backslash/unicode; once JSON-stringified or URL-encoded,
  `expect(payload).toContain(theRandom)` fails spuriously. Assert random ids
  against the raw collateral the subject exposes, and keep `toContain` /
  `stringContaining` to stable literals — including readable fixture ids you
  deliberately injected (`SKU-A`, `STORE-1 (Main St)`).
- **Assert exception messages exactly.** Trap: `toThrow('Missing')` is a
  **substring** match and passes against `'Missing customer id for order X'`.
  House idiom is the anchored regex `toThrow(/^Missing customer id$/)`;
  assert the error **class** too when the domain matters:
  `expect(actual).toThrow(InvoiceError)`. (`toThrowError` is deprecated in Vitest 5 and fails lint.)
- **Async subjects**: `await expect(subject.handle(e)).rejects.toThrow(/^…$/)`
  and `expect(x.foo).toHaveBeenCalled…` as normal — mock-extended methods
  stubbed with `mockResolvedValue` keep the promise types honest.
- **`it.each`** for value-table behaviors (the `@ParameterizedTest` +
  `@CsvSource` analogue).
- **Assertion style**: Vitest `expect` only — `toBe` for identity/primitives,
  `toEqual` for structural equality (this is where JS's missing value
  equality lives), `toBeCloseTo` for floats. No chai, no extra matcher
  libraries in unit tests.

## Model types

**Pure `readonly` interfaces/types are exempt from dedicated tests** — they
have no runtime code, so there is nothing to cover; use through consumers'
tests is the coverage. Any hand-written function attached to the domain (a
guard, a computed `percent()`) is logic and gets tested like any other.

Zod schemas at boundaries: plain field declarations need no test; any
`.refine()` / `.transform()` / custom message is logic → tested (accepting
and rejecting branches both).

## Leaf / state tests

A class with no collaborators (a store, a lookup, a value type with logic) is
a state test: build it real, drive its methods, assert outputs — no mocks.
Cover every branch, guards included. The seed it needs is injected (from the
composition root in production), so the test supplies its own random data.

```ts
describe('TokenStore', () => {
  let token: string;
  let context: AuthContext;
  let subject: TokenStore;

  beforeEach(() => {
    token = someString();
    context = { user: someString(), scopes: new Set([someString()]) };
    subject = new TokenStore(new Map([[token, context]]));   // real Map, injected
  });

  it('Can_resolve_context_when_token_is_present', () => {
    // When
    const actual = subject.resolve(token);
    // Then
    expect(actual).toBe(context);
  });

  it('Can_return_undefined_when_token_is_absent', () => {
    expect(subject.resolve(someString())).toBeUndefined();
  });

  it('Can_return_undefined_when_token_is_empty', () => {
    expect(subject.resolve('')).toBeUndefined();             // guard branch
  });
});
```

## Higher-order interaction tests

A class that orchestrates collaborators (a service, router, registry, the
loop that drives a client) asserts on the **interactions**, not on re-derived
outputs — its collaborators are already 100% tested. Mock the collaborators,
drive the subject, prove it called them correctly and applied its OWN logic
(guards, routing, scope injection, accumulation) on top.

- **Assert the subject's own logic, not the collaborator's.** Verify the
  interaction happened and check what the subject *adds*; never re-assert a
  value the collaborator computed and returned.

```ts
// Given
catalog.findPrice.mockResolvedValue(expected);
// When
const actual = await registry.execute('find_price', storeId, { sku });
// Then
expect(actual).toBe(expected);                                         // pass-through is the subject's job
expect(catalog.findPrice).toHaveBeenCalledExactlyOnceWith(storeId, sku); // injected scope + real args
```

> **mock-extended notes:** `mock<T>()` needs an **interface or type** — mock
> the interface your class depends on, not a concrete class
> (which the architecture prescribes anyway). For deep generated models the
> `mockDeep<T>()` variant is the `RETURNS_DEEP_STUBS` analogue — acceptable
> there, a smell elsewhere.
>
> **Declare collaborator interfaces with property signatures**, not method
> signatures: `readonly readText: (path: string) => Promise<string>;` rather
> than `readText(path: string): Promise<string>;`. With a method signature,
> `expect(fileReader.readText).toHaveBeenCalled…` fails strictTypeChecked's
> `@typescript-eslint/unbound-method`. The implementing class still uses an
> ordinary method.

## Pyramid

unit (Vitest, default project, 100% per-file enforced) → integration
(`*.it.test.ts`, separate Vitest project, coverage-excluded, testcontainers /
msw) → acceptance module (cucumber-js, business-readable Gherkin: "As a… I
want… So that…", `Background`, `@manual`/`@slow` tags, msw/wiremock stubs) →
`.http` smoke tests.
