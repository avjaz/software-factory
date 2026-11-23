#!/usr/bin/env bash
# Builds the jar, starts the app, runs the sealed acceptance tests, then stops the app. Called by make acceptance.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_PORT=18080
APP_LOG="$ROOT/target/acceptance-app.log"
JAVA="${JAVA_HOME:+$JAVA_HOME/bin/}java"
APP_PID=""

stop() {
  if [[ -n "$APP_PID" ]]; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
}
trap stop EXIT

echo "== App"
./mvnw -B -q -ntp -DskipTests package
JAR="$(find target -maxdepth 1 -name '*.jar' ! -name '*-plain.jar' -print -quit)"
"$JAVA" -jar "$JAR" --server.port=$APP_PORT >"$APP_LOG" 2>&1 &
APP_PID=$!

ready=false
for _ in $(seq 1 60); do
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    echo "App exited during startup. Log: $APP_LOG" >&2
    exit 1
  fi
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$APP_PORT/health")" == "200" ]]; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo "App did not answer on port $APP_PORT within 60 seconds. Log: $APP_LOG" >&2
  exit 1
fi

echo "== Acceptance tests"
BASE_URL="http://localhost:$APP_PORT" acceptance/run.sh
