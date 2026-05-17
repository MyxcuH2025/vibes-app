#!/usr/bin/env bash
set -euo pipefail

violations=0

echo "Auditing direct post deletes..."
while IFS=: read -r file line _text; do
  block="$(sed -n "${line},$((line + 8))p" "${file}")"
  if [[ "${block}" == *".delete()"* && "${file}" != "lib/usePostManagement.ts" ]]; then
    echo "Forbidden direct posts delete at ${file}:${line}" >&2
    violations=1
  fi
done < <(rg -n "\\.from\\('posts'\\)" app lib src components -g '*.ts' -g '*.tsx')

echo "Approved delete hook usages:"
rg -n "useDeletePost|r2-delete" app lib src components -g '*.ts' -g '*.tsx' || true

if [[ "${violations}" -ne 0 ]]; then
  echo "Critical mutation audit failed." >&2
  exit 1
fi

echo "Critical mutation audit passed."
