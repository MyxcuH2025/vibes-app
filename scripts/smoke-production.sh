#!/usr/bin/env bash
set -euo pipefail

echo "1/4 TypeScript check"
npm run typecheck

echo "2/4 Lint"
npm run lint

echo "3/4 Edge Function typecheck"
deno check \
  supabase/functions/r2-delete/index.ts \
  supabase/functions/r2-sign/index.ts \
  supabase/functions/send-push-notification/index.ts

echo "4/5 Critical mutation audit"
npm run audit:mutations

echo "5/5 R2 cleanup production smoke"
npm run verify:r2-cleanup

echo "R2 queue health"
npm run health:r2-queue

rm -f deno.lock

echo "Production smoke checks passed."
