# Software factory: design

**Status:** agreed in a grilling session.
**Repos named here:** the target repos this design and `docs/tickets/done/` refer to (procurement-mcp, procurement-mcp-old, java-prototype, intake-demo, and their `../` paths) are private. They are kept as the record of how the factory was built.
**Scope:** v2.0, the smallest factory that delivers real feature tickets. Each section is referenced by number from `docs/tickets/`.

## 1. Purpose and scope

The factory takes one pending ticket and its acceptance tests from a target repo. It has one Claude worker make those tests pass on a named branch, judges the result with the repo's own `make verify`, and commits on green. A person reviews and merges.

v2.0 is done when an app is built from a pack skeleton (§6) through the factory alone: intake writes the tickets, the acceptance-test author writes their tests, and `factory next` delivers each one, with no human code edits. Met by `intake-demo`, an NZ public holidays API (Java pack): four tickets, each green on the first attempt, $3.61 in total.

(procurement-mcp, the earlier v2.0 target, is shelved at its skeleton commit 73e7d69. The run loop's rework path, attempts 2 and 3, has not yet been exercised by a real run.)

(Originally the goal was slices 3, 6 and 5 of a hand-built procurement-mcp. That repo is kept at `../procurement-mcp-old`; procurement-mcp was restarted from the Java skeleton so the whole path from zero runs through the factory.)

Design rules:

1. **Humans approve the spec, not the code.** Tickets and acceptance tests are approved by a person before a run.
2. **Nothing grades its own work.** The worker cannot change the ticket, the tests or the gates. Permission rules stop it trying; the integrity check (§9) catches it if it gets past them.
3. **Small first.** Anything not listed here is out of scope (§12) until a real run shows it is needed.

## 2. Glossary

| Term | Meaning |
|---|---|
| Target repo | The repo the factory works on. Joins through a pack. |
| Pack | A language's Makefile, sealed paths, network hosts, standards skill and worker rules (§6). |
| Ticket | One unit of work: `ticket.md` plus its acceptance tests, in a pending folder (§4, §5). |
| Pending ticket | A ticket folder under `docs/tickets/pending/` in the target repo. |
| Run | One `factory next` invocation: pre-flight, up to 3 attempts, outcome, report. |
| Attempt | One worker turn ending in a finish signal, followed by integrity and verify. |
| Worker | The Claude agent that writes code. Runs in a sandbox, has no git. |
| Base | The `main` commit the run starts from. The trusted copy of every sealed file. |
| Outcome | How a run ends (§7.3). |

## 3. Pipeline

```
intake skill ──► ticket.md ──► acceptance-test author ──► person approves ──► commit to main
 (grilling)      (pending/)     (fresh context)                              (pending/ is docs only)
                                                                                    │
person merges ◄── commit on factory/<id> ◄── green verify ◄── worker ◄── factory next
```

- **Intake** (§11.1) is an interactive skill. It grills the user and writes the target's `docs/design.md` and pending tickets.
- **Acceptance-test author** (§11.2) is a separate skill run in a fresh context. It reads only the ticket, the design sections the ticket names, and the existing acceptance harness. It never guesses: an ambiguity becomes a question appended to the ticket, and the user answers by amending the ticket.
- **Run** (§7) is the factory CLI.

## 4. Target repo layout

```
<target>/
  .factory.yaml                     pack name and any extra sealed globs
  Makefile                          copied from the pack, byte-identical
  CLAUDE.md                         contains the line @CLAUDE.factory.md
  CLAUDE.factory.md                 copied from the pack
  .claude/skills/<pack skill>/      copied from the pack
  docs/design.md                    the target's own design; tickets reference its sections
  docs/tickets/
    pending/
      01-get-purchase-order/
        ticket.md
        acceptance/tests/get-purchase-order.test.ts    mirrors its final repo path
    done/
      01-get-purchase-order.md
```

- Pending folders are committed on `main`. Nothing runs them, so `main` stays green.
- Every file in a pending folder except `ticket.md` is copied to the same relative path in the repo at run time. A file that already exists there (for example an updated acceptance helper) is overwritten.
- The two-digit prefix sets the order. The rest of the folder name is the ticket id.
- `.factory.yaml`:
  ```yaml
  pack: java
  sealed:            # optional, added to the pack's sealed globs
    - src/test/java/nz/co/avjaz/mcp/procurement/ArchitectureTest.java
  ```

## 5. Ticket format

```markdown
---
id: get-purchase-order
title: Add the get_purchase_order tool with layer 1 visibility
design: ['5.3', '5.5', '7.1', '7.2', '7.5']
---

## What to build
## What already exists
Name the files and classes, so the worker does not rebuild them.
## Out of scope
## Acceptance criteria
- alice gets PO-1001 (cost centre OPS): 2 order lines; line 1 received 5.00 of 10
- bob asks for PO-1001: NOT_FOUND, body identical to an unknown poNumber
```

| Field | Rule |
|---|---|
| `id` | Required. Lowercase words joined by single hyphens. Must equal the folder name without its `NN-` prefix. Becomes branch `factory/<id>`. |
| `title` | Required, non-empty. Used in the commit message. |
| `design` | Optional. Section numbers of the target's `docs/design.md`. Each must exist. Their text goes into the worker's prompt. |
| Body | Required. Must contain `## Acceptance criteria` with at least one item. Given to the worker as written. |

Any other header key, invalid YAML or a missing section makes the ticket invalid.

Acceptance criteria are concrete examples: real seed values, real codes, one line per behaviour. A ticket is precise enough when a fresh agent can write its tests without guessing.

The factory's own tickets (`software-factory/docs/tickets/`) use this format too, without the acceptance files.

## 6. Packs and the make contract

The factory never contains a language-specific line. It only ever calls three make targets:

| Target | Meaning | Who runs it |
|---|---|---|
| `make unit` | Fast inner loop. No Docker, no network beyond the pack's hosts. | The worker, inside its sandbox |
| `make acceptance` | Starts the service, runs `acceptance/`, stops the service. Fails if any test fails. | The factory, on the host |
| `make verify` | Every binding gate, with `acceptance` last. | The factory, on the host |

A pack lives at `packs/<name>/` in the factory:

```
packs/java/
  manifest.yaml
  Makefile             generic targets; calls repo hooks such as scripts/service-up.sh
  CLAUDE.factory.md    worker rules for this language
  skills/<skill>/      the standards skill
```

```yaml
# manifest.yaml
name: java
sealed:              # globs, relative to the repo root
  - acceptance/**
  - docs/tickets/**
  - Makefile
  - scripts/**
  - .github/**
  - pom.xml
  - .factory.yaml
  - CLAUDE.md
  - CLAUDE.factory.md
  - .claude/**
network:             # hosts the worker's sandbox may reach, besides the Anthropic API
  - repo.maven.apache.org
```

`factory init --repo <dir> --pack <name>` copies the Makefile, `CLAUDE.factory.md` and skills into the repo, adds `@CLAUDE.factory.md` to `CLAUDE.md` (creating it if missing), and writes `.factory.yaml` if missing. It refuses a dirty repo, works on a repo with no commits yet, is safe to re-run, and does not commit: the user reviews and commits.

A pack may also ship an app skeleton, so a fresh repo reaches a green `make verify` in one step. The files live in `packs/<name>/skeleton/`; the manifest declares the values they need:

```yaml
skeleton:
  params:
    - name: package                     # lowercase word; the token is {{package}}
      describe: Java package of the app, e.g. com.example.demo
      pattern: '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$'
      pathSeparator: '.'                # optional: in file paths, the value's '.' becomes '/'
```

`factory init ... --skeleton --param package=nz.co.example.demo` checks every declared param (present, matching its pattern, no undeclared ones), refuses if any skeleton file already exists in the repo, then copies `skeleton/` with `{{<param>}}` replaced in file text and in file and folder names, keeping file modes. Skeleton files are text. Without `--skeleton`, `init` writes no skeleton file, so re-running it on a repo with code is unchanged. The core knows params, tokens and `pathSeparator`, never the language.

The repo supplies only what is its own: its code, `acceptance/`, `docs/`, and the hook scripts its pack's Makefile calls.

## 7. The run

### 7.1 Commands

| Command | Does |
|---|---|
| `factory init --repo <dir> --pack <name> [--skeleton --param <name>=<value> ...]` | §6 |
| `factory next --repo <dir>` | Runs the lowest-numbered pending ticket (§7.2) |
| `factory check --repo <dir> --ticket <NN-id>` | Pre-flight only (steps 1–5): proves `main` is green and the ticket's tests are red, then prints the last `tailLines` of the `make acceptance` output, so the author sees which tests failed. Used by the acceptance-test author |
| `factory validate-ticket --repo <dir> --ticket <NN-id>` | Parses one pending ticket against §5 only: exit 0, or exit 2 with the parser's message. Runs no make, needs no git. Used by intake |

Factory settings live in `factory.config.yaml` at the factory root:

```yaml
model: claude-opus-5-5   # fixed top tier; no router in v2.0
maxAttempts: 3           # first try plus 2 reworks
tailLines: 150           # lines of failing output sent back to the worker
```

### 7.2 Sequence for `factory next`

Refusals (exit 2, no run report): not a git repo, no `.factory.yaml`, unknown pack, dirty working tree, no pending ticket, invalid ticket (§5), or an unmerged branch: any local `factory/*` branch not merged into `main`.

1. Pick the lowest-numbered pending ticket and validate it.
2. Create a worktree from `main` on new branch `factory/<id>` at `.factory/worktrees/<repo>-<id>` in the factory.
3. Run `make verify` in the worktree. Fails → `baseline_red`.
4. Copy the pending folder's test files into place (§4).
5. Run `make acceptance`. Passes → `ticket_already_green`.
6. **Attempt loop**, up to `maxAttempts`:
   1. Worker turn: the first prompt (§8.2) on attempt 1; on later attempts, resume the same session with the failure feedback.
   2. Worker returns `spec_defect` → outcome `spec_defect`, no further attempts.
   3. Integrity check (§9). Fails → `integrity_violation`, no further attempts.
   4. Remove the files git ignores (`git clean -fdX`). The integrity check cannot see them, so build output the worker left must not reach verify. Untracked files that are not ignored stay.
   5. `make verify`. Passes → go to step 7. Fails → feedback is the command, its exit code and the last `tailLines` lines of output; next attempt.
7. All attempts used without a green verify → `escalated`.
8. On `green`: move `ticket.md` to `docs/tickets/done/<NN-id>.md`, delete the pending folder, and commit everything on `factory/<id>` as one commit with the factory's git identity (`software-factory <factory@localhost>`) and message `Ticket <id>: <title>`. Remove the worktree; keep the branch.
9. On any other outcome: commit nothing, keep the worktree, and name it in the report.
10. Write the run report (§10).

### 7.3 Outcomes

| Outcome | Exit | Meaning | Owner |
|---|---|---|---|
| `green` | 0 | Verify passed; branch committed | Person reviews and merges |
| `escalated` | 1 | 3 attempts without green | Person, with the worker's diagnosis |
| `spec_defect` | 1 | The worker says a sealed test or ticket is wrong, with evidence | Spec owner: amend the ticket, regenerate the tests |
| `integrity_violation` | 1 | A sealed path changed | Factory owner |
| `baseline_red` | 1 | `main` fails verify before any change | Maintainer fixes `main` |
| `ticket_already_green` | 1 | The new tests pass before any code | Spec owner |
| `worker_error` | 1 | The SDK or the model call failed | Factory owner |

## 8. The worker

### 8.1 Runtime

- Claude Agent SDK for TypeScript, with the model from `factory.config.yaml`.
- Working directory: the worktree.
- Claude Code native sandbox for Bash, with `failIfUnavailable: true`. Writes are confined to the worktree. Network is limited to the Anthropic API plus the pack manifest's `network` hosts. Local port binding is allowed (`allowLocalBinding`), so unit tests can start a server on a free port; outbound connections stay on the allowlist.
- Tools: Read, Glob, Grep, Edit, Write, Bash.
- Bash is allowed only for `make unit` and Claude Code's built-in read-only set: `ls`, `cat`, `echo`, `pwd`, `head`, `tail`, `grep`, `find`, `wc`, `which`, `diff`, `stat`, `du`, `cd`, and read-only forms of `git`. Claude Code runs that set in every permission mode and it cannot be configured, so the factory accepts it. Everything else is denied, including any `git` that changes the repo. `find` with `-exec`, `-ok`, `-delete`, `-fprint` or `-fls` is denied.
- Edit and Write are denied on every sealed glob and on `.git/**`.
- No credentials in the environment besides the model's own.

### 8.2 First prompt

1. Rules: make the acceptance tests pass; work test-first with `make unit`; never edit sealed paths; leave the ticket where it is, since the factory moves it to `done/` on green; the factory runs `make verify` after you finish.
2. The ticket body.
3. The `docs/design.md` sections named in `design:`, in order.
4. The list of acceptance test files added by this ticket.
5. How to finish: a structured result.

### 8.3 Finish signal

The worker ends each turn with a structured result:

```json
{ "status": "done" | "spec_defect", "summary": "…", "evidence": "…" }
```

`done` means ready for verification, not done. `evidence` is required for `spec_defect`: which test or ticket line is wrong, and why.

## 9. Integrity check

Runs after every attempt, before `make verify`, on the host. It fails when:

1. Any file matching a sealed glob (pack plus `.factory.yaml`) differs from the base, was added or was deleted, except the test files the ticket copied in.
2. A copied-in test file is not byte-identical to its pending-folder copy at the base.
3. The repo's `Makefile` is not byte-identical to the pack's `Makefile`.
4. Anything under `.git/` was modified by the worker (detected as a change in `git status` that the factory did not make, or a changed `.git/config`/hooks).

The report lists each violating path and its kind (`modified`, `added`, `deleted`, `makefile_mismatch`, `test_mismatch`).

## 10. Run report

Written to `.factory/runs/<id>-<UTC timestamp>/` in the factory (gitignored):

- `report.json`: outcome, ticket id, base SHA, branch, commit SHA (green) or worktree path (otherwise), model, and per attempt: the worker's status and summary, tokens, cost in USD, integrity result, verify exit code and output tail. Also wall-clock time for pre-flight, each worker turn and each verify.
- `report.md`: the same, short and readable.
- `transcript.jsonl`: every SDK message, in order.

## 11. Intake skills

Both are Claude Code skills in the factory's `.claude/skills/`. They write into a target repo.

### 11.1 `factory-intake`

Builds on `grill-me`. Interviews the user one question at a time, with a recommended answer each time. Writes or updates the target's `docs/design.md` and writes one `docs/tickets/pending/NN-<id>/ticket.md` per agreed slice, in the §5 format, with numbering that continues the existing queue. It writes no tests. When the user says yes at the end, it commits only the files it wrote, in one commit on the target's current branch, and never pushes. It never reads or writes Claude Code memory.

### 11.2 `factory-acceptance-author`

Run in a fresh session, with one ticket path. Reads only the ticket, the design sections it names, and the existing `acceptance/` harness. Then either:

- writes the test files into the ticket's pending folder, runs `factory check` to prove they are red, and stops for the user's approval; on a yes it commits only that pending folder, in one commit on the target's current branch, and never pushes; or
- if any criterion is ambiguous or missing, appends a `## Open questions` section to `ticket.md` and stops without writing tests.

It never reads or writes Claude Code memory.

## 12. Out of scope for v2.0

Model router; stack-pack evidence modules; suppression scan; test audit; LLM reviewers; egress proxy and sandbox patches; open blocks in sealed files; running the whole queue; stacked branches; auto-merge; caching pre-flight; parallel workers; durable workflow engine; eval harness; deployment; container worker (§12.1). Each comes back only when a real run shows the need.

### 12.1 Container worker (deferred)

The option: run the worker in a container whose image the pack defines (JDK, build tool), instead of in Claude Code's native sandbox (§8.1). It would make the worker's toolchain independent of the host and isolate the worker's filesystem view to the worktree. Running `make verify` in the same image would also remove toolchain drift between worker and host.

Why deferred:

- Docker has no per-domain egress allowlist. Limiting the network to the pack's hosts needs an egress proxy, or Claude Code's Linux sandbox nested inside the container. Both are "egress proxy and sandbox patches" above.
- The host's Claude login is not available in a container; it needs an API key passed in.
- On macOS Docker is itself a Linux VM: slower builds on a mounted worktree, a cache volume per pack, and a Docker dependency in the factory's own tests.
- The native sandbox already runs on Linux (bubblewrap), so it does not tie the factory to macOS.

Evidence so far (ticket 10): the native sandbox profile allows `sysctl-write` only for a fixed list of names. `/usr/libexec/java_home` needs `kern.grade_cputype`, so inside the sandbox it finds no JDK, and the refusal is not logged. The Java pack's workaround is to find the JDK from each JDK's `release` file instead. The JVM's refused lookup of `com.apple.SystemConfiguration.configd` (system proxy settings) is logged and harmless.

Revisit when: the factory must run in CI, a pack's toolchain cannot reasonably be installed on the host, or the native sandbox blocks something a build needs at run time with no pack-side workaround.

## 13. Prep outside the factory

- procurement-mcp started fresh from the Java skeleton (ticket 13): `factory init --pack java --skeleton --param package=nz.co.avjaz.mcp.procurement --param name=procurement-mcp`, committed by hand. Nothing else is prepared outside the factory.
- Superseded: the OAuth resource server (old slice 2) was to be built by hand, with a "call as alice / call as bob" acceptance helper. It is now the first factory ticket instead; its acceptance tests bring that helper. The migration of the old repo onto the Java pack (ticket 10) stays as the Java pack's proof, in `../procurement-mcp-old`.

## 14. Build order

| # | Block |
|---|---|
| 01 | Scaffold |
| 02 | Test harness: fixture repo, fake pack, scripted worker |
| 03 | Packs and `factory init` |
| 04 | Ticket queue |
| 05 | Worktree, pre-flight and `factory check` |
| 06 | Integrity check |
| 07 | Run loop |
| 08 | Run report |
| 09 | Real worker |
| 10 | Java pack; migrate procurement-mcp |
| 11 | Intake skill |
| 12 | Acceptance-test author skill |
| 13 | Pack skeleton for `factory init` (done before 11 and 12 finished) |

Then intake (11), acceptance tests (12) and `factory next` were to run on the fresh procurement-mcp. That target was shelved, and the same path built intake-demo end to end instead (§1).
