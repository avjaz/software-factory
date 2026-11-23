---
id: real-worker
title: Implement the Worker with the Claude Agent SDK and the native sandbox
design: ['8.1', '8.2', '8.3']
---

## What to build

- `SdkWorker`, implementing `Worker` with the Claude Agent SDK for TypeScript, configured exactly as §8.1 says: working directory, model, tools, Bash allowlist, deny rules for every sealed glob and `.git/**`, native sandbox with `failIfUnavailable: true`, and a network allowlist of the Anthropic API plus the pack's `network` hosts.
- `start` opens a session; `resume` continues the same session.
- The §8.3 finish result comes back as SDK structured output. A missing or malformed result counts as `worker_error`.
- Usage and the raw messages map into the `Worker` result for ticket 08.
- Wire `SdkWorker` into production composition.
- `make smoke`: runs `factory next` on a fresh tiny repo with the real SDK. Not part of `make test`.

Read the SDK's current docs and pin its exact version first. Option names in §8.1 are the intent; use the SDK's real names, and record any gap in this ticket's PR description.

## What already exists

Tickets 01–08.

## Out of scope

Picking models dynamically. Retrying model calls (an SDK error is `worker_error`).

## Acceptance criteria

- Unit tests: given a pack and `.factory.yaml`, the SDK options built by `SdkWorker` contain the configured model, the worktree as working directory, the Bash allowlist from §8.1 and nothing wider, a deny rule per sealed glob plus `.git/**`, `failIfUnavailable: true`, and the network allowlist.
- `make smoke` on `01-greet` ends `green` within 3 attempts, and the report records non-zero tokens and cost.
- In a manual check, recorded in the PR: a worker told to run `git status` runs it (Claude Code's built-in read-only set, §8.1); a worker told to run `git commit --allow-empty -m probe` is refused; a worker told to `curl https://example.com` is refused; a worker told to edit `acceptance/hello.sh` is refused by the deny rule.
- If the sandbox cannot start (simulated by forcing the option on an unsupported setup, or documented if not simulable), the run ends `worker_error` and never runs unsandboxed.
