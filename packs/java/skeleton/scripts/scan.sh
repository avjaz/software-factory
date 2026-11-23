#!/usr/bin/env bash
# Static scans from pinned images: Semgrep (code), Gitleaks (secrets), osv-scanner (dependencies).
# Any finding fails the build. Images are pinned by tag and digest.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SEMGREP_IMAGE="semgrep/semgrep:1.184.0@sha256:cc1b68266f267878b39739373ea9985b9a78e5d64497dd875c8de100b22695ed"
GITLEAKS_IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f"
OSV_IMAGE="ghcr.io/google/osv-scanner:v2.7.1@sha256:a70ffffc2bfd33482953e5d6b64c6fcdb30239717a07b0f0d3ab2859ce3e4cde"

echo "== Semgrep"
docker run --rm -v "$ROOT:/src:ro" -w /src "$SEMGREP_IMAGE" \
  semgrep scan \
  --config p/java \
  --config p/secrets \
  --error \
  --metrics=off \
  --disable-version-check \
  --quiet

echo "== Gitleaks"
docker run --rm -v "$ROOT:/src:ro" "$GITLEAKS_IMAGE" \
  dir /src \
  --config /src/.gitleaks.toml \
  --no-banner \
  --verbose \
  --redact

echo "== osv-scanner"
# Scan the dependency tree Maven actually resolves (BOM-managed versions included), not the raw pom.xml.
"$ROOT/mvnw" -B -q -ntp -f "$ROOT/pom.xml" org.cyclonedx:cyclonedx-maven-plugin:makeBom
docker run --rm -v "$ROOT:/src:ro" "$OSV_IMAGE" \
  scan source --lockfile /src/target/bom.json
