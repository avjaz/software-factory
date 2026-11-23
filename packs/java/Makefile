# Java pack Makefile, copied byte-identical into the repo by `factory init`. Edit it in the factory's packs/java/.
# Factory contract: unit, acceptance, verify. The other targets are helpers.
# Repo hooks it calls: scripts/acceptance.sh, scripts/scan.sh, scripts/run.sh.
# Targets take no override variables except UNIT_M2_TAIL. Gate thresholds live in the GATES block of pom.xml.

SHELL := /bin/bash
.SHELLFLAGS := -euo pipefail -c
.DEFAULT_GOAL := verify
.PHONY: build unit test mutate acceptance scan verify run db-up db-down

# The JDK version is pom.xml's <java.version>. On macOS, use that JDK, found by its release file:
# /usr/libexec/java_home finds nothing inside the worker's sandbox (design §12.1). Elsewhere (CI)
# JAVA_HOME must already point at it. The repo's enforcer rule rejects any other JDK.
JAVA_VERSION := $(shell sed -n 's:.*<java.version>\(.*\)</java.version>.*:\1:p' pom.xml | head -n 1)
ifeq ($(JAVA_VERSION),)
$(error pom.xml has no <java.version> property)
endif
ifeq ($(shell uname -s),Darwin)
JDK := $(shell for home in /Library/Java/JavaVirtualMachines/*/Contents/Home; do \
  grep -qs '^JAVA_VERSION="$(JAVA_VERSION)[."]' "$$home/release" && { echo "$$home"; break; }; done)
ifeq ($(JDK),)
$(error No JDK $(JAVA_VERSION) under /Library/Java/JavaVirtualMachines)
endif
export JAVA_HOME := $(JDK)
endif

MVN := ./mvnw -B -ntp

# make unit runs in the factory worker's sandbox, which can write only inside the repo. It gets its own
# Maven home and local repository under target/, and reads ~/.m2/repository as a read-only tail.
# Set UNIT_M2_TAIL to an empty directory to start from a cold cache.
UNIT_M2 := $(CURDIR)/target/unit-m2
UNIT_M2_TAIL ?= $(HOME)/.m2/repository

# The sandbox reaches the network only through the proxy named in HTTPS_PROXY, which may carry a user
# and password. Maven ignores that variable and Java's proxy properties, so make unit writes the proxy
# into a settings.xml under target/. The user and password stay out of the file and out of the echoed
# commands: settings.xml reads them from env vars that the recipe sets from HTTPS_PROXY at run time.
UNIT_PROXY := $(or $(HTTPS_PROXY),$(https_proxy),$(HTTP_PROXY),$(http_proxy))
ifneq ($(UNIT_PROXY),)
UNIT_PROXY_AUTHORITY := $(shell echo '$(UNIT_PROXY)' | sed -E 's|^[a-zA-Z]+://||; s|/.*$$||')
UNIT_PROXY_HOSTPORT := $(shell echo '$(UNIT_PROXY_AUTHORITY)' | sed -E 's|^.*@||')
UNIT_PROXY_HOST := $(shell hp='$(UNIT_PROXY_HOSTPORT)'; echo "$${hp%:*}")
UNIT_PROXY_PORT := $(shell hp='$(UNIT_PROXY_HOSTPORT)'; echo "$${hp\#\#*:}")
UNIT_PROXY_LOGIN := $(if $(findstring @,$(UNIT_PROXY_AUTHORITY)),<username>$${env.UNIT_PROXY_USER}</username><password>$${env.UNIT_PROXY_PASSWORD}</password>)
# Wagon sends the login up front; Maven's default transport sends it only after a 407 that names a scheme.
UNIT_SETTINGS := -s $(UNIT_M2)/settings.xml -Dmaven.resolver.transport=wagon -Dmaven.wagon.http.preemptive=true
# Shell code: export UNIT_PROXY_USER and UNIT_PROXY_PASSWORD, percent-decoded, from the proxy URL.
UNIT_PROXY_ENV := proxy="$${HTTPS_PROXY:-$${https_proxy:-$${HTTP_PROXY:-$${http_proxy:-}}}}"; \
  login=$$(printf '%s' "$$proxy" | sed -nE 's|^[a-zA-Z]+://([^@/]*)@.*|\1|p'); \
  user="$${login%%:*}"; password="$${login\#*:}"; \
  export UNIT_PROXY_USER="$$(printf '%b' "$${user//%/\\x}")" UNIT_PROXY_PASSWORD="$$(printf '%b' "$${password//%/\\x}")";
endif

## Compile and package
build:
	$(MVN) -DskipTests package

## Unit tests (*Test), coverage gate, ArchUnit. No Docker: the factory worker's inner loop
unit:
ifneq ($(UNIT_PROXY),)
	mkdir -p $(UNIT_M2)
	printf '<settings><proxies>%s%s</proxies></settings>\n' \
	  '<proxy><id>https</id><protocol>https</protocol><host>$(UNIT_PROXY_HOST)</host><port>$(UNIT_PROXY_PORT)</port>$(UNIT_PROXY_LOGIN)</proxy>' \
	  '<proxy><id>http</id><protocol>http</protocol><host>$(UNIT_PROXY_HOST)</host><port>$(UNIT_PROXY_PORT)</port>$(UNIT_PROXY_LOGIN)</proxy>' \
	  > $(UNIT_M2)/settings.xml
endif
	$(UNIT_PROXY_ENV) MAVEN_USER_HOME=$(UNIT_M2) $(MVN) $(UNIT_SETTINGS) -Dmaven.repo.local=$(UNIT_M2)/repository -Dmaven.repo.local.tail=$(UNIT_M2_TAIL) test

## Unit and integration tests, coverage gate, ArchUnit
test:
	$(MVN) verify

## Mutation tests (PIT)
mutate:
	$(MVN) test-compile org.pitest:pitest-maven:mutationCoverage

## Starts the service, runs the acceptance tests, stops the service
acceptance:
	scripts/acceptance.sh

## Static, dependency and secrets scans
scan:
	scripts/scan.sh

## Every gate, in order. Stops at the first failure.
verify:
	$(MAKE) test
	$(MAKE) mutate
	$(MAKE) scan
	$(MAKE) acceptance

## Run the app locally
run:
	scripts/run.sh

## Local services from compose.yaml (helpers, not part of the factory contract)
db-up:
	docker compose up -d --wait

db-down:
	docker compose down
