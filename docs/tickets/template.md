# Target ticket template

What the factory expects a ticket to look like in a target repo. Copy the template below into the
target's `docs/tickets/pending/NN-<id>/ticket.md` and fill it in. Format and rules: `docs/design.md`
§4 (layout) and §5 (ticket format).

## Folder layout in the target repo

```
docs/tickets/pending/NN-<id>/
  ticket.md
  acceptance/<path>          copied to acceptance/<path> in the repo at run time
```

- `NN` is two digits and sets the order: `factory next` runs the lowest pending number first.
- Every file in the folder except `ticket.md` is copied to the same relative path in the repo. A
  file that already exists there is overwritten. Put each acceptance test where the repo's
  acceptance runner (called by `make acceptance`) will find it.
- Commit the folder on `main`. Nothing runs pending tickets, so `main` stays green.
- `factory next` moves `ticket.md` to `docs/tickets/done/NN-<id>.md` on a green run.

## Fields

| Field    | Rule                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`     | Required. Lowercase words joined by single hyphens. Must equal the folder name without its `NN-` prefix. Becomes branch `factory/<id>`. |
| `title`  | Required, non-empty. Used in the commit message.                                                                                            |
| `design` | Optional. Section numbers of the target's `docs/design.md`. Each must exist; their text goes into the worker's prompt.                     |
| Body     | Required. Must contain `## Acceptance criteria` with at least one item. Given to the worker as written.                                    |

Any other header key, invalid YAML or a missing section makes the ticket invalid.

Acceptance criteria are concrete examples: real values, real codes, one line per behaviour. A
ticket is precise enough when a fresh agent could write its tests without guessing.

## Checking and running

From the factory root:

```
corepack pnpm -s factory check --repo <target> --ticket NN-<id>   # free: main is green, the ticket is red
corepack pnpm -s factory next --repo <target>                     # real worker, spends API credit
```

## Template

```markdown
---
id: <lowercase-words-with-hyphens>
title: <What the commit will say>
design: ['<section>', '<section>']
---

## What to build

<The behaviour to add, in a few sentences.>

## What already exists

<Name the files and classes, so the worker does not rebuild them.>

## Out of scope

<What not to do.>

## Acceptance criteria

- <input or request> gives <exact result, status or value>
- <one line per behaviour>
```
