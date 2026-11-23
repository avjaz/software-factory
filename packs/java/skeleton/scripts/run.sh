#!/usr/bin/env bash
# Runs the app locally on port 8080. Called by make run.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

./mvnw -B -ntp spring-boot:run
