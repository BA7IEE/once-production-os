#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v pnpm >/dev/null || { echo 'Install/enable the packageManager version declared in package.json first.' >&2; exit 2; }
if [[ ! -f pnpm-lock.yaml ]]; then
  echo 'No verified lockfile is shipped. Resolving exact candidate top-level versions now; do not treat this step as a security approval.'
  pnpm install --lockfile-only
fi
pnpm install --frozen-lockfile
pnpm exec prisma validate
pnpm exec prisma generate
pnpm contract:check
pnpm typecheck
pnpm typecheck:transport
pnpm test:core
pnpm review:static
pnpm build
pnpm audit --prod --audit-level high
printf '\nOnline source checks completed. PostgreSQL integration and real browser acceptance are separate gates.\n'
