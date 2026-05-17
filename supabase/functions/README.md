# Supabase Edge Functions (Deno)

Diese Ordner werden **nicht** vom Expo-Frontend-`tsc` typgeprüft (`tsconfig.json` → `exclude`).

- Deploy & lokale Ausführung: [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- Typen: Deno-Projekt nutzt eigene `import` aus `https://` – in VS Code ggf. **Deno**-Extension für `index.ts` aktivieren.

## `r2-sign`

Erzeugt kurzlebige Cloudflare-R2-Presigned-URLs für die App-Uploads in `lib/uploadMedia.ts`.

## `r2-delete`

Entfernt R2-Objekte nach erfolgreicher Post-Löschung. Wird von `lib/usePostManagement.ts` best-effort aufgerufen.
Die Function prüft User-JWTs intern und kann zusätzlich mit `x-cleanup-secret`
für Admin-Reparaturen einzelner R2-Orphans genutzt werden. Deshalb mit
`--no-verify-jwt` deployen.
Wenn `r2_media_cleanup.sql` installiert ist, kann die Function mit
`{ "processQueue": true }` gelöschte Post-Medien aus der DB-Queue abarbeiten.

Benötigte Function-Secrets:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`
- `R2_CLEANUP_SECRET` (für Admin-Cleanup)
