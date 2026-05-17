# Release Gate

Use this gate for every production change that touches data lifecycle, uploads,
Edge Functions, auth, feed queries, notifications, or migrations.

## Before Deploy

- Confirm git status only contains intended files.
- Confirm Supabase migrations are committed in the migration repo when SQL was
  applied remotely.
- Confirm Edge Function deploy flags are documented. `r2-delete` must be
  deployed with `--no-verify-jwt` because it performs its own authorization.
- Confirm secrets exist without printing values:

```bash
supabase secrets list --project-ref llymwqfgujwkoxzqxrlm
```

## Deploy

```bash
supabase functions deploy r2-sign --project-ref llymwqfgujwkoxzqxrlm
supabase functions deploy r2-delete --project-ref llymwqfgujwkoxzqxrlm --no-verify-jwt
```

Run DB migrations from the linked Supabase migration repo:

```bash
cd /Users/zaurhatuev/vibes-app
supabase db push --dry-run
supabase db push
```

## After Deploy

Run:

```bash
cd /Users/zaurhatuev/Desktop/vibes-app
npm run smoke:production
```

Required pass criteria:

- TypeScript passes.
- Lint passes with zero warnings.
- Deno checks Edge Functions.
- Critical mutation audit passes.
- `r2-delete` is active.
- `processQueue` returns `ok: true`.
- `r2_delete_queue` has no failed rows.
- Critical DB integrity checks pass via `npm run check:integrity`.
- GitHub Actions `Stability Gates` is green.

## Rollback Trigger

Pause rollout and rollback or hotfix if any of these are true:

- `npm run smoke:production` fails.
- R2 queue has failed rows.
- pending R2 queue rows exceed `R2_QUEUE_MAX_PENDING`.
- Edge Function returns unexpected `4xx`/`5xx`.
- A client implements a direct critical mutation outside the approved hook/RPC.
- GitHub Actions cannot run production smoke because required repository secrets
  are missing.
