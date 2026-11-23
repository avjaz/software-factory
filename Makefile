PNPM ?= corepack pnpm

.PHONY: install test smoke sandbox-checks pack-unit

install:
	$(PNPM) install --frozen-lockfile

test:
	$(PNPM) exec prettier --check .
	$(PNPM) exec eslint --max-warnings 0 .
	$(PNPM) exec tsc --noEmit
	$(PNPM) exec vitest run --coverage

# Real Claude Agent SDK run on a fresh tiny repo. Spends API credit; not part of test.
smoke:
	$(PNPM) exec tsx tests/smoke/smoke.ts

# Real Claude Agent SDK run that tries allowed and refused tool calls. Spends API credit; not part of test.
sandbox-checks:
	$(PNPM) exec tsx tests/smoke/sandbox-checks.ts

# Real Claude Agent SDK run of a pack's make unit in the worker sandbox. EMPTY names env vars to set
# to fresh empty directories. Spends API credit; not part of test.
# Usage: make pack-unit REPO=<dir> PACK=<name> [EMPTY="<NAME> ..."]
pack-unit:
	$(PNPM) exec tsx tests/smoke/pack-unit.ts --repo $(REPO) --pack $(PACK) \
		$(foreach name,$(EMPTY),--empty-dir-env $(name))
