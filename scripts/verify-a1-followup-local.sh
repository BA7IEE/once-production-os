#!/usr/bin/env bash
# Creates only disposable synthetic databases; never reads/reuses the user's DB volume.
set -euo pipefail
umask 077
if [[ "${ALLOW_LOCAL_ACCEPTANCE:-}" != "yes" ]]; then
  echo 'Refusing to run: set ALLOW_LOCAL_ACCEPTANCE=yes for disposable local acceptance.' >&2
  exit 2
fi
cd "$(dirname "$0")/.."
for tool in node pnpm docker git; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 2; }
done
[[ -z "${DOCKER_CONTEXT:-}" || -z "${DOCKER_HOST:-}" ]] || {
  echo 'Ambiguous Docker target: keep only DOCKER_CONTEXT or DOCKER_HOST, not both.' >&2; exit 2;
}
host="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
[[ "$host" == unix://* ]] || { echo 'Only a local Unix-socket Docker daemon is permitted.' >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo 'Start the local Docker daemon first.' >&2; exit 2; }
[[ -f pnpm-lock.yaml ]] || { echo 'A genuine checked-in pnpm-lock.yaml is required.' >&2; exit 2; }
# Pending user edits are not stashed, reset, committed or overwritten.
[[ -z "$(git status --porcelain)" ]] || { echo 'Worktree is not clean. Save your changes explicitly before acceptance.' >&2; exit 2; }

suffix="$(node -e "console.log(require('node:crypto').randomBytes(6).toString('hex'))")"
container="once-a1-${suffix}"
browser_db="once_test_browser_${suffix}"
contract_db="once_test_contract_${suffix}"
password="$(node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))")"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/once-a1.XXXXXX")"
created=0
cleanup() {
  status=$?
  trap - EXIT
  if [[ "$created" == 1 ]]; then
    marker="$(docker inspect --format '{{index .Config.Labels "once.acceptance.id"}}' "$container" 2>/dev/null || true)"
    if [[ "$marker" == "$suffix" ]]; then
      docker rm -fv "$container" >/dev/null || { echo 'Could not remove this test container.' >&2; status=1; }
    else
      echo 'Cleanup refused: test-container ownership marker is missing.' >&2
      status=1
    fi
  fi
  rm -f "$tmp/postgres.env"
  rmdir "$tmp" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'POSTGRES_USER=once_ci\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=%s\n' "$password" "$browser_db" > "$tmp/postgres.env"
docker run --detach --name "$container" --label "once.acceptance.id=$suffix" \
  --publish 127.0.0.1::5432 --env-file "$tmp/postgres.env" postgres:16 >/dev/null
created=1
ready=0
for ((i=0; i<60; i++)); do
  if docker exec "$container" pg_isready -U once_ci -d "$browser_db" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'Disposable PostgreSQL did not become ready.' >&2; exit 1; }
endpoint="$(docker port "$container" 5432/tcp)"
[[ "$endpoint" =~ ^127\.0\.0\.1:[0-9]+$ ]] || { echo 'Unexpected Docker port mapping.' >&2; exit 1; }
port="${endpoint##*:}"
docker exec "$container" createdb -U once_ci -O once_ci "$contract_db"
export DATABASE_URL="postgresql://once_ci:${password}@127.0.0.1:${port}/${contract_db}"
export DATABASE_URL_TEST="$DATABASE_URL"
logdir="artifacts/local-a1-followup-${suffix}"
mkdir -p "$logdir"
{
  printf 'Source commit: '; git rev-parse HEAD
  printf 'Node: '; node --version
  printf 'pnpm: '; pnpm --version
  printf 'PostgreSQL image ID: '; docker inspect --format '{{.Image}}' "$container"
} | tee "$logdir/environment.txt"

# Explicit environment variables override .env; only these two newly created DBs are used.
pnpm verify:online 2>&1 | tee "$logdir/build.txt"
node --test tests/acceptance/checkpoint.test.mjs 2>&1 | tee "$logdir/checkpoint.txt"
pnpm db:deploy 2>&1 | tee "$logdir/contract-migration.txt"
ALLOW_DB_TESTS=yes pnpm verify:postgres 2>&1 | tee "$logdir/postgres.txt"
export DATABASE_URL="postgresql://once_ci:${password}@127.0.0.1:${port}/${browser_db}"
export DATABASE_URL_TEST="$DATABASE_URL"
pnpm exec playwright install chromium
# Browser acceptance itself applies migrations to the untouched browser database.
ALLOW_BROWSER_TESTS=yes pnpm verify:browser 2>&1 | tee "$logdir/browser.txt"
printf 'PASS: full build, PostgreSQL contract and browser follow-up. Evidence: %s\n' "$logdir"
# Only this script's container and its anonymous test volume are removed; user volumes/secrets are untouched.
