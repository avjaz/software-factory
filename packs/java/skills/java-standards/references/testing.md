# Unit test style

## Anatomy (follow exactly)

```java
class InvoiceServiceTest {

    private TaxCalculator taxCalculator;   // collaborator mocks as fields
    private InvoiceService service;        // subject last

    @BeforeEach
    void setUp() {
        taxCalculator = mock(TaxCalculator.class);   // plain mock()
        service = new InvoiceService(taxCalculator); // manual construction
    }

    @Test
    void Can_throw_an_exception_when_customer_id_is_blank() {
        final OrderPlaced order = mock(OrderPlaced.class);
        final String orderId = someString();         // random, never literal

        // Given
        given(order.orderId()).willReturn(orderId);
        given(order.customerId()).willReturn("");

        // When
        final InvoiceException actual =
            assertThrows(InvoiceException.class, () -> service.create(order));

        // Then
        assertEquals("Missing customer id", actual.getMessage());
        then(taxCalculator).shouldHaveNoInteractions();   // untouched → exact, no any()
    }
}
```

## Rules

- **Names**: `Can_<behavior>` / `Can_<behavior>_when_<condition>`, snake_case
  sentence, capitalised `Can_`. One behavior per test.
- **No `@ExtendWith`/`@InjectMocks`/`@Mock` annotations** — plain `mock(X.class)`
  in `setUp`, subject constructed by hand so the constructor stays honest.
- **BDDMockito only**: `given(...).willReturn(...)`, `then(mock).should()`,
  `then(mock).should(never())`, `then(mock).shouldHaveNoInteractions()`. Never
  `when/verify`. See **Higher-order interaction tests** below.
- **`// Given // When // Then` comments** delimit every test. Local declarations
  may sit above `// Given`.
- **No literal test data**: shiver-me-timbers `someString()`,
  `somePositiveInteger()`, etc. for scalars (static imports from
  `shiver.me.timbers.data.random`; Maven coordinates in `build-quality.md`);
  **Instancio** for object graphs,
  with targeted overrides: `Instancio.of(Order.class).set(field(Order::placedOn), ...).create()`.
- **Inject behavior, construct data.** Before mocking, ask: does this have
  *behavior* I'd fake, or is it just *values*? Behavior (service, client,
  handler) → constructor-inject and mock. Values (a seed map, a String, a
  record, any JDK collection) → build it real. Mocking a value type only
  re-states the implementation (`then(map).should().get(k)` restates the
  source) and buys nothing. The sole legal `mock(Map.class)`: an opaque
  pass-through argument handed between real collaborators, never with a method
  stubbed on it.
- **Mock vs build**: mock collaborators AND domain inputs for interaction tests
  (services, handlers); build real populated objects (Instancio) for state
  tests (mappers, stores, value types with logic). `RETURNS_DEEP_STUBS` is
  acceptable for deep generated models.
- Assert thrown-exception **messages**, not just types.
- `@ParameterizedTest` + `@CsvSource` for value-table behaviors.
- Hamcrest `assertThat(x, is(...))` or JUnit `assertEquals` — either, be
  consistent within a class. smt-matchers for time-ish assertions.
  **No AssertJ in unit tests** — keep it to the acceptance module. The fluent style (`assertThat(x).isEqualTo(...)`) drifts
  in easily because starter-test bundles it; if a unit test imports
  `org.assertj`, convert it (`is(...)`/`nullValue()`/`contains(...)`/
  `containsString(...)`, `assertThrows` + message `assertEquals`).

## Model classes

Cover hand-written models with the verifier trio instead of hand assertions:
`EqualsVerifier.forClass(X.class).verify()`, `ToStringVerifier`, bean-matchers
(`hasValidBeanConstructor()` etc.).

**Records are exempt from the trio**: equals/hashCode/toString are
compiler-generated and JaCoCo filters record boilerplate, so construction
through real use in the consumers' tests covers them — no dedicated test, no
coverage exclusion. Any hand-written method on a record (a guard, a computed
accessor like `percent()`) is logic and gets tested like any other.

## Leaf / state tests

A class with no collaborators (a store, a lookup, a value type with logic) is a
state test: build it real, drive its methods, assert outputs — no mocks. Cover
every branch, guards included. The seed it needs is injected (from a
`@Generated` `@Configuration`), so the test supplies its own random data — no
literal test data.

```java
class TokenStoreTest {

    private String token;
    private AuthContext context;
    private TokenStore tokenStore;

    @BeforeEach
    void setUp() {
        token = someString();
        context = new AuthContext(someString(), Set.of(someString()));
        tokenStore = new TokenStore(Map.of(token, context));   // real map, injected
    }

    @Test
    void Can_resolve_context_when_token_is_present() {
        // When
        final AuthContext actual = tokenStore.resolve(token);
        // Then
        assertThat(actual, is(context));
    }

    @Test
    void Can_return_null_when_token_is_absent() {
        assertThat(tokenStore.resolve(someString()), is(nullValue()));
    }

    @Test
    void Can_return_null_when_token_is_null() {
        assertThat(tokenStore.resolve(null), is(nullValue()));   // guard branch
    }
}
```

## Higher-order interaction tests

A class that orchestrates collaborators (a service, controller, registry, the
loop that drives a client) is the mirror image of a state test: its
collaborators are already 100% tested, so you assert on the **interactions**,
not on re-derived outputs. Mock the collaborators, drive the subject, prove it
called them correctly and applied its OWN logic (guards, routing, scope
injection, accumulation) on top.

- **Assert the subject's own logic, not the collaborator's.** Verify the
  interaction happened and check what the subject *adds*; never re-assert a
  value the collaborator computed and returned — that just retests the lower
  class through a second door.
- **`any()` is a smell, not a default.** Reach for it only when the argument
  genuinely isn't the point. Prefer:
  - collaborator wholly untouched on this path → `then(x).shouldHaveNoInteractions()`
  - one method must not fire → `then(x).should(never()).foo(realArg1, realArg2)`
    with the **real expected args**, not `any()`.
  Matching real args is what makes `never()` mean "not with THESE inputs"
  instead of the near-vacuous "not at all". Capture the randoms you passed in
  (`someString()` into a local) and assert against them.
  When one argument genuinely can't be matched — the subject constructs it
  internally (a context object, a timestamp) — use the **typed** form
  `any(BillingContext.class)` and wrap every other arg in `eq(...)` (Mockito
  matchers are all-or-nothing):
  `then(mapper).should().toInvoice(eq(order), any(BillingContext.class));`
  Bare untyped `any()` is the last resort; prefer `eq()` + typed `any(Class)`.
- **Don't assert a random value through a transform.** `someString()` emits
  quote/backslash/control chars; once it's been JSON-escaped, URL-encoded, or
  otherwise mangled, `contains(theRandomValue)` fails spuriously. Assert random
  ids against the raw collateral the subject exposes (a `sources()` list, a
  captor), and keep substring `contains(...)` to stable literals — including
  the readable ids you deliberately injected as fixtures (`SKU-A`,
  `STORE-1 (Main St)`).

```java
// Given
given(catalog.findPrice(storeId, sku)).willReturn(expected);
// When
final ToolResult actual = registry.execute("find_price", storeId, Map.of("sku", sku));
// Then
assertThat(actual, is(sameInstance(expected)));   // pass-through is the subject's job
then(catalog).should().findPrice(storeId, sku);   // injected scope + real args
```

> **New-JDK Mockito note:** under JDK integrity-by-default (JDK 24+/26) the
> inline mock maker fails to mock concrete classes ("Could not modify all
> classes … java.lang.Object"). The factory's Java skeleton already ships
> `src/test/resources/mockito-extensions/org.mockito.plugins.MockMaker`
> containing `mock-maker-subclass`; add it only if a repo lacks it. The
> subclass maker needs no class redefinition or agent. Works for any
> non-final collaborator; no pom/agent changes.

## Pyramid

unit (surefire, 100% enforced) → `IT*` integration (failsafe, coverage-excluded)
→ Cucumber acceptance module (business-readable Gherkin: "As a… I want… So
that…", `Background`, `@manual`/`@slow` tags, wiremock stubs) → `.http` smoke tests.
