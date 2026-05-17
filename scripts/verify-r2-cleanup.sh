#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-llymwqfgujwkoxzqxrlm}"

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

echo "Checking r2_delete_queue REST visibility..."
queue_response="$(curl -fsS \
  "${EXPO_PUBLIC_SUPABASE_URL}/rest/v1/r2_delete_queue?select=id,status,attempts,last_error&limit=5&order=created_at.desc" \
  -H "apikey: ${EXPO_PUBLIC_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${EXPO_PUBLIC_SUPABASE_ANON_KEY}")"
echo "Queue sample: ${queue_response}"

echo "Checking r2-delete processQueue endpoint..."
process_response="$(curl -fsS -X POST \
  "${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/r2-delete" \
  -H "Content-Type: application/json" \
  --data '{"processQueue":true,"limit":5}')"
echo "processQueue: ${process_response}"

if [[ "${process_response}" != *'"ok":true'* ]]; then
  echo "processQueue did not return ok=true." >&2
  exit 1
fi

if [[ -n "${R2_CLEANUP_SECRET:-}" ]]; then
  echo "Running protected r2-delete selfTest..."
  self_test_response="$(curl -fsS -X POST \
    "${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/r2-delete" \
    -H "Content-Type: application/json" \
    -H "x-cleanup-secret: ${R2_CLEANUP_SECRET}" \
    --data '{"selfTest":true}')"
  echo "selfTest: ${self_test_response}"

  if [[ "${self_test_response}" != *'"ok":true'* || "${self_test_response}" != *'"queueFailed":0'* ]]; then
    echo "selfTest failed." >&2
    exit 1
  fi
else
  echo "Skipping protected selfTest; R2_CLEANUP_SECRET is not set in the shell."
fi

echo "Checking deployed r2-delete function..."
supabase functions list --project-ref "${PROJECT_REF}" | rg "r2-delete"

echo "R2 cleanup verification passed."
