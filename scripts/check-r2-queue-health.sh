#!/usr/bin/env bash
set -euo pipefail

MAX_PENDING="${R2_QUEUE_MAX_PENDING:-10}"
MAX_ERROR="${R2_QUEUE_MAX_ERROR:-0}"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${EXPO_PUBLIC_SUPABASE_URL:-}" || -z "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  echo "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY." >&2
  exit 1
fi

rows="$(curl -fsS \
  "${EXPO_PUBLIC_SUPABASE_URL}/rest/v1/r2_delete_queue?select=status,created_at,last_error&limit=1000&order=created_at.asc" \
  -H "apikey: ${EXPO_PUBLIC_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${EXPO_PUBLIC_SUPABASE_ANON_KEY}")"

summary="$(ROWS="${rows}" node <<'NODE'
const rows = JSON.parse(process.env.ROWS || '[]');
const pending = rows.filter((row) => row.status === 'pending');
const errors = rows.filter((row) => row.status === 'error');
const oldestPending = pending[0]?.created_at ?? null;
console.log(JSON.stringify({
  total: rows.length,
  pending: pending.length,
  error: errors.length,
  oldestPending,
  latestError: errors.at(-1)?.last_error ?? null,
}));
NODE
)"

echo "R2 queue health: ${summary}"

pending="$(node -e "console.log(JSON.parse(process.argv[1]).pending)" "${summary}")"
errors="$(node -e "console.log(JSON.parse(process.argv[1]).error)" "${summary}")"

if (( pending > MAX_PENDING )); then
  echo "Too many pending R2 queue rows: ${pending} > ${MAX_PENDING}" >&2
  exit 1
fi

if (( errors > MAX_ERROR )); then
  echo "Too many failed R2 queue rows: ${errors} > ${MAX_ERROR}" >&2
  exit 1
fi

echo "R2 queue health check passed."
