# Software factory

A small factory that turns approved tickets into merge-ready code with a Claude agent, without letting the agent grade its own work.

You approve the spec, not the code. A ticket and its acceptance tests are agreed with a person first. The factory then gives one Claude worker the job of making those tests pass, judges the result with the target repo's own `make verify`, and commits on green to a branch for a person to review and merge.

## Result so far

v2.0 was met on 21 Nov 2026: a small NZ public holidays REST API (Java, Spring Boot) was built from an empty repo entirely through the factory. Intake wrote four tickets, the acceptance author wrote their tests, and `factory next` delivered each one green on its first attempt, with no human code edits.

| Ticket                                      | Cost      |
| ------------------------------------------- | --------- |
| 01 List a year's holidays                   | $0.91     |
| 02 Reject uncovered and malformed years     | $0.83     |
| 03 Find the next holiday on or after a date | $0.71     |
| 04 Reject uncovered and malformed dates     | $1.16     |
| **Total**                                   | **$3.61** |

The target repos used during development are private; `docs/` refers to them by name.

## How it works

```
intake skill ──► ticket.md ──► acceptance-test author ──► person approves ──► commit to main
 (grilling)      (pending/)     (fresh context)

person merges ◄── commit on factory/<id> ◄── green verify ◄── worker ◄── factory next
```

1. **Intake** (`factory-intake` skill) interviews you one question at a time and writes the target's `docs/design.md` and one pending ticket per slice. Acceptance criteria are concrete examples, one line per behaviour.
2. **Acceptance-test author** (`factory-acceptance-author` skill) runs in a fresh session with only the ticket and the design sections it names. It writes one red test per criterion, or, if a criterion can't be tested without guessing, appends open questions to the ticket instead.
3. **`factory next`** takes the lowest-numbered pending ticket, proves `main` is green and the new tests are red, and gives the worker up to three attempts. Each attempt ends with an integrity check and `make verify`; failing output is fed back for the next attempt.

### What stops the worker grading its own work

- **Sealed paths.** The ticket, the acceptance tests, the Makefile, build files, scripts and `.claude/` are sealed. Edit and Write are denied on them, and an integrity check after every attempt fails the run if any sealed file changed, a copied-in test differs, or `.git/` was touched.
- **The judge is the repo, not the agent.** The factory runs `make verify` on the host; the worker only runs `make unit` inside its sandbox.
- **Sandbox.** The worker runs in Claude Code's native sandbox: writes confined to its git worktree, network limited to the Anthropic API plus the pack's hosts (e.g. Maven Central), Bash limited to `make unit` and read-only commands, no git writes, no credentials besides the model's own.
- **Honest outcomes.** A run ends `green`, `escalated`, `spec_defect` (the worker argues a test is wrong, with evidence), `integrity_violation`, `baseline_red`, `ticket_already_green` or `worker_error`. Only `green` commits.

Every run writes `report.json`, `report.md` and a full transcript under `.factory/runs/`, with tokens and cost per attempt.

### Packs

The factory core contains no language-specific code. A language joins through a pack in `packs/<name>/`: a Makefile with `unit`, `acceptance` and `verify` targets, sealed globs, network hosts, worker rules, a coding-standards skill, and optionally an app skeleton. The Java pack ships a Spring Boot skeleton with 100% coverage, mutation testing, ArchUnit rules and static scans already wired into `make verify`.

## Requirements

- macOS or Linux (the native sandbox uses Seatbelt / bubblewrap). Developed on macOS.
- Node 22 (`>=22.13 <23`) and pnpm via corepack.
- git and make.
- A Claude Code login or `ANTHROPIC_API_KEY` for real runs.
- Java pack: the JDK named in the skeleton's `pom.xml` (on macOS under `/Library/Java/JavaVirtualMachines`, elsewhere via `JAVA_HOME`) and Docker for the scans.

## Quickstart

```sh
make install            # pnpm install --frozen-lockfile
make test               # prettier, eslint, tsc, vitest with 100% per-file coverage

# Start a new Java app from the pack skeleton
mkdir ../my-app && git -C ../my-app init
corepack pnpm factory init --repo ../my-app --pack java --skeleton \
  --param package=com.example.myapp --param name=my-app
# review and commit in ../my-app, then:

# in Claude Code, from this repo: run the factory-intake skill for ../my-app,
# then factory-acceptance-author on each ticket

corepack pnpm factory check --repo ../my-app --ticket 01-<id>   # tests are red
corepack pnpm factory next  --repo ../my-app                     # spends API credit
```

Settings (model, attempts, failure-tail length) are in `factory.config.yaml`.

## Status and limits

- The rework path (attempts 2 and 3) is implemented and tested with a scripted worker but has not yet been exercised by a real run.
- One pack so far (Java).
- Deliberately out of scope until a real run needs them: model routing, LLM reviewers, running the whole queue, parallel workers, auto-merge, a container worker. See `docs/design.md` §12.

## Repo map

- `docs/design.md` — the design; tickets reference its sections.
- `docs/tickets/done/` — the tickets the factory itself was built from.
- `src/` — the factory CLI (TypeScript).
- `packs/java/` — the Java pack.
- `.claude/skills/` — the intake and acceptance-author skills, and the Node standards the factory's own code follows.

## License

MIT — see `LICENSE`.
