.PHONY: unit acceptance verify

unit:
	@for f in unit/*.sh; do sh "$$f" || exit 1; done

acceptance:
	@for f in acceptance/*.sh; do sh "$$f" || exit 1; done

verify:
	@if [ -e BROKEN ]; then echo "BROKEN is present"; exit 1; fi
	@$(MAKE) --no-print-directory unit
	@$(MAKE) --no-print-directory acceptance
