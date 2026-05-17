# Stability Plan

This plan turns the November 2026 premortem into release gates. Each wave must
have an implementation artifact and a verification command before it is done.

## Wave 1: R2/Post Delete Lifecycle

Goal: deleting a post must not depend on a specific client cleaning up media.

Implemented:

- `supabase/r2_media_cleanup.sql` captures deleted post media in
  `public.r2_delete_queue`.
- `supabase/r2_media_cleanup_cron.sql` runs the queue processor every 5 minutes.
- `supabase/functions/r2-delete` processes queue rows and supports a protected
  `selfTest`.
- `scripts/verify-r2-cleanup.sh` verifies queue visibility, queue processing,
  and the deployed function.

Verification:

```bash
npm run verify:r2-cleanup
```

Status: confirmed on production.

## Wave 2: Deploy And Smoke Gates

Goal: no release should be called done until app checks, Edge Function checks,
and production smoke checks pass.

Implemented:

- `scripts/smoke-production.sh` runs TypeScript, lint, Deno Edge checks, and R2
  cleanup verification.
- `.github/workflows/stability-gates.yml` runs app gates on PR/push and weekly
  production smoke/integrity checks when repository secrets are configured.

Verification:

```bash
npm run smoke:production
```

Status: run before every deploy and after every production hotfix.

## Wave 3: Central Mutation Paths

Goal: Web and Mobile must not implement separate critical mutations.

Implemented:

- `supabase/post_mutation_rpcs.sql` defines canonical `create_post`,
  `update_post`, and `delete_post` RPCs.
- `lib/usePostManagement.ts` routes create, update, and delete through those
  RPCs.
- `scripts/audit-critical-mutations.sh` blocks direct `posts`
  insert/update/delete outside the central hook module.

Rules:

- Post creation, update, delete, media cleanup, scheduled publish, and push
  side effects must use shared RPC or Edge Function entrypoints.
- Client code may update UI state optimistically, but source-of-truth mutations
  belong server-side.
- Any direct `posts` insert/update/delete outside the approved hook/RPC path is
  a release blocker.

Verification:

```bash
npm run audit:mutations
```

## Wave 4: Monitoring

Goal: failures should be visible before users report them.

Watch:

- pending `r2_delete_queue` count
- oldest pending queue age
- `error` queue row count
- Edge Function 4xx/5xx rate
- failed push token writes
- feed RPC fallback rate

Initial manual query:

```sql
select
  count(*) filter (where status = 'pending') as pending,
  count(*) filter (where status = 'error') as error,
  min(created_at) filter (where status = 'pending') as oldest_pending
from public.r2_delete_queue;
```

Automated check:

```bash
npm run health:r2-queue
npm run check:integrity
```

Limit: full R2 bucket orphan scanning requires Cloudflare bucket listing
credentials in the production ops environment. The current gate verifies DB-side
integrity and R2 delete queue health.

## Wave 5: Release Discipline

Goal: every change that touches data lifecycle ships with rollback and proof.

Release gate:

- migration committed in the Supabase migration repo
- Edge Functions deployed with documented flags
- secrets verified without printing values
- `npm run smoke:production` passes
- post-release smoke result pasted into the release notes
- GitHub Actions `Stability Gates` is green for PR/push changes.

Runbook: `docs/RELEASE_GATE.md`.
