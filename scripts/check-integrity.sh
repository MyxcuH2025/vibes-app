#!/usr/bin/env bash
set -euo pipefail

MAX_POSTS_WITHOUT_CONTENT="${MAX_POSTS_WITHOUT_CONTENT:-0}"

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

posts_without_content="$(curl -fsS \
  "${EXPO_PUBLIC_SUPABASE_URL}/rest/v1/posts?select=id,created_at,caption,media_url&media_url=is.null&caption=is.null&limit=100" \
  -H "apikey: ${EXPO_PUBLIC_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${EXPO_PUBLIC_SUPABASE_ANON_KEY}")"

count="$(ROWS="${posts_without_content}" node <<'NODE'
const rows = JSON.parse(process.env.ROWS || '[]');
console.log(rows.length);
NODE
)"

echo "Posts without media and caption: ${count}"

if (( count > MAX_POSTS_WITHOUT_CONTENT )); then
  echo "Too many empty posts: ${count} > ${MAX_POSTS_WITHOUT_CONTENT}" >&2
  echo "${posts_without_content}" >&2
  exit 1
fi

npm run health:r2-queue

echo "Integrity check passed."
