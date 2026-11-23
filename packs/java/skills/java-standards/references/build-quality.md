# Build & quality gates

## Coverage: 100%, enforced, per class

JaCoCo `check` bound to the `package` phase fails the build unless **every
class** hits 1.00 on **LINE, BRANCH, and INSTRUCTION**:

```xml
<rule>
  <element>CLASS</element>
  <limits>
    <limit><counter>LINE</counter><value>COVEREDRATIO</value><minimum>1.00</minimum></limit>
    <limit><counter>BRANCH</counter><value>COVEREDRATIO</value><minimum>1.00</minimum></limit>
    <limit><counter>INSTRUCTION</counter><value>COVEREDRATIO</value><minimum>1.00</minimum></limit>
  </limits>
</rule>
```

## Exclusions: principled and narrow

One shared list feeds both JaCoCo and any static analysis (e.g. Sonar):
`**/*Configuration.*`, `**/IT*.*`, `**/Main.*`, `**/*Constants.*`, and
generated model/client packages. Nothing else. A class that is "hard to test"
gets redesigned, not excluded. For coverage-only types, a local `@Generated`
annotation (RUNTIME retention) in `common` makes JaCoCo skip any class/method
whose annotation is simple-named `Generated`. It marks **"no logic"**, not
"leaf": apply only to value-carrier records and literal config/seed beans. A
leaf *with* logic (a store, a value type with methods, a guard branch) is tested
normally — never `@Generated`. Use sparingly.

## Conventions

- Java 21, UTF-8, `maven.compiler.source/target` from properties.
- **Every plugin version pinned** in `pluginManagement`; dependency versions
  as properties. SDK families via BOM import.
- Surefire = unit tests; **Failsafe** = `IT*` integration tests
  (`integration-test` + `verify` goals).
- `-SNAPSHOT` versioning between releases.
- Dependabot/Renovate with auto-merge for dependency PRs only — safe because
  the 100% coverage gate runs first.
- Test-support deps declared once in the parent pom, `scope: test`:
  smt-random, smt-matchers, equalsverifier, bean-matchers, to-string-verifier,
  instancio, mockito (inline).

## Shiver-me-timbers coordinates (Maven Central)

```xml
<dependency>
    <groupId>com.github.shiver-me-timbers</groupId>
    <artifactId>smt-random</artifactId>
    <version>1.8</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>com.github.shiver-me-timbers</groupId>
    <artifactId>smt-matchers</artifactId>
    <version>1.2</version>
    <scope>test</scope>
</dependency>
```

Random test data comes from static imports on `shiver.me.timbers.data.random`:
`RandomStrings.someString()`, `RandomStrings.someAlphanumericString(n)`,
`RandomIntegers.someInteger()` / `somePositiveInteger()`,
`RandomLongs.someLong()`, `RandomDoubles.someDouble()`,
`RandomBooleans.someBoolean()`, `RandomEnums.someEnum(X.class)`.
smt-matchers (`shiver.me.timbers.matchers`) supplies the time-ish Hamcrest
matchers (`fallsOn`, `fallsBefore`, `fallsAfter`) used for date assertions.
