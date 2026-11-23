# Class style

## Shape

- Average class ~50 lines; entry points (controllers, handlers) stay under 60
  lines: validate → parse → resolve → delegate, nothing else.
- One responsibility per class; split before 150 lines of logic. Long
  declarative constants (field-id `Set.of(...)` tables) don't count against size.
- Beans: one explicit constructor, no `@Autowired` on fields. Qualify
  duplicates with `@Qualifier("...")`.

## Immutability & state

- Hand-written value types are **records** — even two-field ones
  (`public record OrderPlaced(String orderId, String customerId) {}`).
- Collections exposed or stored: unmodifiable
  (`Collectors.toUnmodifiableSet()`, `List.of`).
- `final` on every field, parameter, and local. No setters outside generated code.
- Domain knowledge (field lists, routing tables) lives in `private static final`
  constants composed declaratively, not in procedural code.

## Flow

- Guard clauses + early return; log the reason at `info` when returning early.
- Overload public entry points per input type; all overloads delegate to one
  private implementation.
- Composition over inheritance: interface + implementations + decorators
  (e.g. repository interface, file-store impl, caching decorator wrapping it).

## Errors

- One custom `RuntimeException` subclass per failure domain
  (`InvoiceException`, `PaymentGatewayException`…), minimal constructors
  — only the `(String)` / `(String, Throwable)` forms actually used.
- Catch broad exceptions **only at boundaries**; log there, rethrow wrapped
  with a message that names what failed. Re-throw domain exceptions untouched
  (`catch (final InvoiceException e) { throw e; }` before the broad catch).
- Never swallow; never log-and-continue on a failure the caller must know about.

## Logging

- `private final Logger log = LoggerFactory.getLogger(getClass());` — instance
  field, not static, SLF4J.
- `info` for lifecycle facts ("Creating invoice for order {}"), `debug` for
  payloads, `error` immediately before throwing.
